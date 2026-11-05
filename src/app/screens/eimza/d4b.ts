import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { EimzaData } from '../data/eimza.data';

/** D-4b — e-İmza · görüşme sırasında. Operatör + siz yan yana, altyazı, canlı kontrol listesi. */
@Component({
  selector: 'app-screen-d4b',
  imports: [IText, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './d4b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD4b extends EimzaData {}
