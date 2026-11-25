import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { StepPage } from '../../shared/step-page';
import { EimzaData } from '../data/eimza.data';

/** D-4b — Görüşme sürüyor. Operator and founder side by side, the operator's words, the call's five steps. */
@Component({
  selector: 'app-screen-d4b',
  imports: [Icon, StepPage],
  templateUrl: './d4b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD4b extends EimzaData {}
