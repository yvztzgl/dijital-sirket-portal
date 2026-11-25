import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/**
 * D-1b — Sunum değerlendiriliyor (stage `evaluating`). Nothing is asked: the outside evaluation
 * service takes minutes. A status page, not a progress bar (its duration is not known): what was
 * received, that the evaluation runs (the attempt only when above 1), and that the founder may close
 * the page. In HTTP mode the store polls the status read; in the mock a short timer ends it.
 */
@Component({
  selector: 'app-screen-d1b',
  imports: [Icon, StepPage],
  templateUrl: './d1b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1b extends KarsilamaData {}
