import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DemoServerApi } from '@core/api/demo/demo-server-api';
import { DemoCodeHint } from '@demo/demo-code-hint';
import { OtpInput } from '@ui/otp-input';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { EligibilityData } from '@features/eligibility/eligibility.data';

/** D-3b — 3D Secure. The bank's code step, shown as the bank's own plain card inside our page. */
@Component({
  selector: 'app-three-d-secure-page',
  imports: [DemoCodeHint, FormError, OtpInput, StepPage],
  templateUrl: './three-d-secure.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreeDSecurePage extends EligibilityData {
  /** http-demo build against a demo API: the stand-in bank's fixed code is shown under the boxes. */
  protected readonly demoServer = inject(DemoServerApi);
}
