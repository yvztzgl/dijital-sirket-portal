import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { ApplicationStore, routeFor } from './application.store';
import { DemoSettings } from './demo-settings';
import { flowGuard, SCREEN_STAGES } from './flow.guard';
import { STAGE_ORDER } from './models';

const run = (screen: string) =>
  TestBed.runInInjectionContext(() =>
    flowGuard({ data: { screen } } as unknown as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );

describe('flowGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
  });

  it('lets public screens through and sends signed-out founders to login', () => {
    expect(run('d00')).toBe(true);
    const r = run('d3a') as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/login');
  });

  it('redirects to where the application actually is', async () => {
    const store = TestBed.inject(ApplicationStore);
    await store.seed('payment');
    expect(run('d3a')).toBe(true);
    const r = run('d5b') as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/payment');
  });

  it('routes T.C. citizens to their own e-signature screen', async () => {
    const store = TestBed.inject(ApplicationStore);
    await store.seed('signing', 'resident');
    expect(run('d4d')).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(run('d4a') as UrlTree)).toBe('/e-signature/turkish-citizen');
  });

  it('every stage has a screen that accepts it', () => {
    for (const stage of STAGE_ORDER) {
      const path = routeFor(stage);
      const owner = Object.values(SCREEN_STAGES).some((r) => r.stages.includes(stage));
      expect(owner, `${stage} → ${path}`).toBe(true);
    }
  });
});
