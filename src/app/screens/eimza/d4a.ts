import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { EimzaData } from '../data/eimza.data';

/** D-4a — Görüntülü görüşme öncesi. Camera preview with device checks, one action: call the operator. */
@Component({
  selector: 'app-screen-d4a',
  imports: [FormError, Icon, StepPage],
  templateUrl: './d4a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD4a extends EimzaData {}
