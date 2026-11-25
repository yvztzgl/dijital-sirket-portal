import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { StepPage } from '../../shared/step-page';
import { UygunlukData } from '../data/uygunluk.data';

/** D-2b — Kimlik doğrulandı. The three finished checks and one action: go to payment. */
@Component({
  selector: 'app-screen-d2b',
  imports: [Icon, StepPage],
  templateUrl: './d2b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD2b extends UygunlukData {}
