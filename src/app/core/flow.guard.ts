import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { ApplicationStore } from './application.store';
import { FounderType, Stage } from './models';

/** Which application stages may show each screen. Screens not listed are public. */
export const SCREEN_STAGES: Record<string, { stages: Stage[]; founder?: FounderType }> = {
  d0c: { stages: ['registered'] },
  // The profile form stays open after it is saved, until the deck is uploaded (the API allows a new save until then).
  d1e: { stages: ['profile', 'verified'] },
  d1a: { stages: ['verified'] },
  d1b: { stages: ['scanning'] },
  // D-1c also opens after a refused title ("Diğer bilgilere dön" on D-1d): the API still takes review changes then.
  d1c: { stages: ['review', 'titleConflict'] },
  titlecheck: { stages: ['titleChecking'] },
  rejection: { stages: ['titleConflict'] },
  d2a: { stages: ['eligibility'] },
  d2d: { stages: ['declaration'] },
  d2e: { stages: ['screening'] },
  d2b: { stages: ['eligible'] },
  d2c: { stages: ['manual'] },
  closed: { stages: ['closed'] },
  d3a: { stages: ['payment'] },
  d3b: { stages: ['threeDs'] },
  d4a: { stages: ['signing'], founder: 'foreign' },
  d4b: { stages: ['calling'] },
  d4c: { stages: ['signed'] },
  d4d: { stages: ['signing'], founder: 'resident' },
  d5a: { stages: ['setup'] },
  d5b: { stages: ['done'] },
};

/**
 * Keeps the wizard honest: a screen opens only when the application is at a stage that screen
 * belongs to; otherwise the founder is sent to where their application actually is.
 * Until the session the browser already had is known (`ApplicationStore.restored`, one request
 * after a reload in HTTP mode), it waits instead of sending a signed-in founder to the login page.
 */
export const flowGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const store = inject(ApplicationStore);
  const router = inject(Router);
  const rule = SCREEN_STAGES[route.data['screen'] as string];
  if (!rule) return true;
  const decide = () => {
    // No stage: nobody is signed in and no address is waiting for its code.
    const stage = store.stage();
    if (!stage) return router.parseUrl('/login');
    const ok = rule.stages.includes(stage) && (!rule.founder || rule.founder === store.founderType());
    return ok || router.parseUrl(store.resumeRoute());
  };
  return store.restored.then(decide);
};
