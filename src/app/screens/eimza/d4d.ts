import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { EimzaData } from '../data/eimza.data';

/** D-4d — T.C. vatandaşı için imza. One choice between two methods, then start the setup. */
@Component({
  selector: 'app-screen-d4d',
  imports: [FormError, Icon, StepPage],
  templateUrl: './d4d.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD4d extends EimzaData {}
