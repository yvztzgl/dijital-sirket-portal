import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText } from '../../shared/icon';
import { AiCard } from '../../shared/ai-card';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { UygunlukData } from '../data/uygunluk.data';

/** D-2a — Uygunluk · yarı yolda. Pasaport okundu, canlılık kontrolü sürüyor. Sonraki aşamalar soluk. */
@Component({
  selector: 'app-screen-d2a',
  imports: [AiCard, IText, SidePanel, Stepper, TopBar],
  templateUrl: './d2a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD2a extends UygunlukData {}
