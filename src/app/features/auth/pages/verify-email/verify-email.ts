import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DemoCodeHint } from '@demo/demo-code-hint';
import { ApplicationStore } from '@core/state/application.store';
import { FormError } from '@layout/form-error';
import { TopBar } from '@layout/top-bar';
import { IText, Icon } from '@ui/icon';
import { OtpInput } from '@ui/otp-input';
import { resendTimer } from '../../resend-timer';

/** D-0c — E-posta doğrulama. 6 haneli kod. Doğrulanınca başvuru açılır ve Karşılama'ya (D-00) geçilir. */
@Component({
  selector: 'app-verify-email-page',
  imports: [DemoCodeHint, FormError, IText, Icon, OtpInput, TopBar],
  templateUrl: './verify-email.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailPage {
  protected readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);

  protected readonly otp = signal('');
  private readonly timer = resendTimer();
  protected readonly resendAt = this.timer.at;
  protected readonly resendIn = this.timer.left;
  protected readonly resendLabel = this.timer.label;
  /** The server's "not confirmed yet, a new code was sent", left by the login screen. */
  protected readonly notice = this.store.takeNotice();

  constructor() {
    this.store.clearError();
  }

  protected readonly vals = computed(() => ({ verifyEmail: this.store.pendingEmail() ?? '' }));

  protected async verify(code = this.otp()) {
    // One code at a time: the code boxes can report "complete" again while a check is in flight,
    // and parallel checks of one code collide on the server (409).
    if (this.store.busy()) return;
    if (!/^\d{6}$/.test(code)) {
      this.store.error.set('6 haneli kodu girin.');
      return;
    }
    if (await this.store.verifyEmail(code)) void this.router.navigateByUrl(this.store.resumeRoute());
  }

  protected async resend() {
    if (this.resendIn() > 0) return;
    this.otp.set('');
    if (await this.store.resendEmailCode()) this.timer.restart();
  }

  /** "E-postayı değiştir": forget the address waiting for its code and register again. */
  protected async changeEmail() {
    await this.store.logout();
    void this.router.navigateByUrl('/register');
  }
}
