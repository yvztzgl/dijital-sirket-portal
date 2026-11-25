import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OtpInput } from '../../shared/otp-input';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { UygunlukData } from '../data/uygunluk.data';

/** D-3b — 3D Secure. The bank's code step, shown as the bank's own plain card inside our page. */
@Component({
  selector: 'app-screen-d3b',
  imports: [FormError, OtpInput, StepPage],
  templateUrl: './d3b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD3b extends UygunlukData {}
