import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { StepPage } from '../../shared/step-page';
import { EimzaData } from '../data/eimza.data';

/** D-5a — Şirketiniz kuruluyor. Nothing is asked: a status card with the agency steps and their state. */
@Component({
  selector: 'app-screen-d5a',
  imports: [IText, Icon, StepPage],
  templateUrl: './d5a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD5a extends EimzaData {}
