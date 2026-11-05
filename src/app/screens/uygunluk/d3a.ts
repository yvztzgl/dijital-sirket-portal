import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { AiCard } from '../../shared/ai-card';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { UygunlukData } from '../data/uygunluk.data';

/** D-3a — Ödeme formu. Özet yalnızca toplamı gösterir; 4 kalem dökümü kapalı. */
@Component({
  selector: 'app-screen-d3a',
  imports: [AiCard, FormError, IText, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './d3a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD3a extends UygunlukData {}
