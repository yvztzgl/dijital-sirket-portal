import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApplicationStore } from '../core/application.store';
import { SCREEN_STAGES } from '../core/flow.guard';
import { Stage } from '../core/models';
import { SCREENS } from '../screens/screens';

/**
 * Prototype navigation: open any designed screen. If the signed-in application can already show
 * it we just navigate; otherwise the demo founder is fast-forwarded to that stage first (the
 * user's own application is left untouched).
 */
@Injectable({ providedIn: 'root' })
export class DemoNav {
  private readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);
  readonly jumping = signal(false);
  /** Number of header-mounted screen pills; the floating fallback shows only when there are none. */
  readonly docked = signal(0);

  async open(screenId: string) {
    const screen = SCREENS.find((s) => s.id === screenId);
    if (!screen) return;
    const rule = SCREEN_STAGES[screenId];
    const stage = this.store.stage();
    if (screenId === 'd2m') {
      // The phone page opens from a link: put the demo founder on the identity step, not yet started, and make one.
      this.jumping.set(true);
      try {
        if (stage !== 'eligibility' || this.store.app()?.eligibility) await this.store.seed('eligibility');
        await this.store.createPhoneLink();
      } finally {
        this.jumping.set(false);
      }
      const token = this.store.app()?.phoneLink?.token;
      if (token) await this.router.navigateByUrl(`/eligibility/phone/${token}`);
      return;
    }
    const reachable =
      !rule || (!!stage && rule.stages.includes(stage) && (!rule.founder || rule.founder === this.store.founderType()));
    if (!reachable) {
      this.jumping.set(true);
      try {
        await this.store.seed(rule.stages[0] as Stage, rule.founder ?? 'foreign');
      } finally {
        this.jumping.set(false);
      }
    }
    await this.router.navigateByUrl('/' + screen.path);
  }
}
