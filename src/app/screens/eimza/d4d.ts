import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { EimzaData } from '../data/eimza.data';

/** D-4d — e-İmza · TC vatandaşı. Aynı adım, farklı yöntem: iki seçenek kartı. (Yalnızca içerik alanı) */
@Component({
  selector: 'app-screen-d4d',
  imports: [FormError, IText, Icon, Stepper, TopBar],
  templateUrl: './d4d.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD4d extends EimzaData {}
