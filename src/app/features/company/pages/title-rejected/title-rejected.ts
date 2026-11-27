import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { followFlow } from '@core/flow/follow';
import { ApplicationStore } from '@core/state/application.store';
import { Icon } from '@ui/icon';
import { Bot } from '@layout/bot';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { titleSuggestions } from '../../title.view';

/** How long the Terminal AI suggestion shows its skeleton before the real row. */
const LOADING_MS = 800;

/** D-1d — Unvan rezerve edilemedi. One request: pick another title (three suggestions or your own); it is queried again at once. */
@Component({
  selector: 'app-title-rejected-page',
  imports: [Bot, FormError, Icon, StepPage],
  templateUrl: './title-rejected.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TitleRejectedPage {
  protected readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);

  protected readonly titleCheck = computed(() => this.store.app()?.titleCheck);
  protected readonly alternatives = computed(() => titleSuggestions(this.titleCheck()));
  protected readonly customOpen = signal(false);
  protected readonly customTitle = signal('');

  /**
   * Terminal AI's "thinking" intro: for LOADING_MS the suggestion shows a skeleton (a shimmering
   * badge and name line) beside the thinking bot, then the real badge and name. "Seç" works
   * throughout. Under reduced motion there is no skeleton. Screen readers get the full name from
   * the template either way.
   */
  private readonly aiName = computed(() => this.alternatives().find((a) => a.first)?.full ?? '');
  protected readonly aiLoading = signal(true);

  constructor() {
    this.store.clearError();
    followFlow();
    // Not shown here: read now so D-1c ("Diğer bilgilere dön") has its choices at once.
    void this.store.loadReference();
    void this.store.loadEvaluationReference();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { if (timer) clearTimeout(timer); timer = undefined; };
    inject(DestroyRef).onDestroy(stop);
    // Runs again whenever a new suggestion arrives (for example after a second refusal).
    effect(() => {
      const name = this.aiName();
      stop();
      const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!name || still) { this.aiLoading.set(false); return; }
      this.aiLoading.set(true);
      timer = setTimeout(() => this.aiLoading.set(false), LOADING_MS);
    });
  }

  /** A refusal's message for one field, under the API's field name (only HTTP mode names fields). */
  protected fieldError(key: string): string | null {
    return this.store.fieldErrors()[key]?.[0] ?? null;
  }

  protected chooseTitle(t: string) {
    if (!t.trim()) return;
    void this.store.chooseTitle(t);
  }

  /**
   * "Diğer bilgilere dön": after a refused title the API still takes changes to the review and a new
   * "Onayla ve devam et" (which asks for the review's trade name again), with no call that changes
   * the stage. So this only opens D-1c, which accepts `titleConflict` too.
   */
  protected editAgain() {
    void this.router.navigateByUrl('/deck/review');
  }
}
