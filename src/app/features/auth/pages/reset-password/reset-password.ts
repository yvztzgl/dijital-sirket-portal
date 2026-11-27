import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { FormError } from '@layout/form-error';
import { RouterLink } from '@angular/router';
import { DemoCodeHint } from '@demo/demo-code-hint';
import { TopBar } from '@layout/top-bar';
import { AuthData } from '@features/auth/auth.data';

/** D-0d — Şifre sıfırlama. Bağlantı gönderildi durumu. Hesabın var olup olmadığını açıklamaz. */
@Component({
  selector: 'app-reset-password-page',
  imports: [DemoCodeHint, FormError, Icon, RouterLink, TopBar],
  templateUrl: './reset-password.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage extends AuthData {}
