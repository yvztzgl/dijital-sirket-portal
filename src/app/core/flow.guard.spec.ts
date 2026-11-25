import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { ApplicationStore, routeFor } from './application.store';
import { DemoSettings } from './demo-settings';
import { flowGuard, SCREEN_STAGES } from './flow.guard';
import { STAGE_ORDER } from './models';

/** The guard waits for the session lookup at start (`ApplicationStore.restored`), so it answers with a promise. */
const run = async (screen: string) =>
  TestBed.runInInjectionContext(() =>
    flowGuard({ data: { screen } } as unknown as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );

describe('flowGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
  });

  it('lets public screens through and sends signed-out founders to login', async () => {
    expect((await run('d00'))).toBe(true);
    const r = (await run('d3a')) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/login');
  });

  it('redirects to where the application actually is', async () => {
    const store = TestBed.inject(ApplicationStore);
    await store.seed('payment');
    expect((await run('d3a'))).toBe(true);
    const r = (await run('d5b')) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/payment');
  });

  it('routes T.C. citizens to their own e-signature screen', async () => {
    const store = TestBed.inject(ApplicationStore);
    await store.seed('signing', 'resident');
    expect((await run('d4d'))).toBe(true);
    expect(TestBed.inject(Router).serializeUrl((await run('d4a')) as UrlTree)).toBe('/e-signature/turkish-citizen');
  });

  it('keeps the profile form open until the deck is uploaded', async () => {
    const store = TestBed.inject(ApplicationStore);
    const router = TestBed.inject(Router);
    await store.seed('profile');
    expect((await run('d1e'))).toBe(true);
    expect(router.serializeUrl((await run('d1a')) as UrlTree)).toBe('/details');
    await store.seed('verified');
    expect((await run('d1e'))).toBe(true);
    expect((await run('d1a'))).toBe(true);
    await store.seed('scanning');
    expect(router.serializeUrl((await run('d1e')) as UrlTree)).toBe('/deck/scan');
  });

  it('every stage has a screen that accepts it', () => {
    for (const stage of STAGE_ORDER) {
      const path = routeFor(stage);
      const owner = Object.values(SCREEN_STAGES).some((r) => r.stages.includes(stage));
      expect(owner, `${stage} → ${path}`).toBe(true);
    }
  });
});
