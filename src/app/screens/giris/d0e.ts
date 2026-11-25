import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormError } from '../../shared/form-error';
import { IText, Icon } from '../../shared/icon';
import { TopBar } from '../../shared/top-bar';
import { GirisData } from '../data/giris.data';

/**
 * D-0e — Yeni şifre. Opened from the password-reset e-mail (`/sifre-sifirla?token=…`, the address
 * the API puts in that e-mail). The founder types the new password twice; on success the login
 * screen says the password was changed. The server ends every session of the account and does
 * not sign in.
 */
@Component({
  selector: 'app-screen-d0e',
  imports: [FormError, IText, Icon, RouterLink, TopBar],
  templateUrl: './d0e.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD0e extends GirisData {
  /**
   * The link's token, read once when the screen opens. It is then removed from the address bar
   * (the history entry is replaced), so it stays neither in the browser's history nor on screen.
   */
  protected readonly token: string | null;

  constructor() {
    super();
    this.token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');
    if (this.token) inject(Location).replaceState('/sifre-sifirla');
  }
}
