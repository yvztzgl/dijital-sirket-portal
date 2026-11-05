import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OtpInput } from '../../shared/otp-input';
import { FormError } from '../../shared/form-error';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { UygunlukData } from '../data/uygunluk.data';

/** D-3b — 3D Secure. Banka tarzı modal; platform kimliğinden ayrışır. Simüle SMS sağ üstte. */
@Component({
  selector: 'app-screen-d3b',
  imports: [FormError, OtpInput, Stepper, TopBar],
  templateUrl: './d3b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD3b extends UygunlukData {}
