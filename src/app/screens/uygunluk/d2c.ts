import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { UygunlukData } from '../data/uygunluk.data';

/** D-2c — Manuel inceleme. Why the file is being reviewed, what was checked, and two ways on. */
@Component({
  selector: 'app-screen-d2c',
  imports: [FormError, Icon, StepPage],
  templateUrl: './d2c.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD2c extends UygunlukData {}
