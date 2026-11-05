import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { AiCard } from '../../shared/ai-card';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { KarsilamaData } from '../data/karsilama.data';

/** D-1a — Proje sunumu yükleme. Büyük bırakma alanı; örnek sunumlar ikincil. */
@Component({
  selector: 'app-screen-d1a',
  imports: [AiCard, FormError, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './d1a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1a extends KarsilamaData {}
