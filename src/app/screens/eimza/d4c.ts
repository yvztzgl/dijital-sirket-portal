import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { AiCard } from '../../shared/ai-card';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { EimzaData } from '../data/eimza.data';

/** D-4c — e-İmza · hazır. Sertifika kartı + 24 saatlik geri sayım halkası. */
@Component({
  selector: 'app-screen-d4c',
  imports: [AiCard, IText, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './d4c.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD4c extends EimzaData {}
