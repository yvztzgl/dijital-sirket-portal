import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Icon } from '../../shared/icon';
import { Bot } from '../../shared/bot';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/** How long the Terminal AI suggestion shows its skeleton before the real row. */
const LOADING_MS = 800;

/** D-1d — Unvan rezerve edilemedi. One request: pick another title (three suggestions or your own); it is queried again at once. */
@Component({
  selector: 'app-screen-rejection',
  imports: [Bot, FormError, Icon, StepPage],
  templateUrl: './rejection.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenRejection extends KarsilamaData {
  /**
   * Terminal AI's "thinking" intro: for LOADING_MS the suggestion shows a skeleton (a shimmering
   * badge and name line) beside the thinking bot, then the real badge and name. "Seç" works
   * throughout. Under reduced motion there is no skeleton. Screen readers get the full name from
   * the template either way.
   */
  private readonly aiName = computed(() => this.alternatives().find((a) => a.first)?.full ?? '');
  protected readonly aiLoading = signal(true);

  constructor() {
    super();
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
}
