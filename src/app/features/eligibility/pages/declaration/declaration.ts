import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormError } from '@layout/form-error';
import { Icon } from '@ui/icon';
import { StepPage } from '@layout/step-page';
import { EligibilityData } from '@features/eligibility/eligibility.data';

/**
 * D-2d — Beyan. The second screen of step 2: the founder uploads a document showing the declared
 * address and confirms that the application's information is true. Nothing here runs by itself;
 * "Beyanı onayla" starts the list search (D-2e).
 */
@Component({
  selector: 'app-declaration-page',
  imports: [FormError, Icon, StepPage],
  templateUrl: './declaration.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeclarationPage extends EligibilityData {}
