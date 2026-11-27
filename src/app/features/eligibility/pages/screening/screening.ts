import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { StepPage } from '@layout/step-page';
import { EligibilityData } from '@features/eligibility/eligibility.data';

/**
 * D-2e — Uygunluk taraması. The third screen of step 2: the five lists are searched one after the
 * other and nothing is asked of the founder; when the last one ends the result screen opens
 * (D-2b, or D-2c for a manual review).
 */
@Component({
  selector: 'app-screening-page',
  imports: [Icon, StepPage],
  templateUrl: './screening.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreeningPage extends EligibilityData {}
