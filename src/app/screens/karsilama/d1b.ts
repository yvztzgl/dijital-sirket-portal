import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { AiCard } from '../../shared/ai-card';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { KarsilamaData } from '../data/karsilama.data';

/** D-1b — AI taraması. ~4,5 sn. Sayfa şeridi + alanların kaynağıyla birlikte tek tek belirmesi. */
@Component({
  selector: 'app-screen-d1b',
  imports: [AiCard, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './d1b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1b extends KarsilamaData {}
