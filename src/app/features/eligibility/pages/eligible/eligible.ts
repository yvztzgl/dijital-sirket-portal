import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { StepPage } from '@layout/step-page';
import { EligibilityData } from '@features/eligibility/eligibility.data';

/** D-2b — Kimlik doğrulandı. The three finished checks and one action: go to payment. */
@Component({
  selector: 'app-eligible-page',
  imports: [Icon, StepPage],
  templateUrl: './eligible.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EligiblePage extends EligibilityData {}
