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
  await harness.navigateByUrl('/deck/name-check');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  /** Each line of the status list as [title, small print]. */
  const checks = () => [...root().querySelectorAll('.wz-checks li')].map((li) => [li.querySelector('b')!.textContent!.trim(), li.querySelector('small')!.textContent!.trim()]);
  const alerts = () => [...root().querySelectorAll('[role=alert]')].map((e) => e.textContent?.trim());
  return { harness, root, q, button, checks, alerts };
}

/** D-1f against the mock API; the check's time comes from a hand-moved `Clock`. */
describe('TitleCheckPage (D-1f), mock', () => {
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
    await store.seed('titleChecking');
    TestBed.inject(DemoSettings).set({ speed: 1 });
    start = Date.parse(store.app()!.titleCheck!.requestedAt!);
    now.set(start);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(store.error()).toBeNull();
    expect(page.alerts()).toEqual([]);
  });

  it('a status page: the title being checked and since when; no demo bar in the mock', async () => {
    const t = store.app()!.titleCheck!;
    const page = await open();
    expect(page.q('h1')).toBe('Şirket unvanınız kontrol ediliyor');
    expect(page.checks()).toEqual([
      ['Başvuru bilgileriniz onaylandı', 'Şirket bilgileriniz kaydedildi.'],
      [`${t.candidate} Anonim Şirketi`, `Unvan kontrolü sürüyor · ${dateTime(t.requestedAt!)} tarihinde gönderildi`],
      ['Kimlik doğrulama', 'Unvanınız rezerve edildiğinde 2. adım açılır.'],
    ]);
    expect(page.root().querySelector('app-demo-bar section')).toBeNull();
  });

  it('when the simulated check ends the screen follows its answer (the demo title clashes with a registered one: D-1d)', async () => {
    const page = await open();
    now.set(start + DURATION.titleCheck);
    page.harness.detectChanges();
    await vi.waitFor(() => expect(store.stage()).toBe('titleConflict'));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/name-rejected'));
  });
});

/** D-1f in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('TitleCheckPage (D-1f), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });

  function setUp(app: Application, demo: { available: boolean; title?: (d: string) => Promise<void> } = { available: false }) {
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
        { provide: DemoServerApi, useValue: { available: computed(() => demo.available), title: demo.title } },
      ],
    });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return { store, api };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('the title from the reservation, without the API\'s suffix; no time (the API sends none)', async () => {
    setUp(toApplication(CAPTURED.titleChecking, account));
    const page = await open();
    expect(page.checks()[1]).toEqual(['Lumora Veri Analitiği Anonim Şirketi', 'Unvan kontrolü sürüyor']);
    expect(page.root().querySelector('app-demo-bar section')).toBeNull();
  });

  it('a second check after a refusal: the title chosen on D-1d', async () => {
    setUp(toApplication(CAPTURED.titleCheckingAgain, account));
    const page = await open();
    expect(page.checks()[1][0]).toBe('Lumora Analitik Yazılım Anonim Şirketi');
  });

  it('reads both references while waiting', async () => {
    const { api } = setUp(toApplication(CAPTURED.titleChecking, account));
    await open();
    expect(api.reference).toHaveBeenCalledTimes(1);
    expect(api.evaluationReference).toHaveBeenCalledTimes(1);
  });

  it('the demo bar against a demo API: staff\'s two decisions as buttons', async () => {
    const title = vi.fn(async () => undefined);
    setUp(toApplication(CAPTURED.titleChecking, account), { available: true, title });
    const page = await open();
    const bar = page.root().querySelector('app-demo-bar section')!;
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Rezerve et', 'Reddet']);
    page.button('Reddet')!.click();
    expect(title).toHaveBeenCalledWith('rejected');
  });
});
