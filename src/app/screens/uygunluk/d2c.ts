import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { AiCard } from '../../shared/ai-card';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { UygunlukData } from '../data/uygunluk.data';

/** D-2c — Manuel inceleme. Steppe Trade örneği. Ret değil: nedenler açık, iki yol eşit görünür. */
@Component({
  selector: 'app-screen-d2c',
  imports: [AiCard, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './d2c.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD2c extends UygunlukData {}
