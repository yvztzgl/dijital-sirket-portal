import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { EimzaData } from '../data/eimza.data';

/** D-4c — E-imza hazır. The certificate's details, the time left, one action: start the setup. */
@Component({
  selector: 'app-screen-d4c',
  imports: [FormError, Icon, StepPage],
  templateUrl: './d4c.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD4c extends EimzaData {}
