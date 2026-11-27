import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { SignatureData } from '@features/e-signature/e-signature.data';

/** D-4c — E-imza hazır. The certificate's details, the time left, one action: start the setup. */
@Component({
  selector: 'app-signature-ready-page',
  imports: [FormError, Icon, StepPage],
  templateUrl: './signature-ready.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignatureReadyPage extends SignatureData {}
