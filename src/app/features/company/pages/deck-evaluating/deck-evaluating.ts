import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { DemoBar } from '@demo/demo-bar';
import { StepPage } from '@layout/step-page';
import { CompanyData } from '@features/company/company.data';

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
export class DeckEvaluatingPage extends CompanyData {}
