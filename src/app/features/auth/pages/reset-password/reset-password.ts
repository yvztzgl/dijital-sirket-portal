import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DemoCodeHint } from '@demo/demo-code-hint';
import { ApplicationStore } from '@core/state/application.store';
import { FormError } from '@layout/form-error';
import { TopBar } from '@layout/top-bar';
import { Icon } from '@ui/icon';
import { EMAIL_MESSAGE, isEmail } from '../../auth.rules';
import { resendTimer } from '../../resend-timer';

/** D-0d — Şifre sıfırlama. Bağlantı gönderildi durumu. Hesabın var olup olmadığını açıklamaz. */
@Component({
  selector: 'app-reset-password-page',
  imports: [DemoCodeHint, FormError, Icon, RouterLink, TopBar],
  templateUrl: './reset-password.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage {
  protected readonly store = inject(ApplicationStore);

  protected readonly form = signal({
    // Prefilled only in mock mode; HTTP mode keeps no e-mail in the browser.
    email: this.store.rememberedEmail(),
  });
  /** Validation messages show only after the first submit attempt. */
  protected readonly tried = signal(false);
  protected readonly resetSent = signal(false);
  private readonly timer = resendTimer();
  protected readonly resendAt = this.timer.at;
  protected readonly resendIn = this.timer.left;
  protected readonly resendLabel = this.timer.label;

  constructor() {
    // Not shown here; taken so a message meant for another screen does not wait for a later one.
    this.store.takeNotice();
    this.store.clearError();
  }

  protected setField(key: 'email', e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected readonly formError = computed(() => (this.tried() && !isEmail(this.form().email) ? EMAIL_MESSAGE : null));

  protected async requestReset() {
    this.tried.set(true);
    const email = this.form().email;
    if (!isEmail(email)) return;
    if (await this.store.requestPasswordReset(email)) {
      this.resetSent.set(true);
      this.timer.restart();
    }
  }
}
