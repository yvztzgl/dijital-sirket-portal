import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { StepPage } from '../../shared/step-page';
import { UygunlukData } from '../data/uygunluk.data';

/**
 * D-2e — Uygunluk taraması. The third screen of step 2: the five lists are searched one after the
 * other and nothing is asked of the founder; when the last one ends the result screen opens
 * (D-2b, or D-2c for a manual review).
 */
@Component({
  selector: 'app-screen-d2e',
  imports: [Icon, StepPage],
  templateUrl: './d2e.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD2e extends UygunlukData {}
