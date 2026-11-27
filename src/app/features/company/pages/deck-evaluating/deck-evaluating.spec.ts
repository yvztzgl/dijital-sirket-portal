import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoServerApi } from '@core/api/demo/demo-server-api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application } from '@core/models/models';
import { DURATION } from '@core/reference/timeline';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { dateTime } from '@core/utils/format';
import { companyRoutes } from '../../company.routes';

const routes = [...companyRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/deck/evaluating');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  /** Each line of the status list as [title, small print]. */
  const checks = () => [...root().querySelectorAll('.wz-checks li')].map((li) => [li.querySelector('b')!.textContent!.trim(), li.querySelector('small')!.textContent!.trim()]);
  const alerts = () => [...root().querySelectorAll('[role=alert]')].map((e) => e.textContent?.trim());
  return { harness, root, q, button, checks, alerts };
}

/** D-1b against the mock API; the evaluation's time comes from a hand-moved `Clock`. */
describe('DeckEvaluatingPage (D-1b), mock', () => {
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
    await store.seed('evaluating');
    TestBed.inject(DemoSettings).set({ speed: 1 });
    start = Date.parse(store.app()!.evaluation!.startedAt);
    now.set(start);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(store.error()).toBeNull();
    expect(page.alerts()).toEqual([]);
  });

  it('a status page: the files received, since when it runs, what comes next; no demo bar in the mock', async () => {
    const a = store.app()!;
    const page = await open();
    expect(page.q('h1')).toBe('Sunumunuz değerlendiriliyor');
    expect(page.q('.wz-chip')).toBe('Değerlendiriliyor');
    expect(page.checks()).toEqual([
      ['Sunum ve özgeçmiş alındı', `${a.deck!.fileName} · ${a.cv!.fileName}`],
      ['Değerlendirme sürüyor', `${dateTime(a.evaluation!.startedAt)} tarihinde başladı`],
      ['Şirket bilgileri', 'Değerlendirme tamamlandığında şirket bilgilerinizi doldurursunuz.'],
    ]);
    expect(page.q('.wz-checks')).not.toMatch(/deneme|1\s*\/\s*3/i);
    expect(page.root().querySelector('app-demo-bar section')).toBeNull();
    expect(page.root().querySelectorAll('.wz-head button, .wz-checks button').length).toBe(0);
  });

  it('when the simulated evaluation ends the company form opens', async () => {
    const page = await open();
    now.set(start + DURATION.evaluation);
    page.harness.detectChanges();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/review'));
    expect(store.stage()).toBe('review');
  });
});

/** D-1b in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('DeckEvaluatingPage (D-1b), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });

  function setUp(app: Application, demo: { available: boolean; evaluation?: (o: string) => Promise<void> } = { available: false }) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = {
      demo: null,
      work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen },
      restore: async () => ({ account, app }),
      reference: vi.fn(async () => CAPTURED.reference),
      evaluationReference: vi.fn(async () => CAPTURED.referenceEvaluation),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: Api, useValue: api },
        { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T14:20:00Z')) } },
        { provide: DemoServerApi, useValue: { available: computed(() => demo.available), evaluation: demo.evaluation } },
      ],
    });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return { store, api };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('the uploaded files and the start from the API; the retry count is not shown', async () => {
    setUp(toApplication(CAPTURED.evaluating, account));
    const page = await open();
    expect(page.checks()).toEqual([
      ['Sunum ve özgeçmiş alındı', 'Lumora Sunum.pdf · Ozgecmis.pdf'],
      ['Değerlendirme sürüyor', `${dateTime('2026-11-25T14:18:50.112317+00:00')} tarihinde başladı`],
      ['Şirket bilgileri', 'Değerlendirme tamamlandığında şirket bilgilerinizi doldurursunuz.'],
    ]);
    // "1. deneme / 3" would be the retry count (owner, 2026-11-26: not shown).
    expect(page.q('.wz-checks')).not.toMatch(/deneme|1\s*\/\s*3/i);
    expect(page.root().querySelector('app-demo-bar section')).toBeNull();
  });

  it('reads both references while waiting, so the next screens have their choices at once', async () => {
    const { api } = setUp(toApplication(CAPTURED.evaluating, account));
    await open();
    expect(api.reference).toHaveBeenCalledTimes(1);
    expect(api.evaluationReference).toHaveBeenCalledTimes(1);
  });

  it('the demo bar against a demo API: the evaluation\'s four endings as buttons', async () => {
    const evaluation = vi.fn(async () => undefined);
    setUp(toApplication(CAPTURED.evaluating, account), { available: true, evaluation });
    const page = await open();
    const bar = page.root().querySelector('app-demo-bar section')!;
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Tamamlandı', 'Soru var', 'Başarısız', 'Reddedildi']);
    page.button('Soru var')!.click();
    expect(evaluation).toHaveBeenCalledWith('questions');
  });
});
