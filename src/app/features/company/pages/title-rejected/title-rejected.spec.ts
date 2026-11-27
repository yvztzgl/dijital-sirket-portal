import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { titleAlternatives } from '@core/utils/rules';
import { companyRoutes } from '../../company.routes';

const routes = [...companyRoutes, { path: '**', children: [] }];
const media = (reduced: boolean) => (query: string) => ({ matches: reduced, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/deck/name-rejected');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  /** The refused title and what it clashed with, as [label, value]. */
  const vs = () => [...root().querySelectorAll('.vs div')].map((d) => [d.querySelector('dt')!.textContent!.trim(), d.querySelector('dd')!.textContent!.trim()]);
  const alts = () => [...root().querySelectorAll<HTMLButtonElement>('.alts button')];
  const own = () => root().querySelector<HTMLInputElement>('#own-title');
  const typeOwn = (value: string) => {
    own()!.value = value;
    own()!.dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  const alerts = () => [...root().querySelectorAll('[role=alert]')].map((e) => e.textContent?.replace(/\s+/g, ' ').trim());
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    harness.detectChanges();
  };
  return { harness, root, q, button, vs, alts, own, typeOwn, alerts, settle };
}

/** D-1d against the mock API. */
describe('TitleRejectedPage (D-1d), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', media(true));
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('titleConflict');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(store.error()).toBeNull();
    expect(page.root().querySelector('app-form-error [role=alert]')).toBeNull();
  });

  it('the refused title beside the registered one, and three suggestions, the first as Terminal AI\'s', async () => {
    const t = store.app()!.titleCheck!;
    const page = await open();
    expect(page.q('h1')).toBe('Başka bir unvan seçiniz');
    expect(page.vs()).toEqual([
      ['Seçtiğiniz unvan', `${t.candidate} Anonim Şirketi`],
      ['MERSİS’te kayıtlı unvan', t.conflictWith!],
    ]);
    expect(t.alternatives!.length).toBe(3);
    expect(page.alts().map((b) => b.querySelector('b')!.textContent!.trim())).toEqual(t.alternatives);
    expect(page.alts().map((b) => b.classList.contains('ai'))).toEqual([true, false, false]);
    expect(page.alts()[0].querySelector('em')!.textContent!.trim()).toBe('Terminal AI önerisi');
    // Reduced motion: no skeleton.
    expect(page.root().querySelector('.skel')).toBeNull();
  });

  it('"Seç" on a suggestion asks for it at once; the check screen opens', async () => {
    const choose = vi.spyOn(TestBed.inject(Api), 'chooseTitle');
    const t = store.app()!.titleCheck!;
    const page = await open();
    page.alts()[1].click();
    expect(choose).toHaveBeenCalledWith(t.alternatives![1]);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/name-check'));
    expect(store.app()!.titleCheck!.candidate).toBe(t.alternatives![1]);
  });

  it('an own title: the box opens, "Sorgula" waits for text, and sends it', async () => {
    const choose = vi.spyOn(TestBed.inject(Api), 'chooseTitle');
    const page = await open();
    expect(page.own()).toBeNull();
    const toggle = page.button('Başka bir unvan yazmak istiyorum')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    page.harness.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(page.button('Sorgula')!.disabled).toBe(true);
    page.typeOwn('   ');
    expect(page.button('Sorgula')!.disabled).toBe(true);
    page.typeOwn('Nehir Veri Teknolojileri');
    expect(page.button('Sorgula')!.disabled).toBe(false);
    page.button('Sorgula')!.click();
    expect(choose).toHaveBeenCalledWith('Nehir Veri Teknolojileri');
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/name-check'));
    toggle.click();
  });

  it('"Diğer bilgilere dön" opens the company form, without changing the stage', async () => {
    const page = await open();
    page.button('Diğer bilgilere dön')!.click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/review'));
    expect(store.stage()).toBe('titleConflict');
  });

  it('while a title is being sent: every choice disabled and "Gönderiliyor…"', async () => {
    const page = await open();
    store.busy.set(true);
    page.harness.detectChanges();
    expect(page.alts().every((b) => b.disabled)).toBe(true);
    expect(page.button('Diğer bilgilere dön')!.disabled).toBe(true);
    expect(page.q('.busy')).toBe('Gönderiliyor…');
    store.busy.set(false);
  });
});

describe('TitleRejectedPage (D-1d), the Terminal AI suggestion\'s intro', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a skeleton for a moment beside the thinking bot, then the name', async () => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', media(false));
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    await TestBed.inject(ApplicationStore).seed('titleConflict');
    const page = await open();
    expect(page.alts()[0].querySelector('.skel')).not.toBeNull();
    expect(page.alts()[0].querySelector('.name')).toBeNull();
    // The full name is there for screen readers all along.
    expect(page.alts()[0].querySelector('.sr')!.textContent).toContain('Anonim Şirketi');
    await new Promise((r) => setTimeout(r, 850));
    page.harness.detectChanges();
    expect(page.alts()[0].querySelector('.skel')).toBeNull();
    expect(page.alts()[0].querySelector('.name')).not.toBeNull();
  });
});

/** D-1d in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('TitleRejectedPage (D-1d), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (view: unknown) => toApplication(view as never, account);

  function setUp(app: Application, calls: Record<string, unknown> = {}) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', media(true));
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

  it('staff\'s reason instead of a registered title; the portal\'s own three suggestions', async () => {
    setUp(map(CAPTURED.titleConflict));
    const page = await open();
    expect(page.vs()).toEqual([
      ['Seçtiğiniz unvan', 'Lumora Veri Analitiği Anonim Şirketi'],
      ['Gerekçe', 'Benzer bir unvan sicilde kayıtlıdır.'],
    ]);
    expect(page.alts().map((b) => b.querySelector('b')!.textContent!.trim())).toEqual(titleAlternatives('Lumora', 'Lumora Veri Analitiği'));
  });

  it('the chosen title goes to the API and the page follows it to the check', async () => {
    const chooseTitle = vi.fn(async () => map(CAPTURED.titleCheckingAgain));
    setUp(map(CAPTURED.titleConflict), { chooseTitle });
    const page = await open();
    page.alts()[0].click();
    expect(chooseTitle).toHaveBeenCalledWith(titleAlternatives('Lumora', 'Lumora Veri Analitiği')[0]);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/name-check'));
  });

  it('the API\'s refusal of an own title: its sentence under the box and under the card (twice, as the page is today)', async () => {
    const chooseTitle = vi.fn(async () => {
      throw new ApiError('Unvan geçersizdir.', { code: 'validation_failed', status: 400, fields: { title: ['Unvan en az 3 karakter olmalıdır.'] } });
    });
    setUp(map(CAPTURED.titleConflict), { chooseTitle });
    const page = await open();
    page.button('Başka bir unvan yazmak istiyorum')!.click();
    page.harness.detectChanges();
    page.typeOwn('Ab');
    page.button('Sorgula')!.click();
    await page.settle();
    expect(page.q('.pick .wz-fielderr')).toBe('Unvan en az 3 karakter olmalıdır.');
    // A refusal naming one field shows that field's sentence as the screen's error too, so it is there twice.
    expect(page.alerts().filter((m) => m === 'Unvan en az 3 karakter olmalıdır.').length).toBe(2);
    expect(TestBed.inject(Router).url).toBe('/deck/name-rejected');
  });

  it('reads both references', async () => {
    const { api } = setUp(map(CAPTURED.titleConflict));
    await open();
    expect(api.reference).toHaveBeenCalledTimes(1);
    expect(api.evaluationReference).toHaveBeenCalledTimes(1);
  });
});
