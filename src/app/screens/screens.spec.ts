import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApplicationStore } from '@core/application.store';
import { SCREEN_STAGES } from '@core/flow.guard';
import { screenRoutes } from './screens';

/**
 * One render test per routed screen, against the mock API: the demo founder is put at a stage the
 * screen belongs to, the screen's own address is opened, and the screen must be the one that
 * renders (no redirect) with something on it. It is the safety net for the restructuring
 * (docs/restructure-plan.md): it says nothing about what a screen does, only that it still opens.
 */

/** Screens the mock cannot put the founder on: `closed` is a stage only the real API reports. */
const NOT_IN_MOCK = new Set(['closed']);

/** What a screen's address needs besides its path. */
const EXTRA: Record<string, string> = {
  // D-0e reads the reset key from the query; D-2a-m reads its link's key from the fragment.
  d0e: '?token=test-token',
  d2m: '#test-token',
};

describe('every screen opens at its own address', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // jsdom has no matchMedia; the landing asks it for reduced motion when it is built.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    TestBed.configureTestingModule({ providers: [provideRouter(screenRoutes)] });
  });

  afterEach(() => vi.unstubAllGlobals());

  for (const route of screenRoutes) {
    const id = route.data?.['screen'] as string;
    const rule = SCREEN_STAGES[id];
    const test = NOT_IN_MOCK.has(id) ? it.skip : it;

    test(`${id} at /${route.path}`, async () => {
      if (rule) await TestBed.inject(ApplicationStore).seed(rule.stages[0], rule.founder ?? 'foreign');
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(`/${route.path}${EXTRA[id] ?? ''}`);
      harness.detectChanges();

      expect(TestBed.inject(Router).url.split(/[?#]/)[0]).toBe(`/${route.path}`);
      const el = harness.routeNativeElement as HTMLElement;
      expect((el.textContent ?? '').trim().length).toBeGreaterThan(20);
    });
  }
});
