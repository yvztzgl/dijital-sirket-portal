import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { SCREENING_LISTS } from '@core/reference/timeline';
import { ApplicationStore } from '@core/state/application.store';
import { hm } from '@core/utils/format';
import { StepPage } from '@layout/step-page';
import { Icon } from '@ui/icon';
import { doneStages, listTime, screeningListTimes } from '../../eligibility.view';

/** D-2b — Kimlik doğrulandı. The three finished checks and one action: go to payment. */
@Component({
  selector: 'app-eligible-page',
  imports: [Icon, StepPage],
  templateUrl: './eligible.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EligiblePage {
  protected readonly store = inject(ApplicationStore);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  protected readonly doneStages = computed(() => doneStages(this.store.app(), this.store.serverDecides));

  protected readonly listsOpen = signal(true);

  protected readonly lists = computed(() => {
    const times = screeningListTimes(this.store.app(), this.store.serverDecides, this.store.speed());
    return SCREENING_LISTS.map((n, i) => ({ n, t: listTime(times[i]) }));
  });

  protected readonly finishedAt = computed(() => {
    const f = this.store.app()?.eligibility?.finishedAt;
    return f ? hm(f) : '';
  });

  protected toPayment() {
    void this.store.proceedToPayment();
  }
}
