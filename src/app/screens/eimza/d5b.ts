import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { EimzaData } from '../data/eimza.data';

/** D-5b — Şirketiniz kuruldu. Sakin kutlama: mühür halkası, tam unvan, kopyalanabilir sonuçlar, sonraki adımlar. */
@Component({
  selector: 'app-screen-d5b',
  imports: [IText, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './d5b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD5b extends EimzaData {}
