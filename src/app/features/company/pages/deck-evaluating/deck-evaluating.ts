import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { ApplicationStore } from '@core/state/application.store';
import { Icon } from '@ui/icon';
import { DemoBar } from '@demo/demo-bar';
import { StepPage } from '@layout/step-page';
import { since, uploadedFiles } from '../../waiting.view';

/**
 * D-1b — Sunum değerlendiriliyor (stage `evaluating`). Nothing is asked: the outside evaluation
 * service takes minutes. A status page, not a progress bar (its duration is not known): what was
 * received, that the evaluation runs (since when; never the retry count), and that the founder may close
 * the page. In HTTP mode the store polls the status read; in the mock a short timer ends it.
 */
@Component({
  selector: 'app-deck-evaluating-page',
  imports: [DemoBar, Icon, StepPage],
  templateUrl: './deck-evaluating.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckEvaluatingPage {
  private readonly store = inject(ApplicationStore);

  constructor() {
    this.store.clearError();
    followFlow();
    // Not shown here: read while waiting so D-1c's (and, after a failed evaluation, D-1a's) choices are there at once.
    void this.store.loadReference();
    void this.store.loadEvaluationReference();
  }

  // The service's retry count (`evaluation.attempt` / `maxAttempts`) is not shown to the founder
  // (owner's decision of 2026-11-26): only when the evaluation started.
  protected readonly evaluationSince = computed(() => since(this.store.app()?.evaluation?.startedAt));
  protected readonly uploadedFiles = computed(() => uploadedFiles(this.store.app()));
}
