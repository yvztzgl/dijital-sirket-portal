import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/** D-1d — Unvan rezerve edilemedi. One request: pick another title (three suggestions or your own); it is queried again at once. */
@Component({
  selector: 'app-screen-rejection',
  imports: [FormError, Icon, StepPage],
  templateUrl: './rejection.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenRejection extends KarsilamaData {}
