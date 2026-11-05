import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { ApplicationStore } from './application.store';
import { FounderType, Stage } from './models';

/** Which application stages may show each screen. Screens not listed are public. */
export const SCREEN_STAGES: Record<string, { stages: Stage[]; founder?: FounderType }> = {
  d0c: { stages: ['registered'] },
  d1a: { stages: ['verified'] },
  d1b: { stages: ['scanning'] },
  d1c: { stages: ['review'] },
  rejection: { stages: ['titleConflict'] },
  d2a: { stages: ['eligibility'] },
  d2b: { stages: ['eligible'] },
  d2c: { stages: ['manual'] },
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
 */
export const flowGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const store = inject(ApplicationStore);
  const router = inject(Router);
  const rule = SCREEN_STAGES[route.data['screen'] as string];
  if (!rule) return true;
  if (!store.signedIn()) return router.parseUrl('/login');
  const stage = store.stage();
  const ok = !!stage && rule.stages.includes(stage) && (!rule.founder || rule.founder === store.founderType());
  return ok || router.parseUrl(store.resumeRoute());
};
