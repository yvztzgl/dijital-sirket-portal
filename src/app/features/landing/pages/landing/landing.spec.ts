import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { landingRoutes } from '../../landing.routes';

const routes = [...landingRoutes, { path: '**', children: [] }];
// jsdom has no matchMedia; the landing asks it for reduced motion when it is built.
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });
/** Nor IntersectionObserver, which the map's loop uses once rendered. */
class NoObserver {
  observe = () => undefined;
  disconnect = () => undefined;
}

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const ctas = () => [...root().querySelectorAll<HTMLAnchorElement>('a.lp-cta')];
  return { harness, root, ctas };
}

/** D-00: only what the page takes from the store (the call to action); its map and scroll story are not tested here. */
describe('LandingPage (D-00), mock', () => {
  let store: ApplicationStore;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    vi.stubGlobal('IntersectionObserver', NoObserver);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders, and clears an error left by an earlier screen', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(page.root().querySelector('.lp-brand-name')?.textContent?.trim()).toBe('Terminal Şirket');
    expect(store.error()).toBeNull();
  });

  it('signed out: both calls to action say "Başvuruya başla" and open the registration', async () => {
    const page = await open();
    expect(page.ctas().length).toBe(2);
    expect(page.ctas().map((a) => a.textContent?.trim())).toEqual(['Başvuruya başla', 'Başvuruya başla']);
    page.ctas()[0].click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/register'));
  });

  it('signed in: "Başvuruma devam et" opens where the application is', async () => {
    await store.seed('verified');
    const page = await open();
    expect(page.ctas().map((a) => a.textContent?.trim())).toEqual(['Başvuruma devam et', 'Başvuruma devam et']);
    page.ctas()[1].click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck'));
  });

  it('signed in: reads both references, so the step 1 screens have their choices at once', async () => {
    await store.seed('review');
    const api = TestBed.inject(Api);
    const reference = vi.spyOn(api, 'reference');
    const evaluation = vi.spyOn(api, 'evaluationReference');
    await open();
    await vi.waitFor(() => expect(store.reference()).not.toBeNull());
    expect(reference).toHaveBeenCalledTimes(1);
    expect(evaluation).toHaveBeenCalledTimes(1);
    expect(store.evaluationReference()).not.toBeNull();
  });
});

/** D-00 in HTTP mode: the real store over a stand-in for the API. */
describe('LandingPage (D-00), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });

  afterEach(() => vi.unstubAllGlobals());

  function setUp(session: { account: typeof account; app: ReturnType<typeof toApplication> } | null) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    vi.stubGlobal('IntersectionObserver', NoObserver);
    const app = session?.app ?? null;
    const seen = { stage: app?.stage ?? 'profile', changedAt: 't0' };
    // The API answers both reference reads 401 without a session (ReferenceController: RequireApplicant).
    const unauthenticated = async () => {
      throw new ApiError('Oturumunuz sona ermiştir. Lütfen yeniden giriş yapınız.', { code: 'unauthenticated', status: 401 });
    };
    const api = {
      demo: null,
      work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen },
      restore: async () => session,
      reference: vi.fn(session ? async () => CAPTURED.reference : unauthenticated),
      evaluationReference: vi.fn(session ? async () => CAPTURED.referenceEvaluation : unauthenticated),
    };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T14:20:00Z')) } }] });
    return { store: TestBed.inject(ApplicationStore), api };
  }

  it('signed in: the call to action resumes the application; both references are read', async () => {
    const { api } = setUp({ account, app: toApplication(CAPTURED.reviewEdited, account) });
    const page = await open();
    expect(api.reference).toHaveBeenCalledTimes(1);
    expect(api.evaluationReference).toHaveBeenCalledTimes(1);
    page.ctas()[0].click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/review'));
  });

  it('signed out: the page still asks for both references, the API answers 401, and the store opens /login (as the page is today; reported)', async () => {
    const { api } = setUp(null);
    await open();
    expect(api.reference).toHaveBeenCalledTimes(1);
    expect(api.evaluationReference).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/login'));
  });
});
