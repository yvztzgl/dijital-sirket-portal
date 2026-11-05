import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { AiCard } from '../../shared/ai-card';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { UygunlukData } from '../data/uygunluk.data';

/** D-2b — Uygunluk · tamamlandı. Üç aşama tek satıra kapandı; tarama satırları açılmış hâli gösteriliyor. */
@Component({
  selector: 'app-screen-d2b',
  imports: [AiCard, IText, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './d2b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD2b extends UygunlukData {}
