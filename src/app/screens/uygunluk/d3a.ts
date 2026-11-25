import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { UygunlukData } from '../data/uygunluk.data';

/** D-3a — Ödeme. One card: what the fee covers (always shown) beside the card form. */
@Component({
  selector: 'app-screen-d3a',
  imports: [FormError, Icon, StepPage],
  templateUrl: './d3a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD3a extends UygunlukData {}
