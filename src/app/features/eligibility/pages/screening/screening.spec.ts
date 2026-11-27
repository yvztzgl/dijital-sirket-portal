import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application } from '@core/models/models';
import { DURATION } from '@core/reference/timeline';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { hm } from '@core/utils/format';
import { eligibilityRoutes } from '../../eligibility.routes';

const routes = [...eligibilityRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });
const LISTS = ['BM Güvenlik Konseyi yaptırım listesi', 'AB konsolide yaptırım listesi', 'OFAC SDN listesi', 'Ulusal malvarlığı dondurma listesi', 'PEP (siyasi nüfuz sahibi kişiler)'];
/** "14:20:11", as the page writes a list's time. */
const hms = (ms: number) => `${hm(ms)}:${String(new Date(ms).getSeconds()).padStart(2, '0')}`;

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/eligibility/screening');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  /** Each list as [name, time, state text, class]. */
  const rows = () =>
    [...root().querySelectorAll('.wz-scr ol li')].map((li) => [
      li.querySelector('.n')!.textContent!.trim(),
      li.querySelector('time')!.textContent!.trim(),
      li.querySelector('em')!.textContent!.trim(),
      li.className.trim(),
    ]);
  const bar = () => root().querySelector<HTMLElement>('.wz-scr .bar i')!.style.width;
  return { harness, root, q, rows, bar };
}

/** D-2e against the mock API; the list search's time comes from a hand-moved `Clock`. */
describe('ScreeningPage (D-2e), mock', () => {
  let store: ApplicationStore;
  let now: ReturnType<typeof signal<number>>;
  let start: number;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    now = signal(Date.now() - 60_000);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('screening');
    // Real time from here: the search takes 5 s of the hand-moved clock.
    TestBed.inject(DemoSettings).set({ speed: 1 });
    start = Date.parse(store.app()!.eligibility!.screeningStartedAt!);
    now.set(start);
  });

  afterEach(() => vi.unstubAllGlobals());

  const at = (page: Awaited<ReturnType<typeof open>>, ms: number) => {
    now.set(start + ms);
    page.harness.detectChanges();
  };

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    await open();
    expect(store.error()).toBeNull();
  });

  it('at the start: the first list is being searched, the others wait', async () => {
    const page = await open();
    expect(page.q('h1')).toBe('Uygunluk taraması yapılıyor');
    expect(page.q('.wz-scr header span')).toBe('0 / 5');
    expect(page.bar()).toBe('0%');
    expect(page.rows()).toEqual([
      [LISTS[0], '', 'Taranıyor…', 'now'],
      [LISTS[1], '', 'Sırada', ''],
      [LISTS[2], '', 'Sırada', ''],
      [LISTS[3], '', 'Sırada', ''],
      [LISTS[4], '', 'Sırada', ''],
    ]);
  });

  it('the lists are ticked off one by one with their simulated times', async () => {
    const page = await open();
    const step = DURATION.screening / 5;
    at(page, 2.5 * step);
    expect(page.q('.wz-scr header span')).toBe('2 / 5');
    expect(page.bar()).toBe('40%');
    expect(page.rows()).toEqual([
      [LISTS[0], hms(start + step), 'Eşleşme bulunmadı', 'ok'],
      [LISTS[1], hms(start + 2 * step), 'Eşleşme bulunmadı', 'ok'],
      [LISTS[2], '', 'Taranıyor…', 'now'],
      [LISTS[3], '', 'Sırada', ''],
      [LISTS[4], '', 'Sırada', ''],
    ]);
    expect(page.root().querySelectorAll('.wz-scr li.ok .st app-icon').length).toBe(2);
    at(page, 4.2 * step);
    expect(page.q('.wz-scr header span')).toBe('4 / 5');
    expect(page.bar()).toBe('80%');
  });

  it('when the last list is done the result screen opens', async () => {
    const page = await open();
    at(page, DURATION.screening);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/eligibility/result'));
    expect(store.stage()).toBe('eligible');
  });
});

/** D-2e in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('ScreeningPage (D-2e), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });

  function setUp(app: Application, now: number) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }) };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(now) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('every list is being searched, no count and no times; the bar moves but never reaches the end', async () => {
    const app = toApplication(CAPTURED.screening, account);
    const declared = Date.parse(app.eligibility!.screeningStartedAt!);
    setUp(app, declared + DURATION.screening);
    const page = await open();
    expect(page.root().querySelector('.wz-scr header span')).toBeNull();
    expect(page.rows()).toEqual(LISTS.map((n) => [n, '', 'Taranıyor…', 'now']));
    expect(page.bar()).toBe('60%');
  });

  it('long after the declaration the bar stays below the end', async () => {
    const app = toApplication(CAPTURED.screening, account);
    setUp(app, Date.parse(app.eligibility!.screeningStartedAt!) + 3_600_000);
    const page = await open();
    expect(page.bar()).toBe('95%');
  });
});
