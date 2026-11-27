import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { EligibilityData } from '@features/eligibility/eligibility.data';

/** D-3a — Ödeme. One card: what the fee covers (always shown) beside the card form. */
@Component({
  selector: 'app-payment-form-page',
  imports: [FormError, Icon, StepPage],
  templateUrl: './payment-form.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentFormPage extends EligibilityData {}
