import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoServerApi } from '@core/api/demo/demo-server-api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application, FUNDING_LABELS } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { dec1 } from '@core/utils/format';
import { eligibilityRoutes } from '../../eligibility.routes';

const routes = [...eligibilityRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/eligibility/manual-review');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  /** The checks as [title, line]. */
  const checks = () => [...root().querySelectorAll('.wz-checks > ul > li .t')].map((t) => [t.querySelector('b')!.textContent!.trim(), t.querySelector('small')!.textContent!.trim()]);
  /** The reasons as [text, page note]. */
  const reasons = () => [...root().querySelectorAll('.why li')].map((li) => [li.querySelector('span')!.textContent!.trim(), li.querySelector('em')?.textContent?.trim() ?? null]);
  return { harness, root, q, button, checks, reasons };
}

/** D-2c against the mock API, driven through the page's DOM. */
describe('ManualReviewPage (D-2c), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('manual');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    await open();
    expect(store.error()).toBeNull();
  });

  it('third-party funds: the two reasons with their deck page, the finished checks', async () => {
    const a = store.app()!;
    const page = await open();
    expect(page.q('.wz-chip')).toBe('Manuel inceleme gerekli');
    expect(page.q('h1')).toBe('Başvurunuz incelemeye alındı');
    expect(page.reasons()).toEqual([
      ['Fon kaynağı “Üçüncü taraf transferi” olarak beyan edildi', 'Sunum, s. 10'],
      ['Transferi yapan tarafın kimliği sunumda belirtilmemiş', 'Sunum, s. 10'],
    ]);
    expect(page.checks()).toEqual([
      ['Kimlik doğrulama', `Pasaport MRZ doğrulandı · canlılık eşleşmesi ${dec1(a.eligibility!.score!)}`],
      ['Beyan', `Adres belgesi: adres-belgesi.pdf · fon kaynağı: ${FUNDING_LABELS['third-party'].toLocaleLowerCase('tr-TR')}`],
      ['Yaptırım ve PEP taraması', '5/5 liste tarandı · eşleşme bulunmadı'],
    ]);
    expect(page.root().querySelector('app-demo-bar')).toBeNull();
  });

  it('other funds (a forced review): the identity reasons, without a page note', async () => {
    store.app.update((a) => ({ ...a!, funding: 'own-abroad' }));
    const page = await open();
    expect(page.reasons()).toEqual([
      ['Canlılık eşleşme skoru otomatik onay eşiğine yakın', null],
      ['Uyum ekibi kimlik belgesini ikinci kez kontrol edecek', null],
    ]);
  });

  it('"İnceleme kaydıyla devam et" goes on to the payment, recorded as accepted under review', async () => {
    const proceed = vi.spyOn(TestBed.inject(Api), 'proceedToPayment');
    const page = await open();
    page.button('İnceleme kaydıyla devam et')!.click();
    expect(proceed).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/payment'));
    expect(store.app()!.eligibility!.manualAccepted).toBe(true);
  });

  it('"Sunum bilgilerini düzelt" reopens the deck data', async () => {
    const back = vi.spyOn(TestBed.inject(Api), 'backToReview');
    const page = await open();
    page.button('Sunum bilgilerini düzelt')!.click();
    expect(back).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(store.stage()).toBe('review'));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe(store.resumeRoute()));
  });

  it('both buttons wait while an action runs', async () => {
    const page = await open();
    store.busy.set(true);
    page.harness.detectChanges();
    expect(page.button('Sunum bilgilerini düzelt')!.disabled).toBe(true);
    expect(page.button('İnceleme kaydıyla devam et')!.disabled).toBe(true);
    store.busy.set(false);
  });
});

/** D-2c in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('ManualReviewPage (D-2c), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });

  function setUp(app: Application, demo: { available: boolean; review?: (d: string) => Promise<void> } = { available: false }) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: Api, useValue: api },
        { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T14:21:00Z')) } },
        { provide: DemoServerApi, useValue: { available: computed(() => demo.available), review: demo.review } },
      ],
    });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('a status page: no reasons, the search only said to be finished, nothing to press', async () => {
    setUp(toApplication(CAPTURED.manual, account));
    const page = await open();
    expect(page.q('.wz-chip')).toBe('İnceleniyor');
    expect(page.root().querySelector('.why')).toBeNull();
    expect(page.checks()).toEqual([
      ['Kimlik doğrulama', 'Kimliğiniz doğrulandı'],
      ['Beyan', 'Adres belgesi alındı · fon kaynağı: üçüncü taraf transferi'],
      ['Yaptırım ve PEP taraması', 'Tarama tamamlandı'],
      ['Başvuru incelemesi', 'İnceleme sürüyor'],
      ['Ödeme', 'İnceleme olumlu sonuçlandığında 3. adım açılır.'],
    ]);
    expect(page.button('İnceleme kaydıyla devam et')).toBeUndefined();
    expect(page.button('Sunum bilgilerini düzelt')).toBeUndefined();
    expect(page.root().querySelector('app-demo-bar section')).toBeNull();
  });

  it('the demo bar against a demo API: staff\'s decision as two buttons', async () => {
    const review = vi.fn(async () => undefined);
    setUp(toApplication(CAPTURED.manual, account), { available: true, review });
    const page = await open();
    const bar = page.root().querySelector('app-demo-bar section')!;
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Onayla', 'Reddet']);
    page.button('Onayla')!.click();
    expect(review).toHaveBeenCalledWith('approve');
  });
});
