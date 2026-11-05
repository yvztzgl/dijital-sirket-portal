import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { AiCard } from '../../shared/ai-card';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { EimzaData } from '../data/eimza.data';

/** D-4a — e-İmza · görüşme öncesi. Kamera açıldı, önizleme hazır. Tek eylem: operatörü ara. */
@Component({
  selector: 'app-screen-d4a',
  imports: [AiCard, FormError, IText, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './d4a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD4a extends EimzaData {}
