import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { OtpInput } from '../../shared/otp-input';
import { FormError } from '../../shared/form-error';
import { TopBar } from '../../shared/top-bar';
import { GirisData } from '../data/giris.data';

/** D-0c — E-posta doğrulama. 6 haneli kod. Doğrulanınca başvuru açılır ve Karşılama'ya (D-00) geçilir. */
@Component({
  selector: 'app-screen-d0c',
  imports: [FormError, IText, Icon, OtpInput, TopBar],
  templateUrl: './d0c.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD0c extends GirisData {}
