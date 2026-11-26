import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { DemoBar } from '../../shell/demo-bar';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/**
 * D-1g — Ek bilgi gerekiyor (stage `evaluationQuestions`). A stop state: the evaluation needs more
 * information and the platform will contact the founder. No form: the questions' format is not
 * known yet, and their content does not reach the founder through the API.
 */
@Component({
  selector: 'app-screen-d1g',
  imports: [DemoBar, Icon, StepPage],
  templateUrl: './d1g.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1g extends KarsilamaData {}
