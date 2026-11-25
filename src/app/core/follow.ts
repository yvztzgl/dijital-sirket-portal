import { DestroyRef, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApplicationStore } from './application.store';
import { SCREEN_STAGES } from './flow.guard';
import { Stage } from './models';

export interface FollowOptions {
  /**
   * Lets a screen stay a moment before it gives way: gets the screen's id and the stage the
   * application moved to, returns how many milliseconds to wait (0 = leave at once).
   */
  linger?: (screen: string, stage: Stage | null) => number;
  /**
   * Lets a screen leave with an animation: returns a class name, or null for none. The move is then
   * made inside a browser view transition with that class on <html>, and styles keyed on the class
   * say how the two screens change over (see "founded" in src/wizard.scss).
   */
  transition?: (screen: string, stage: Stage | null) => string | null;
}

/**
 * Call from a screen's constructor: whenever the application moves to a stage this screen doesn't
 * show (a background step finished, an action succeeded, the founder signed out), navigate to
 * where the application now is. Public screens are left alone.
 *
 * D-5a passes options so the founder sees the finished building for a moment and then moves to
 * "Şirketiniz kuruldu" with an animation. Every other screen passes none and leaves at once.
 */
export function followFlow(options: FollowOptions = {}) {
  const store = inject(ApplicationStore);
  const router = inject(Router);
  const id = inject(ActivatedRoute).snapshot.data['screen'] as string | undefined;
  const rule = id ? SCREEN_STAGES[id] : undefined;
  if (!rule || !id) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const go = (stage: Stage | null) => {
    const nav = () => router.navigateByUrl(store.resumeRoute());
    const cls = options.transition?.(id, stage) ?? null;
    // Only this one move uses a view transition. It was tried for the whole router first
    // (withViewTransitions) and made every page change wait for a frame to be captured.
    if (!cls || !('startViewTransition' in document) || document.visibilityState !== 'visible') return void nav();
    let moved: Promise<boolean> | null = null;
    const once = () => (moved ??= nav());
    const root = document.documentElement;
    root.classList.add(cls);
    const clear = () => root.classList.remove(cls);
    try {
      // The browser pictures this screen, runs the callback, pictures the next one, then animates between them.
      const t = document.startViewTransition(async () => {
        await once();
        await new Promise((r) => setTimeout(r, 30)); // let the next screen render before it is pictured
      });
      t.finished.then(clear, clear);
      t.ready.catch(() => undefined);
    } catch {
      clear();
    }
    // If the browser never gets round to the callback (a throttled tab), move anyway.
    setTimeout(() => void once(), 600);
  };
  effect(() => {
    const stage = store.stage();
    const ok = !!stage && rule.stages.includes(stage) && (!rule.founder || rule.founder === store.founderType());
    clearTimeout(timer);
    if (ok) return;
    const ms = options.linger?.(id, stage) ?? 0;
    if (ms > 0) timer = setTimeout(() => go(stage), ms);
    else go(stage);
  });
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));
}
