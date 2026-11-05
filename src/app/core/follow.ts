import { effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApplicationStore } from './application.store';
import { SCREEN_STAGES } from './flow.guard';

/**
 * Call from a screen's constructor: whenever the application moves to a stage this screen doesn't
 * show (a background step finished, an action succeeded, the founder signed out), navigate to
 * where the application now is. Public screens are left alone.
 */
export function followFlow() {
  const store = inject(ApplicationStore);
  const router = inject(Router);
  const id = inject(ActivatedRoute).snapshot.data['screen'] as string | undefined;
  const rule = id ? SCREEN_STAGES[id] : undefined;
  if (!rule) return;
  effect(() => {
    const stage = store.stage();
    const ok = !!stage && rule.stages.includes(stage) && (!rule.founder || rule.founder === store.founderType());
    if (!ok) void router.navigateByUrl(store.resumeRoute());
  });
}
