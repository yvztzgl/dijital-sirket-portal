import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { AiCard } from '../../shared/ai-card';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { KarsilamaData } from '../data/karsilama.data';

/** D-1d — MERSİS ret durumu. Panel alt çubuğun yerini alır; alternatif bir tıkla seçilir ve yeniden sorgulanır. */
@Component({
  selector: 'app-screen-rejection',
  imports: [AiCard, FormError, Icon, SidePanel, Stepper, TopBar],
  templateUrl: './rejection.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenRejection extends KarsilamaData {}
