import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { LOG_TEXTS, toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application, FUNDING_LABELS } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { dec1, hm } from '@core/utils/format';
import { eligibilityRoutes } from '../../eligibility.routes';

const routes = [...eligibilityRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });
const LISTS = ['BM Güvenlik Konseyi yaptırım listesi', 'AB konsolide yaptırım listesi', 'OFAC SDN listesi', 'Ulusal malvarlığı dondurma listesi', 'PEP (siyasi nüfuz sahibi kişiler)'];
const hms = (ms: number) => `${hm(ms)}:${String(new Date(ms).getSeconds()).padStart(2, '0')}`;

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/eligibility/result');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  /** The finished checks as [title, line]. */
  const checks = () => [...root().querySelectorAll('.wz-checks > ul > li .t')].map((t) => [t.querySelector('b')!.textContent!.trim(), t.querySelector('small')!.textContent!.trim()]);
  const toggle = () => root().querySelector<HTMLButtonElement>('.wz-checks button.wz-link');
  const lists = () => [...root().querySelectorAll('.wz-checks ol.lists li')].map((li) => [...li.children].map((c) => c.textContent!.trim()));
  const pay = () => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Ödemeye geç')!;
  return { harness, root, q, checks, toggle, lists, pay };
}

/** D-2b against the mock API, driven through the page's DOM. */
describe('EligiblePage (D-2b), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('eligible');
    TestBed.inject(DemoSettings).set({ speed: 1 });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    await open();
    expect(store.error()).toBeNull();
  });

  it('the three finished checks: identity with its score, the declaration, the five lists', async () => {
    const a = store.app()!;
    const page = await open();
    expect(page.q('h1')).toBe('Kimliğiniz doğrulandı');
    expect(page.q('.wz-chip')).toBe('Dijital kuruluşa uygun');
    expect(page.checks()).toEqual([
      ['Kimlik doğrulama', `Pasaport MRZ doğrulandı · canlılık eşleşmesi ${dec1(a.eligibility!.score!)}`],
      ['Beyan', `Adres belgesi: adres-belgesi.pdf · fon kaynağı: ${FUNDING_LABELS[a.funding].toLocaleLowerCase('tr-TR')}`],
      ['Uygunluk taraması', '5 / 5 liste tarandı, eşleşme bulunmadı'],
    ]);
    expect(page.q('.wz-foot')).toBe(`Tarama raporu belgelerinize eklendi; kontroller ${hm(a.eligibility!.finishedAt!)} itibarıyla tamamlandı.`);
  });

  it('the lists are open with their simulated times; the link hides and shows them', async () => {
    const start = Date.parse(store.app()!.eligibility!.screeningStartedAt!);
    const page = await open();
    expect(page.toggle()!.textContent?.trim()).toBe('Listeleri gizle');
    expect(page.toggle()!.getAttribute('aria-expanded')).toBe('true');
    expect(page.lists()).toEqual(LISTS.map((n, i) => [n, hms(start + (i + 1) * 1000), 'Eşleşme bulunmadı']));
    page.toggle()!.click();
    page.harness.detectChanges();
    expect(page.root().querySelector('ol.lists')).toBeNull();
    expect(page.toggle()!.textContent?.trim()).toBe('Listeleri göster');
    expect(page.toggle()!.getAttribute('aria-expanded')).toBe('false');
    page.toggle()!.click();
    page.harness.detectChanges();
    expect(page.lists().length).toBe(5);
  });

  it('without an address file name: "Adres belgesi alındı"', async () => {
    store.app.update((a) => ({ ...a!, eligibility: { ...a!.eligibility!, address: undefined } }));
    const page = await open();
    expect(page.checks()[1][1]).toBe(`Adres belgesi alındı · fon kaynağı: ${FUNDING_LABELS[store.app()!.funding].toLocaleLowerCase('tr-TR')}`);
  });

  it('"Ödemeye geç" goes on to the payment', async () => {
    const proceed = vi.spyOn(TestBed.inject(Api), 'proceedToPayment');
    const page = await open();
    page.pay().click();
    expect(proceed).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/payment'));
  });
});

/** D-2b in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('EligiblePage (D-2b), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });

  function setUp(app: Application, calls: Record<string, unknown> = {}) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }), ...calls };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T14:21:00Z')) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('only what the API says: no score, no file name, the search as one result, no list toggle', async () => {
    const app = toApplication(CAPTURED.eligible, account);
    expect(app.stage).toBe('eligible');
    setUp(app);
    const page = await open();
    expect(page.checks()).toEqual([
      ['Kimlik doğrulama', 'Kimliğiniz doğrulandı'],
      ['Beyan', 'Adres belgesi alındı · fon kaynağı: yurt dışı banka transferi'],
      ['Uygunluk taraması', 'Yaptırım ve PEP taraması tamamlandı'],
    ]);
    expect(page.toggle()).toBeNull();
    expect(page.root().querySelector('ol.lists')).toBeNull();
    const finished = CAPTURED.eligible.logs.find((l) => l.text === LOG_TEXTS.screeningDone)!.at;
    expect(page.q('.wz-foot')).toBe(`Kontroller ${hm(finished)} itibarıyla tamamlandı.`);
  });

  it('no finishing time in the timeline: no footer', async () => {
    const view = { ...CAPTURED.eligible, logs: CAPTURED.eligible.logs.filter((l) => l.text !== LOG_TEXTS.screeningDone) };
    setUp(toApplication(view as never, account));
    const page = await open();
    expect(page.root().querySelector('.wz-foot')).toBeNull();
  });

  it('"Ödemeye geç" is acknowledged and the payment form opens', async () => {
    const proceedToPayment = vi.fn(async () => toApplication(CAPTURED.eligible, account, { resultSeen: true }));
    setUp(toApplication(CAPTURED.eligible, account), { proceedToPayment });
    const page = await open();
    page.pay().click();
    expect(proceedToPayment).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/payment'));
  });
});
