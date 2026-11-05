import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { EimzaData } from '../data/eimza.data';

/** D-5a — Şirketiniz kuruluyor. Durum kartı + 9 kurum adımı. Belgeler sekmesi canlı doluyor. */
@Component({
  selector: 'app-screen-d5a',
  imports: [IText, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './d5a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD5a extends EimzaData {}
