import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { SCREENING_LISTS } from '@core/reference/timeline';
import { ApplicationStore } from '@core/state/application.store';
import { StepPage } from '@layout/step-page';
import { Icon } from '@ui/icon';
import { listTime, screeningListTimes } from '../../eligibility.view';

/**
 * D-2e — Uygunluk taraması. The third screen of step 2: the five lists are searched one after the
 * other and nothing is asked of the founder; when the last one ends the result screen opens
 * (D-2b, or D-2c for a manual review).
 */
@Component({
  selector: 'app-screening-page',
  imports: [Icon, StepPage],
  templateUrl: './screening.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreeningPage {
  private readonly store = inject(ApplicationStore);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  /**
   * The mock ticks the lists off one by one with simulated times. With the server only the end
   * is known (the API reports no per-list result), so every list shows as being searched and the bar
   * moves without reaching the end until the server's next stage.
   */
  protected readonly scr = computed(() => {
    const s = this.store.screening();
    if (this.store.serverDecides) {
      return { done: null, percent: Math.round((s?.p ?? 0) * 100), lists: SCREENING_LISTS.map((n) => ({ n, st: 'now', t: '' })) };
    }
    const times = screeningListTimes(this.store.app(), this.store.serverDecides, this.store.speed());
    const done = s?.listsDone ?? 0;
    return {
      done,
      percent: done * 20,
      lists: SCREENING_LISTS.map((n, i) => ({ n, st: i < done ? 'ok' : i === done ? 'now' : '', t: i < done ? listTime(times[i]) : '' })),
    };
  });
}
