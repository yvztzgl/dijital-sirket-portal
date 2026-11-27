import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { ApplicationStore } from '@core/state/application.store';
import { Icon } from '@ui/icon';
import { DemoBar } from '@demo/demo-bar';
import { StepPage } from '@layout/step-page';
import { since } from '../../waiting.view';

/**
 * D-1f — Unvan kontrol ediliyor (stage `titleChecking`). Nothing is asked: the trade name waits for
 * staff (MERSİS has no endpoint yet), which can take hours. A status page, not a spinner: what is
 * done, what is waiting, and that the founder may close the page. In HTTP mode the store polls the
 * status read and the page moves on by itself; in the mock a short simulated check ends it.
 */
@Component({
  selector: 'app-title-check-page',
  imports: [DemoBar, Icon, StepPage],
  templateUrl: './title-check.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TitleCheckPage {
  private readonly store = inject(ApplicationStore);

  constructor() {
    this.store.clearError();
    followFlow();
    // Not shown here: read while waiting so D-1d and D-1c (after a refusal) have their choices at once.
    void this.store.loadReference();
    void this.store.loadEvaluationReference();
  }

  /** "Lumora Analitik Yazılım", the title waiting for its answer. */
  protected readonly checkingTitle = computed(() => this.store.app()?.titleCheck?.candidate ?? this.store.title());
  /** When it was asked, if known (the mock knows; the API does not send it). */
  protected readonly checkingSince = computed(() => since(this.store.app()?.titleCheck?.requestedAt));
}
