import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { FormError } from '@layout/form-error';
import { DemoBar } from '@demo/demo-bar';
import { StepPage } from '@layout/step-page';
import { EligibilityData } from '@features/eligibility/eligibility.data';

/** D-2c — Manuel inceleme. Why the file is being reviewed, what was checked, and two ways on. */
@Component({
  selector: 'app-manual-review-page',
  imports: [DemoBar, FormError, Icon, StepPage],
  templateUrl: './manual-review.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualReviewPage extends EligibilityData {}
