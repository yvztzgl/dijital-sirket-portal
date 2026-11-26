import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DemoServerApi } from '../../core/demo-server-api';
import { DemoCodeHint } from '../../shell/demo-code-hint';
import { OtpInput } from '../../shared/otp-input';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { UygunlukData } from '../data/uygunluk.data';

/** D-3b — 3D Secure. The bank's code step, shown as the bank's own plain card inside our page. */
@Component({
  selector: 'app-screen-d3b',
  imports: [DemoCodeHint, FormError, OtpInput, StepPage],
  templateUrl: './d3b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD3b extends UygunlukData {
  /** http-demo build against a demo API: the stand-in bank's fixed code is shown under the boxes. */
  protected readonly demoServer = inject(DemoServerApi);
}
