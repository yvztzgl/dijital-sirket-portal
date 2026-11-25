import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormError } from '../../shared/form-error';
import { Icon } from '../../shared/icon';
import { StepPage } from '../../shared/step-page';
import { UygunlukData } from '../data/uygunluk.data';

/**
 * D-2d — Beyan. The second screen of step 2: the founder uploads a document showing the declared
 * address and confirms that the application's information is true. Nothing here runs by itself;
 * "Beyanı onayla" starts the list search (D-2e).
 */
@Component({
  selector: 'app-screen-d2d',
  imports: [FormError, Icon, StepPage],
  templateUrl: './d2d.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD2d extends UygunlukData {}
