import { Component, DebugElement, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { ApplicationStore } from '@core/state/application.store';
import { Application, Evaluation, EvaluationAnswers, EvaluationReference } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { DECK_CONSENT_ERROR } from '@core/utils/rules';
import { MultiSelect } from '@ui/multi-select';
import { SearchSelect } from '@ui/search-select';
import { StepPage } from '@layout/step-page';
import { companyRoutes } from '../../company.routes';
import { DeckUploadPage } from './deck-upload';

/** The page frame without its header, stepper and side panel. */
@Component({ selector: 'app-step-page', template: '<ng-content />' })
class FrameStub {
  readonly step = input<number>();
  readonly part = input<number>();
  readonly parts = input<number>();
  readonly sub = input<string>();
  readonly ctx = input<string>();
  readonly label = input<string>();
  readonly width = input<number>();
}

const LIMITS = { deckMaxMb: 25, cvMaxMb: 5, deckMinPages: 3, deckMaxPages: 40, summaryMin: 50, summaryMax: 2000 };

/** Two groups, three activities; `linked: false` is an API built before `groupId`. */
function reference(linked: boolean): EvaluationReference {
  const g = (groupId: number) => (linked ? { groupId } : {});
  return {
    activityGroups: [{ id: 1, label: 'Yazılım ve BT' }, { id: 2, label: 'Finans ve Ödeme Hizmetleri' }],
    activities: [{ id: 3, label: 'Yapay Zekâ Odaklı Yazılım', ...g(1) }, { id: 11, label: 'ERP Yazılımı', ...g(1) }, { id: 40, label: 'Dijital Bankacılık', ...g(2) }],
    businessModels: [], revenueModels: [], productTypes: [], limits: LIMITS,
  };
}

/** Only what D-1a reads from the store; no API behind it. */
function fakeStore(ref: EvaluationReference) {
  return {
    app: signal({ id: 'DS-26-00000001', stage: 'verified', marks: {} }), busy: signal(false), error: signal(null), fieldErrors: signal({ activityId: ['Seçilen faaliyet alanı, seçilen faaliyet grubuna ait değildir.'] }),
    reference: signal({ sectors: [], funding: [], naceCodes: [{ code: '62.10.00', title: 'Yazılım ve bilgisayar programlama', translationKey: 'nace.software_programming' }, { code: '63.10.00', title: 'Bulut bilişim, barındırma ve veri işleme', translationKey: 'nace.cloud_hosting_data_processing' }] }), evaluationReference: signal(ref), stage: signal('verified'), founderType: signal('foreign'), title: signal(''), fullTitle: signal(''), signedIn: signal(true),
    clearError: () => undefined, loadReference: async () => undefined, loadEvaluationReference: async () => undefined,
  };
}

/** The screen's protected members the test drives, as the template does. */
interface D1aView {
  answers(): EvaluationAnswers;
  activityOptions(): { value: string; label: string }[];
  setChoice(key: 'activityGroupId' | 'activityId', value: string): void;
}

async function screen(linked: boolean, evaluation?: Evaluation) {
  const store = fakeStore(reference(linked));
  // An ended evaluation means a deck was uploaded before.
  if (evaluation) store.app.set({ ...store.app(), evaluation, deck: { fileName: 'sunum.pdf', sizeKb: 4 } } as ReturnType<typeof store.app>);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApplicationStore, useValue: store }] });
  TestBed.overrideComponent(DeckUploadPage, { remove: { imports: [StepPage] }, add: { imports: [FrameStub] } });
  const fixture = TestBed.createComponent(DeckUploadPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { d: fixture.componentInstance as unknown as D1aView, store, el, notice: () => el.querySelector('.wz-notice')?.textContent ?? '', profileLink: () => el.querySelector('a[href="/details"]')?.textContent ?? '' };
}

const ended = (status: Evaluation['status'], reason: Evaluation['reason'] = null): Evaluation =>
  ({ status, attempt: 1, maxAttempts: 3, startedAt: '2026-11-26T12:02:00+00:00', finishedAt: '2026-11-26T12:05:00+00:00', reason });

const ids = (d: D1aView) => d.activityOptions().map((o) => o.value);

describe('D-1a activity group and activity', () => {
  it('the group is fixed to Yazılım ve BT, read-only, and narrows the activities to its own', async () => {
    const { d, el } = await screen(true);
    expect(d.answers()).toMatchObject({ activityGroupId: 1, activityId: null });
    expect(ids(d)).toEqual(['3', '11']);
    const group = el.querySelector<HTMLInputElement>('input[aria-label="Faaliyet grubu"]')!;
    expect(group.readOnly).toBe(true);
    expect(group.value).toBe('Yazılım ve BT');

    d.setChoice('activityId', '11');
    expect(d.answers()).toMatchObject({ activityGroupId: 1, activityId: 11 });
  });

  it('without groupId from the API nothing is filtered or linked', async () => {
    const { d } = await screen(false);
    d.setChoice('activityGroupId', '2');
    expect(ids(d)).toEqual(['3', '11', '40']);
    d.setChoice('activityId', '3');
    expect(d.answers()).toMatchObject({ activityGroupId: 2, activityId: 3 });
  });
});

describe('D-1a notice after an ended evaluation', () => {
  it('rejected because the form does not match the deck: says which answers to correct, not the page rule', async () => {
    const { notice } = await screen(true, ended('rejected', 'formDeckConflict'));
    expect(notice()).toContain('Form yanıtlarınız sunumunuzla uyuşmuyor');
    expect(notice()).toContain('gelir modeli');
    expect(notice()).not.toContain('40 sayfa');
  });

  it('the profile can be opened again after an ended evaluation, because the brand may be what conflicts', async () => {
    const { notice, profileLink } = await screen(true, ended('rejected', 'formDeckConflict'));
    expect(notice()).toContain('Marka adınızı (Ön bilgiler)');
    expect(profileLink()).toContain('Ön bilgileri düzenle');
  });

  it('rejected without a known reason: the general notice', async () => {
    const { notice } = await screen(true, ended('rejected'));
    expect(notice()).toContain('Sunumunuz değerlendirmeye alınamadı');
    expect(notice()).toContain('3 ile 40 sayfa');
  });

  it('failed: its own notice; no evaluation: none', async () => {
    expect((await screen(true, ended('failed'))).notice()).toContain('Önceki değerlendirme tamamlanamadı');
    TestBed.resetTestingModule();
    expect((await screen(true)).notice()).toBe('');
  });
});

// ------------------------------------------------------------------------------------------------
// Through the router, with the real store (mock and HTTP mode), driven through the page's DOM.

const routes = [...companyRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

/** A file of the given name and size (the bytes are not read). */
function file(name: string, size: number, type = 'application/pdf') {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

const MB = 1024 * 1024;
const SUMMARY = 'Lumora, küçük işletmelere bulut tabanlı veri analitiği sunar; abonelik ile gelir elde eder.';

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/deck');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const debug = () => harness.routeDebugElement as DebugElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const submit = () => root().querySelector<HTMLButtonElement>('form button[type=submit]')!;
  const files = () => [...root().querySelectorAll<HTMLInputElement>('input[type=file]')];
  /** Picks a file in the deck's (0) or the CV's (1) hidden input. */
  const choose = (which: 0 | 1, f: File) => {
    const input = files()[which];
    Object.defineProperty(input, 'files', { configurable: true, value: [f] });
    input.dispatchEvent(new Event('change'));
    harness.detectChanges();
  };
  const summary = (value: string) => {
    const t = root().querySelector<HTMLTextAreaElement>('textarea')!;
    t.value = value;
    t.dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  const activity = (id: number | '') => {
    (debug().query(By.directive(SearchSelect)).componentInstance as SearchSelect).value.set(String(id));
    harness.detectChanges();
  };
  /** The three multiple choices in the form's order: business, revenue, product. */
  const multi = (n: 0 | 1 | 2, ids: number[]) => {
    (debug().queryAll(By.directive(MultiSelect))[n].componentInstance as MultiSelect).value.set(ids.map(String));
    harness.detectChanges();
  };
  const boxes = () => [...root().querySelectorAll<HTMLInputElement>('app-deck-consents input[type=checkbox]')];
  const tick = (n: 0 | 1) => {
    const box = boxes()[n];
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    harness.detectChanges();
  };
  /** The error line inside the field whose label starts with `label`. */
  const errorAt = (label: string) => {
    const field = [...root().querySelectorAll('.wz-field')].find((f) => f.textContent?.trim().startsWith(label));
    return field?.querySelector('.wz-fielderr')?.textContent?.trim() ?? null;
  };
  const fieldErrors = () => [...root().querySelectorAll('.wz-fielderr')].map((e) => e.textContent?.trim());
  const alerts = () => [...root().querySelectorAll('[role=alert]')].map((e) => e.textContent?.trim());
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    harness.detectChanges();
  };
  /** Every field valid; the ticks are left alone. */
  const fill = (ref: EvaluationReference) => {
    choose(0, file('Lumora Sunum.pdf', 2 * MB));
    choose(1, file('Ozgecmis.pdf', 300_000));
    summary(SUMMARY);
    activity(ref.activities.find((a) => a.groupId === 1 || a.groupId === undefined)!.id);
    multi(0, [ref.businessModels[0].id]);
    multi(1, [ref.revenueModels[0].id, ref.revenueModels[1].id]);
    multi(2, [ref.productTypes[1].id]);
  };
  return { harness, root, q, submit, files, choose, summary, activity, multi, boxes, tick, errorAt, fieldErrors, alerts, settle, fill };
}

/** D-1a against the mock API. */
describe('DeckUploadPage (D-1a), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('verified');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    store.fieldErrors.set({ deck: ['Eski.'] });
    const page = await open();
    expect(store.error()).toBeNull();
    expect(store.fieldErrors()).toEqual({});
    expect(page.alerts()).toEqual([]);
  });

  it('a first upload: no notice, both ticks unticked, the limits from the evaluation reference, "Ön bilgileri düzenle"', async () => {
    const page = await open();
    expect(page.q('h1')).toBe('Sunumunuzu ve özgeçmişinizi yükleyiniz');
    expect(page.root().querySelector('.wz-notice')).toBeNull();
    expect(page.boxes().map((b) => b.checked)).toEqual([false, false]);
    expect([...page.root().querySelectorAll('.wz-pick span')].map((s) => s.textContent?.trim())).toEqual(['PDF, 3–40 sayfa, en fazla 25 MB', 'PDF, en fazla 5 MB']);
    expect(page.files().map((f) => f.accept)).toEqual(['.pdf,application/pdf', '.pdf,application/pdf']);
    expect(page.root().querySelector<HTMLInputElement>('input[aria-label="Faaliyet grubu"]')!.value).toBe('Yazılım ve BT');
    expect(page.root().querySelector('form .end a[href="/details"]')?.textContent?.trim()).toBe('Ön bilgileri düzenle');
    expect(page.submit().textContent?.trim()).toBe('Gönder ve değerlendirmeyi başlat');
    expect(page.submit().disabled).toBe(false);
  });

  it('a file is checked as soon as it is chosen (type, size); the input is emptied for the same file again', async () => {
    const page = await open();
    page.choose(0, file('sunum.pptx', 1_000, 'application/vnd.ms-powerpoint'));
    expect(page.errorAt('Sunum')).toBe('Sunum PDF biçiminde olmalıdır.');
    expect(page.q('.wz-pick strong')).toBe('sunum.pptx');
    expect(page.files()[0].value).toBe('');
    page.choose(0, file('sunum.pdf', 25 * MB + 1));
    expect(page.errorAt('Sunum')).toBe('Sunum dosyası 25 MB’tan büyük olamaz.');
    page.choose(0, file('sunum.pdf', 25 * MB));
    expect(page.errorAt('Sunum')).toBeNull();
    page.choose(0, file('bos.pdf', 0));
    expect(page.errorAt('Sunum')).toBe('Sunum dosyanızı yükleyiniz.');

    page.choose(1, file('cv.docx', 1_000, 'application/msword'));
    expect(page.errorAt('Özgeçmiş')).toBe('Özgeçmiş PDF biçiminde olmalıdır.');
    page.choose(1, file('cv.pdf', 5 * MB + 1));
    expect(page.errorAt('Özgeçmiş')).toBe('Özgeçmiş dosyası 5 MB’tan büyük olamaz.');
    page.choose(1, file('cv.PDF', 5 * MB));
    expect(page.errorAt('Özgeçmiş')).toBeNull();
    // Only the file's own line: the other fields wait for "Gönder".
    expect(page.fieldErrors()).toEqual(['Sunum dosyanızı yükleyiniz.']);
  });

  it('"Gönder" with nothing filled: a message at every field and the consent message; nothing is sent', async () => {
    const upload = vi.spyOn(TestBed.inject(Api), 'uploadDeck');
    const page = await open();
    page.submit().click();
    page.harness.detectChanges();
    expect(page.errorAt('Sunum')).toBe('Sunum dosyanızı yükleyiniz.');
    expect(page.errorAt('Özgeçmiş')).toBe('Özgeçmişinizi yükleyiniz.');
    expect(page.errorAt('Kısa özet')).toBe('Özet en az 50 karakter olmalıdır.');
    expect(page.errorAt('Faaliyet grubu')).toBeNull();
    expect(page.errorAt('Faaliyet alanı')).toBe('Faaliyet alanını seçiniz.');
    expect(page.errorAt('İş modeli')).toBe('En az bir iş modeli seçiniz.');
    expect(page.errorAt('Gelir modeli')).toBe('En az bir gelir modeli seçiniz.');
    expect(page.errorAt('Ürün türü')).toBe('En az bir ürün türü seçiniz.');
    expect(page.alerts()).toContain(DECK_CONSENT_ERROR);
    expect(upload).not.toHaveBeenCalled();
  });

  it('each answer\'s message goes when that answer is changed', async () => {
    const page = await open();
    const ref = store.evaluationReference()!;
    page.submit().click();
    page.harness.detectChanges();
    page.summary('kısa');
    expect(page.errorAt('Kısa özet')).toBeNull();
    page.multi(0, [ref.businessModels[0].id]);
    expect(page.errorAt('İş modeli')).toBeNull();
    page.multi(1, [ref.revenueModels[0].id]);
    expect(page.errorAt('Gelir modeli')).toBeNull();
    page.multi(2, [ref.productTypes[0].id]);
    expect(page.errorAt('Ürün türü')).toBeNull();
    page.activity(ref.activities.find((a) => a.groupId === 1)!.id);
    expect(page.errorAt('Faaliyet alanı')).toBeNull();
  });

  it('the summary\'s count: the minimum until reached, then the maximum; over the maximum it is marked', async () => {
    const page = await open();
    expect(page.q('.wz-count')).toBe('0 / 2000 karakter · en az 50');
    page.summary('  ' + 'a'.repeat(49) + '  ');
    expect(page.q('.wz-count')).toBe('49 / 2000 karakter · en az 50');
    page.summary('a'.repeat(50));
    expect(page.q('.wz-count')).toBe('50 / 2000 karakter');
    expect(page.root().querySelector('.wz-count')!.classList.contains('over')).toBe(false);
    page.summary('a'.repeat(2001));
    expect(page.root().querySelector('.wz-count')!.classList.contains('over')).toBe(true);
    page.submit().click();
    page.harness.detectChanges();
    expect(page.errorAt('Kısa özet')).toBe('Özet en fazla 2000 karakter olabilir.');
  });

  it('the activities offered are the fixed group\'s only', async () => {
    const page = await open();
    const ref = store.evaluationReference()!;
    const offered = (page.harness.routeDebugElement!.query(By.directive(SearchSelect)).componentInstance as SearchSelect).options().map((o) => o.value);
    expect(offered).toEqual(ref.activities.filter((a) => a.groupId === 1).map((a) => String(a.id)));
    expect(offered.length).toBeGreaterThan(0);
    expect((page.harness.routeDebugElement!.query(By.directive(SearchSelect)).componentInstance as SearchSelect).placeholder()).toBe('Seçiniz');
  });

  it('the two ticks: refused with the consent message until both are ticked; the message goes once both are, without sending', async () => {
    const upload = vi.spyOn(TestBed.inject(Api), 'uploadDeck');
    const page = await open();
    page.fill(store.evaluationReference()!);
    page.submit().click();
    page.harness.detectChanges();
    expect(page.alerts()).toEqual([DECK_CONSENT_ERROR]);
    expect(upload).not.toHaveBeenCalled();

    page.tick(0);
    expect(page.alerts()).toEqual([DECK_CONSENT_ERROR]);
    page.submit().click();
    page.harness.detectChanges();
    expect(page.alerts()).toEqual([DECK_CONSENT_ERROR]);
    expect(upload).not.toHaveBeenCalled();

    page.tick(1);
    expect(page.alerts()).toEqual([]);
    expect(upload).not.toHaveBeenCalled();

    // Unticked again: no message until the next "Gönder".
    page.tick(1);
    expect(page.alerts()).toEqual([]);
    page.submit().click();
    page.harness.detectChanges();
    expect(page.alerts()).toEqual([DECK_CONSENT_ERROR]);
    expect(upload).not.toHaveBeenCalled();
  });

  it('only the AI tick: refused the same way', async () => {
    const upload = vi.spyOn(TestBed.inject(Api), 'uploadDeck');
    const page = await open();
    page.fill(store.evaluationReference()!);
    page.tick(1);
    page.submit().click();
    page.harness.detectChanges();
    expect(page.alerts()).toEqual([DECK_CONSENT_ERROR]);
    expect(upload).not.toHaveBeenCalled();
  });

  it('sends the chosen files, the answers and exactly the two ticks given; the evaluation screen opens', async () => {
    const upload = vi.spyOn(TestBed.inject(Api), 'uploadDeck');
    const page = await open();
    const ref = store.evaluationReference()!;
    const deck = file('Lumora Sunum.pdf', 2 * MB);
    const cv = file('Ozgecmis.pdf', 300_000);
    page.fill(ref);
    page.choose(0, deck);
    page.choose(1, cv);
    page.tick(0);
    page.tick(1);
    page.submit().click();
    expect(upload).toHaveBeenCalledWith(
      { deck, cv },
      {
        summary: SUMMARY,
        activityGroupId: 1,
        activityId: ref.activities.find((a) => a.groupId === 1)!.id,
        businessModelIds: [ref.businessModels[0].id],
        revenueModelIds: [ref.revenueModels[0].id, ref.revenueModels[1].id],
        productTypeIds: [ref.productTypes[1].id],
      },
      { noticeAcknowledged: true, aiConsent: true },
    );
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/evaluating'));
    expect(store.app()!.deck!.fileName).toBe('Lumora Sunum.pdf');
    expect(store.app()!.cv!.fileName).toBe('Ozgecmis.pdf');
  });

  it('shows "Gönderiliyor…" and disables the button while sending', async () => {
    const page = await open();
    store.busy.set(true);
    page.harness.detectChanges();
    expect(page.submit().textContent?.trim()).toBe('Gönderiliyor…');
    expect(page.submit().disabled).toBe(true);
    store.busy.set(false);
  });
});

/** D-1a in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('DeckUploadPage (D-1a), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (view: unknown) => toApplication(view as never, account);

  function setUp(app: Application, calls: Record<string, unknown> = {}) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = {
      demo: null,
      work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen },
      restore: async () => ({ account, app }),
      reference: vi.fn(async () => CAPTURED.reference),
      evaluationReference: vi.fn(async () => CAPTURED.referenceEvaluation),
      ...calls,
    };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T14:20:00Z')) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return { store, api };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('reads both references once; the captured dictionary links no activity to a group, so all are offered with a search', async () => {
    const { api } = setUp(map(CAPTURED.verified));
    const page = await open();
    expect(api.reference).toHaveBeenCalledTimes(1);
    expect(api.evaluationReference).toHaveBeenCalledTimes(1);
    const select = page.harness.routeDebugElement!.query(By.directive(SearchSelect)).componentInstance as SearchSelect;
    expect(select.options().map((o) => o.value)).toEqual(CAPTURED.referenceEvaluation.activities.map((a) => String(a.id)));
    expect(select.placeholder()).toBe('Aramak için yazınız');
    expect(page.root().querySelector('.wz-notice')).toBeNull();
    expect(page.root().querySelector('form .end a[href="/details"]')).not.toBeNull();
  });

  it('until the evaluation reference arrives "Gönder" is disabled and the hints show the usual limits', async () => {
    setUp(map(CAPTURED.verified), { evaluationReference: () => new Promise(() => undefined) });
    const page = await open();
    expect(page.submit().disabled).toBe(true);
    expect([...page.root().querySelectorAll('.wz-pick span')].map((s) => s.textContent?.trim())).toEqual(['PDF, 3–40 sayfa, en fazla 25 MB', 'PDF, en fazla 5 MB']);
    expect(page.q('.wz-count')).toBe('0 karakter');
    // A file is taken but not checked without limits.
    page.choose(0, file('sunum.pptx', 1_000));
    expect(page.fieldErrors()).toEqual([]);
  });

  it('after a failed evaluation: its notice, and the profile can be changed again', async () => {
    setUp(map(CAPTURED.evaluationFailed));
    const page = await open();
    expect(page.q('.wz-notice')).toBe('Önceki değerlendirme tamamlanamadı Değerlendirme hizmeti başvurunuzu sonuçlandıramadı. Lütfen sunumunuzu ve özgeçmişinizi yeniden yükleyiniz.');
    expect(page.root().querySelector('form .end a[href="/details"]')).not.toBeNull();
    // Nothing is carried over from the last upload.
    expect(page.boxes().map((b) => b.checked)).toEqual([false, false]);
    expect(page.q('.wz-pick strong')).toBe('Sunum dosyasını seçiniz');
  });

  it('after a cancelled evaluation: its notice', async () => {
    const app = map(CAPTURED.evaluationFailed);
    setUp({ ...app, evaluation: { ...app.evaluation!, status: 'cancelled' } });
    const page = await open();
    expect(page.q('.wz-notice')).toBe('Önceki değerlendirme iptal edildi Devam etmek için sunumunuzu ve özgeçmişinizi yeniden yükleyiniz.');
  });

  it('sends the files, answers and both ticks; follows the API to the evaluation screen', async () => {
    const uploadDeck = vi.fn(async () => map(CAPTURED.evaluating));
    setUp(map(CAPTURED.verified), { uploadDeck });
    const page = await open();
    page.fill(CAPTURED.referenceEvaluation);
    page.tick(0);
    page.tick(1);
    page.submit().click();
    expect(uploadDeck).toHaveBeenCalledTimes(1);
    expect((uploadDeck.mock.calls[0] as unknown[])[2]).toEqual({ noticeAcknowledged: true, aiConsent: true });
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/evaluating'));
  });

  it('the API\'s refusal: each sentence at its field (the screen\'s own checks passed), the title under the form; the ticks stay', async () => {
    const uploadDeck = vi.fn(async () => {
      throw new ApiError('Gönderdiğiniz bilgiler eksik veya hatalıdır.', {
        code: 'validation_failed',
        status: 400,
        fields: { deck: ['Sunum okunamadı.'], cv: ['Özgeçmiş okunamadı.'], summary: ['Özet uygun değil.'], activityId: ['Seçilen faaliyet alanı, seçilen faaliyet grubuna ait değildir.'], revenueModelIds: ['Gelir modeli geçersiz.'] },
      });
    });
    setUp(map(CAPTURED.verified), { uploadDeck });
    const page = await open();
    page.fill(CAPTURED.referenceEvaluation);
    page.tick(0);
    page.tick(1);
    page.submit().click();
    await page.settle();
    expect(page.errorAt('Sunum')).toBe('Sunum okunamadı.');
    expect(page.errorAt('Özgeçmiş')).toBe('Özgeçmiş okunamadı.');
    expect(page.errorAt('Kısa özet')).toBe('Özet uygun değil.');
    expect(page.errorAt('Faaliyet alanı')).toBe('Seçilen faaliyet alanı, seçilen faaliyet grubuna ait değildir.');
    expect(page.errorAt('Gelir modeli')).toBe('Gelir modeli geçersiz.');
    expect(page.alerts()).toContain('Gönderdiğiniz bilgiler eksik veya hatalıdır.');
    expect(page.boxes().map((b) => b.checked)).toEqual([true, true]);
    expect(TestBed.inject(Router).url).toBe('/deck');

    // Choosing another activity takes the API's sentence away too; a summary typed again only the screen's own.
    page.activity(CAPTURED.referenceEvaluation.activities[1].id);
    expect(page.errorAt('Faaliyet alanı')).toBeNull();
    page.summary(SUMMARY + ' Ek.');
    expect(page.errorAt('Kısa özet')).toBe('Özet uygun değil.');
  });

  it('the API refusing for want of the ticks: its sentence under the form', async () => {
    const uploadDeck = vi.fn(async () => {
      throw new ApiError(DECK_CONSENT_ERROR, { code: 'consent_required', status: 400 });
    });
    setUp(map(CAPTURED.verified), { uploadDeck });
    const page = await open();
    page.fill(CAPTURED.referenceEvaluation);
    page.tick(0);
    page.tick(1);
    page.submit().click();
    await page.settle();
    expect(page.alerts()).toEqual([DECK_CONSENT_ERROR]);
  });
});
