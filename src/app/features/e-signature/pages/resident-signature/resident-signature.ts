import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { SignatureData } from '@features/e-signature/e-signature.data';

/** D-4d — T.C. vatandaşı için imza. One choice between two methods, then start the setup. */
@Component({
  selector: 'app-resident-signature-page',
  imports: [FormError, Icon, StepPage],
  templateUrl: './resident-signature.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResidentSignaturePage extends SignatureData {}
