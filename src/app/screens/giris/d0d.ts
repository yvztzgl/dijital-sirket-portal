import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { RouterLink } from '@angular/router';
import { TopBar } from '../../shared/top-bar';
import { GirisData } from '../data/giris.data';

/** D-0d — Şifre sıfırlama. Bağlantı gönderildi durumu. Hesabın var olup olmadığını açıklamaz. */
@Component({
  selector: 'app-screen-d0d',
  imports: [FormError, Icon, RouterLink, TopBar],
  templateUrl: './d0d.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD0d extends GirisData {}
