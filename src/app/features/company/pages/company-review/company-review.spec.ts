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
import { Application, FUNDING_LABELS } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { tl0 } from '@core/utils/format';
import { CountrySelect } from '@ui/country-select';
import { PhoneInput } from '@ui/phone-input';
import { Select } from '@ui/select';
import { StepPage } from '@layout/step-page';
import { companyRoutes } from '../../company.routes';
import { CompanyReviewPage } from './company-review';

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

const APP = {
  id: 'DS-26-00000001',
  stage: 'review',
  marks: {},
  founder: { firstName: 'Ayşe', lastName: 'Kaya', nationality: 'Almanya' },
  company: { brand: 'Lumora', logo: '', nace: [], suggestedNace: [], capital: 250000 },
  contact: { email: 'ayse@example.test', phone: '+49 151 2345 6700', address: 'Hauptstr. 1', postalCode: '10115', country: 'Almanya' },
  funding: 'own-abroad',
};

/** Only what D-1c reads from the store; no API behind it. */
function fakeStore() {
  return {
    app: signal(APP), busy: signal(false), error: signal(null), fieldErrors: signal({}), reference: signal(null), evaluationReference: signal(null),
    stage: signal('review'), founderType: signal('foreign'), title: signal(''), fullTitle: signal(''), signedIn: signal(true),
    clearError: () => undefined, loadReference: async () => undefined, loadEvaluationReference: async () => undefined,
    updateReview: async () => true, submitReview: async () => true,
  };
}

describe('D-1c company form', () => {
  it('opens a left-column editor right under its row, focuses it, and gives focus back on close', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ApplicationStore, useValue: fakeStore() }] });
    TestBed.overrideComponent(CompanyReviewPage, { remove: { imports: [StepPage] }, add: { imports: [FrameStub] } });
    const fixture = TestBed.createComponent(CompanyReviewPage);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    // "Faaliyet" is the third row: the left column of the second line.
    const pencil = el.querySelector<HTMLButtonElement>('[aria-label="Faaliyet bilgisini düzelt"]')!;
    const row = pencil.closest('.row')!;
    expect([...el.querySelectorAll('.rows > .row')].indexOf(row)).toBe(2);
    pencil.click();
    await fixture.whenStable();

    const slot = row.nextElementSibling!;
    expect(slot.classList).toContain('slot');
    expect(slot.querySelector('#rv-nace')).not.toBeNull();
    expect(el.querySelectorAll('.slot').length).toBe(1);
    expect(el.querySelector('.rows')!.lastElementChild).not.toBe(slot);
    expect(pencil.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.id).toBe('rv-nace');

    [...slot.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Kapat')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.slot')).toBeNull();
    expect(document.activeElement).toBe(pencil);
    fixture.nativeElement.remove();
  });
});

// ------------------------------------------------------------------------------------------------
// Through the router, with the real store (mock and HTTP mode), driven through the page's DOM.

const routes = [...companyRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/deck/review');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const debug = () => harness.routeDebugElement as DebugElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  /** Each row as [label, value, mark]; the mark is "Kontrol edildi", "Ön bilgilerinizden" or "". */
  const rows = () =>
    [...root().querySelectorAll('.rows > .row')].map((r) => {
      const em = r.querySelector('dt em')?.textContent?.trim() ?? '';
      const dt = r.querySelector('dt')!.textContent!.trim();
      return [em ? dt.slice(0, -em.length) : dt, r.querySelector('dd')!.textContent!.trim(), em];
    });
  const rowError = (label: string) =>
    [...root().querySelectorAll('.rows > .row')].find((r) => r.querySelector('dt')!.textContent!.trim().startsWith(label))?.querySelector('.wz-fielderr')?.textContent?.trim() ?? null;
  const pencils = () => [...root().querySelectorAll<HTMLButtonElement>('.rows > .row button')].map((b) => b.getAttribute('aria-label'));
  const pencil = (label: string) => {
    root().querySelector<HTMLButtonElement>(`[aria-label="${label} bilgisini düzelt"]`)!.click();
    harness.detectChanges();
  };
  const slot = () => root().querySelector<HTMLElement>('.slot');
  const slotButton = (label: string) => [...(slot()?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === label);
  /** Types into a plain text box of the open editor, found by its label. */
  const typeIn = (label: string, value: string) => {
    const field = [...slot()!.querySelectorAll('label.wz-field')].find((l) => l.textContent?.trim().startsWith(label))!;
    const input = field.querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  const inputValue = (label: string) =>
    [...slot()!.querySelectorAll('label.wz-field')].find((l) => l.textContent?.trim().startsWith(label))!.querySelector('input')!.value;
  const control = <T>(type: new (...args: never[]) => T, n = 0) => debug().queryAll(By.directive(type))[n].componentInstance as T & { value: { set(v: unknown): void; (): unknown } };
  const pick = <T>(type: new (...args: never[]) => T, value: unknown, n = 0) => {
    control(type, n).value.set(value);
    harness.detectChanges();
  };
  const fieldErrors = () => [...root().querySelectorAll('.wz-fielderr')].map((e) => e.textContent?.trim());
  const alerts = () => [...root().querySelectorAll('[role=alert]')].map((e) => e.textContent?.trim());
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    harness.detectChanges();
  };
  return { harness, root, q, button, rows, rowError, pencils, pencil, slot, slotButton, typeIn, inputValue, control, pick, fieldErrors, alerts, settle };
}

/** D-1c against the mock API: the demo founder right after the evaluation (defaults from the profile). */
describe('CompanyReviewPage (D-1c), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('review');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    store.fieldErrors.set({ given_name: ['Eski.'] });
    const page = await open();
    expect(store.error()).toBeNull();
    expect(page.fieldErrors()).toEqual([]);
  });

  it('every value as a row; the profile\'s and the account\'s marked "Ön bilgilerinizden"; pencils on the editable ones only', async () => {
    const a = store.app()!;
    const page = await open();
    const name = `${a.founder.firstName} ${a.founder.lastName}`;
    const nace = a.company.nace.map((c) => store.reference()!.naceCodes.find((n) => n.code === c)?.title ?? c).join(', ');
    expect(page.rows()).toEqual([
      ['Şirket unvanı', store.fullTitle(), 'Ön bilgilerinizden'],
      ['Kurucu', name, 'Ön bilgilerinizden'],
      ['Faaliyet', nace, 'Ön bilgilerinizden'],
      ['Uyruk', a.founder.nationality, 'Ön bilgilerinizden'],
      ['Şirket türü', 'Tek pay sahipli anonim şirket', ''],
      ['Pay sahipliği', `%100, ${name}`, ''],
      ['Sermaye', tl0(250_000), ''],
      ['Sermaye kaynağı', FUNDING_LABELS[a.funding], 'Ön bilgilerinizden'],
      ['E-posta', a.contact.email, 'Ön bilgilerinizden'],
      ['Telefon', a.contact.phone, 'Ön bilgilerinizden'],
      ['Adres', [a.contact.address, a.contact.postalCode, a.contact.country].filter((x) => x?.trim()).join(', '), 'Ön bilgilerinizden'],
      ['Merkez adresi', 'Terminal İstanbul sanal ofisi, Gebze / Kocaeli', ''],
    ]);
    expect(page.pencils()).toEqual(['Şirket unvanı', 'Kurucu', 'Faaliyet', 'Uyruk', 'Sermaye kaynağı', 'E-posta', 'Telefon', 'Adres'].map((l) => `${l} bilgisini düzelt`));
    expect(page.q('.wz-chip')).toBe('Sunumunuz değerlendirildi');
    expect(page.q('header.co b')).toBe(a.company.brand);
    expect(page.q('header.co .mono')).toBe(a.company.brand.slice(0, 1).toLocaleUpperCase('tr-TR'));
    expect(page.button('Başka unvan seç')).toBeUndefined();
    // The deck no longer fills the form: no second upload and no comparison with the deck here.
    expect(page.button('Başka dosya yükle')).toBeUndefined();
    expect(page.root().querySelector('app-deck-consents')).toBeNull();
  });

  it('the title editor: the title without its suffix, saved on change with "A.Ş." taken off', async () => {
    const update = vi.spyOn(TestBed.inject(Api), 'updateReview');
    const page = await open();
    page.pencil('Şirket unvanı');
    const input = page.slot()!.querySelector<HTMLInputElement>('#rv-title')!;
    expect(input.value).toBe(store.title());
    expect(page.slot()!.querySelector('small')!.textContent).toContain(`Ön bilgilerinizdeki marka adı: “${store.app()!.company.brand}”.`);
    input.value = 'Nova Veri Teknolojileri A.Ş.';
    input.dispatchEvent(new Event('change'));
    expect(update).toHaveBeenCalledWith({ company: { root: 'Nova', activity: 'Veri Teknolojileri' } }, ['title']);
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.rows()[0]).toEqual(['Şirket unvanı', 'Nova Veri Teknolojileri Anonim Şirketi', 'Kontrol edildi']);
    });
    page.slotButton('Kapat')!.click();
    page.harness.detectChanges();
    expect(page.slot()).toBeNull();
  });

  it('the NACE editor: the codes as chips, search among the accepted codes, the profile\'s codes suggested once removed', async () => {
    const update = vi.spyOn(TestBed.inject(Api), 'updateReview');
    const page = await open();
    const codes = store.app()!.company.nace;
    page.pencil('Faaliyet');
    expect([...page.slot()!.querySelectorAll('.codes b')].map((b) => b.textContent)).toEqual(codes);
    expect(page.slot()!.querySelector('.opts')).toBeNull(); // every suggestion is chosen already
    expect(page.q('.purpose')).toMatch(/^Şirket konusu: /);

    page.slot()!.querySelector<HTMLButtonElement>(`[aria-label="${codes[0]} kodunu kaldır"]`)!.click();
    expect(update).toHaveBeenLastCalledWith({ company: { nace: codes.slice(1) } }, ['nace']);
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.slot()!.querySelectorAll('.codes b').length).toBe(codes.length - 1);
    });
    expect([...page.slot()!.querySelectorAll('.opts li')].map((li) => [li.querySelector('b')!.textContent, li.querySelector('em')?.textContent])).toEqual([[codes[0], 'Faaliyet alanınıza uygun']]);

    const search = page.slot()!.querySelector<HTMLInputElement>('#rv-nace')!;
    search.value = 'yazılım';
    search.dispatchEvent(new Event('input'));
    page.harness.detectChanges();
    const found = [...page.slot()!.querySelectorAll('.opts li')];
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(5);
    expect(found.every((li) => !li.querySelector('em'))).toBe(true);
    const code = found[0].querySelector('b')!.textContent!;
    found[0].querySelector('button')!.click();
    expect(update).toHaveBeenLastCalledWith({ company: { nace: [...codes.slice(1), code] } }, ['nace']);
    page.harness.detectChanges();
    expect(search.value).toBe('');
  });

  it('the founder editor: opens with the values, saves them, closes, and marks the rows "Kontrol edildi"', async () => {
    const update = vi.spyOn(TestBed.inject(Api), 'updateReview');
    const a = store.app()!;
    const page = await open();
    page.pencil('Kurucu');
    expect(page.inputValue('Ad')).toBe(a.founder.firstName);
    expect(page.inputValue('Soyad')).toBe(a.founder.lastName);
    expect(page.control(CountrySelect).value()).toBe(a.founder.nationality);
    page.typeIn('Soyad', 'Kaya-Berg');
    page.pick(CountrySelect, 'Avusturya');
    page.slotButton('Kaydet')!.click();
    expect(update).toHaveBeenCalledWith({ founder: { firstName: a.founder.firstName, lastName: 'Kaya-Berg', nationality: 'Avusturya' } }, ['name']);
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.slot()).toBeNull();
    });
    expect(page.rows()[1]).toEqual(['Kurucu', `${a.founder.firstName} Kaya-Berg`, 'Kontrol edildi']);
    expect(page.rows()[3]).toEqual(['Uyruk', 'Avusturya', 'Kontrol edildi']);
  });

  it('the contact editor opens from any of its three rows, saves the five values', async () => {
    const update = vi.spyOn(TestBed.inject(Api), 'updateReview');
    const a = store.app()!;
    const page = await open();
    page.pencil('Telefon');
    expect(page.inputValue('E-posta')).toBe(a.contact.email);
    expect(page.control(PhoneInput).value()).toBe(a.contact.phone);
    // Another of its rows moves it there and keeps what was typed.
    page.typeIn('Adres', 'Torstraße 45, Berlin');
    page.pencil('Adres');
    expect(page.slot()!.previousElementSibling!.querySelector('dt')!.textContent).toContain('Adres');
    expect(page.inputValue('Adres')).toBe('Torstraße 45, Berlin');
    page.typeIn('Posta kodu', '10119');
    page.slotButton('Kaydet')!.click();
    expect(update).toHaveBeenCalledWith(
      { contact: { email: a.contact.email, phone: a.contact.phone, address: 'Torstraße 45, Berlin', postalCode: '10119', country: a.contact.country } },
      ['phone', 'address', 'email'],
    );
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.slot()).toBeNull();
    });
    expect(page.rows()[10]).toEqual(['Adres', `Torstraße 45, Berlin, 10119, ${a.contact.country}`, 'Kontrol edildi']);
  });

  it('the funding editor: the API\'s sources; third-party transfers get their note', async () => {
    const update = vi.spyOn(TestBed.inject(Api), 'updateReview');
    const page = await open();
    page.pencil('Sermaye kaynağı');
    const select = page.control(Select) as unknown as { options(): { value: string }[] };
    expect(select.options().map((o) => o.value)).toEqual(['own-abroad', 'own-turkey', 'investor', 'third-party']);
    expect(page.slot()!.querySelector('.warn-note')).toBeNull();
    page.pick(Select, 'third-party');
    expect(page.q('.warn-note')).toBe('Üçüncü taraf transferleri uyum ekibince elle incelenir (en geç 2 iş günü).');
    page.slotButton('Kaydet')!.click();
    expect(update).toHaveBeenCalledWith({ funding: 'third-party' }, ['funding']);
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.rows()[7]).toEqual(['Sermaye kaynağı', 'Üçüncü taraf transferi', 'Kontrol edildi']);
    });
  });

  it('"Vazgeç" closes without saving; opening again starts from the saved values', async () => {
    const update = vi.spyOn(TestBed.inject(Api), 'updateReview');
    const a = store.app()!;
    const page = await open();
    page.pencil('Kurucu');
    page.typeIn('Ad', 'Başka');
    page.slotButton('Vazgeç')!.click();
    page.harness.detectChanges();
    expect(page.slot()).toBeNull();
    expect(update).not.toHaveBeenCalled();
    page.pencil('Kurucu');
    expect(page.inputValue('Ad')).toBe(a.founder.firstName);
    // The same pencil again closes it.
    page.pencil('Kurucu');
    expect(page.slot()).toBeNull();
  });

  it('a logo of another type or over 500 KB is refused with a sentence', async () => {
    const page = await open();
    const input = page.root().querySelector<HTMLInputElement>('header.co input[type=file]')!;
    const pickLogo = (f: File) => {
      Object.defineProperty(input, 'files', { configurable: true, value: [f] });
      input.dispatchEvent(new Event('change'));
      page.harness.detectChanges();
    };
    pickLogo(new File(['x'], 'logo.gif', { type: 'image/gif' }));
    expect(page.alerts()).toEqual(['Logo için PNG, JPEG, SVG veya WebP biçiminde bir görsel seçiniz.']);
    const big = new File(['x'], 'logo.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 500 * 1024 + 1 });
    pickLogo(big);
    expect(page.alerts()).toEqual(['Görsel 500 KB’tan büyüktür. Daha küçük bir dosya seçiniz.']);
    expect(input.value).toBe('');
  });

  it('"Onayla ve devam et" sends the review; the title check opens', async () => {
    const submit = vi.spyOn(TestBed.inject(Api), 'submitReview');
    const page = await open();
    const go = page.button('Onayla ve devam et')!;
    go.click();
    page.harness.detectChanges();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(go.disabled).toBe(true);
    expect(go.textContent?.trim()).toBe('Gönderiliyor…');
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/name-check'));
  });

  it('the mock refuses a review without a title', async () => {
    await store.updateReview({ company: { root: '', activity: '' } }, ['title']);
    const page = await open();
    expect(page.rows()[0]).toEqual(['Şirket unvanı', '—', 'Kontrol edildi']);
    page.button('Onayla ve devam et')!.click();
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.alerts()).toEqual(['Şirket unvanını yazınız.']);
    });
    expect(TestBed.inject(Router).url).toBe('/deck/review');
  });
});

/** D-1c in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('CompanyReviewPage (D-1c), HTTP mode', () => {
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

  it('the API\'s defaults: no title and no codes yet, the rest "Ön bilgilerinizden"; the brand without a logo', async () => {
    const { api } = setUp(map(CAPTURED.reviewDefaults));
    const page = await open();
    expect(api.reference).toHaveBeenCalledTimes(1);
    expect(page.rows()).toEqual([
      ['Şirket unvanı', '—', ''],
      ['Kurucu', 'Deneme Kurucu', 'Ön bilgilerinizden'],
      ['Faaliyet', '—', ''],
      ['Uyruk', 'Almanya', 'Ön bilgilerinizden'],
      ['Şirket türü', 'Tek pay sahipli anonim şirket', ''],
      ['Pay sahipliği', '%100, Deneme Kurucu', ''],
      ['Sermaye', tl0(250_000), ''],
      ['Sermaye kaynağı', 'Yurt dışı banka transferi', 'Ön bilgilerinizden'],
      ['E-posta', 'kurucu@example.test', 'Ön bilgilerinizden'],
      ['Telefon', '+49 151 2345 6700', 'Ön bilgilerinizden'],
      ['Adres', 'Almanya', 'Ön bilgilerinizden'],
      ['Merkez adresi', 'Terminal İstanbul sanal ofisi, Gebze / Kocaeli', ''],
    ]);
    expect(page.q('header.co b')).toBe('Lumora');
    expect(page.root().querySelector('header.co button.logo')).toBeNull();
  });

  it('the founder\'s own values say "Kontrol edildi"; NACE codes by the reference\'s names', async () => {
    setUp(map(CAPTURED.reviewEdited));
    const page = await open();
    const title = (code: string) => CAPTURED.reference.naceCodes.find((n) => n.code === code)!.title;
    expect(page.rows().filter((r) => r[2] === 'Kontrol edildi')).toEqual([
      ['Şirket unvanı', 'Lumora Analitik Yazılım Anonim Şirketi', 'Kontrol edildi'],
      ['Kurucu', 'Deneme Kurucu-Berg', 'Kontrol edildi'],
      ['Faaliyet', `${title('62.01')}, ${title('63.11')}`, 'Kontrol edildi'],
      ['Uyruk', 'Almanya', 'Kontrol edildi'],
      ['Adres', 'Torstraße 45, Berlin, 10119, Almanya', 'Kontrol edildi'],
    ]);
  });

  it('an editor\'s save goes to the API; a refusal keeps it open with the sentence at the input and the row', async () => {
    const updateReview = vi.fn(async () => {
      throw new ApiError('Gönderdiğiniz bilgiler eksik veya hatalıdır.', {
        code: 'validation_failed',
        status: 400,
        fields: { given_name: ['Ad eksik.'], family_name: ['Soyad çok uzun.'] },
      });
    });
    setUp(map(CAPTURED.reviewEdited), { updateReview });
    const page = await open();
    page.pencil('Kurucu');
    page.typeIn('Ad', '');
    page.slotButton('Kaydet')!.click();
    expect(updateReview).toHaveBeenCalledWith({ founder: { firstName: '', lastName: 'Kurucu-Berg', nationality: 'Almanya' } }, ['name']);
    await page.settle();
    expect(page.slot()).not.toBeNull();
    const inSlot = [...page.slot()!.querySelectorAll('.wz-fielderr')].map((e) => e.textContent?.trim());
    expect(inSlot).toEqual(['Ad eksik.', 'Soyad çok uzun.']);
    expect(page.rowError('Kurucu')).toBe('Ad eksik. Soyad çok uzun.');
    expect(page.alerts()).toContain('Gönderdiğiniz bilgiler eksik veya hatalıdır.');
  });

  it('"Onayla ve devam et" refused: each sentence under its row; the screen stays', async () => {
    const submitReview = vi.fn(async () => {
      throw new ApiError('Eksik bilgileri tamamlayınız.', {
        code: 'validation_failed',
        status: 400,
        fields: { trade_name: ['Şirket unvanını yazınız.'], nace_codes: ['En az bir NACE kodu seçiniz.'], residence_address: ['Adres eksik.'], source_of_funds: ['Fon kaynağı seçiniz.'] },
      });
    });
    setUp(map(CAPTURED.reviewDefaults), { submitReview });
    const page = await open();
    page.button('Onayla ve devam et')!.click();
    await page.settle();
    expect(page.rowError('Şirket unvanı')).toBe('Şirket unvanını yazınız.');
    expect(page.rowError('Faaliyet')).toBe('En az bir NACE kodu seçiniz.');
    expect(page.rowError('Adres')).toBe('Adres eksik.');
    expect(page.rowError('Sermaye kaynağı')).toBe('Fon kaynağı seçiniz.');
    expect(page.rowError('Kurucu')).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/deck/review');
  });

  it('accepted: follows the API to the title check', async () => {
    const submitReview = vi.fn(async () => map(CAPTURED.titleChecking));
    setUp(map(CAPTURED.reviewEdited), { submitReview });
    const page = await open();
    page.button('Onayla ve devam et')!.click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/name-check'));
  });

  it('opened from D-1d after a refused title: says so, and "Başka unvan seç" goes back to the choice', async () => {
    setUp(map(CAPTURED.titleConflict));
    const page = await open();
    expect(page.q('.wz-chip')).toBe('Unvan rezerve edilemedi');
    expect(page.rows()[0][1]).toBe('Lumora Veri Analitiği Anonim Şirketi');
    page.button('Başka unvan seç')!.click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/name-rejected'));
  });
});
