import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '@ui/icon';
import { OtpInput } from '@ui/otp-input';
import { FormError } from '@layout/form-error';
import { DemoCodeHint } from '@demo/demo-code-hint';
import { TopBar } from '@layout/top-bar';
import { AuthData } from '@features/auth/auth.data';

/** D-0c — E-posta doğrulama. 6 haneli kod. Doğrulanınca başvuru açılır ve Karşılama'ya (D-00) geçilir. */
@Component({
  selector: 'app-verify-email-page',
  imports: [DemoCodeHint, FormError, IText, Icon, OtpInput, TopBar],
  templateUrl: './verify-email.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailPage extends AuthData {}
