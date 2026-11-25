import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { StepPage } from '../../shared/step-page';
import { EimzaData } from '../data/eimza.data';

/** D-5b — Şirketiniz kuruldu. The four results with copy buttons, the next three things to do, the documents. */
@Component({
  selector: 'app-screen-d5b',
  imports: [Icon, StepPage],
  templateUrl: './d5b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD5b extends EimzaData {}
