import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationStore } from '@core/state/application.store';
import { FormError } from '@layout/form-error';
import { TopBar } from '@layout/top-bar';
import { IText, Icon } from '@ui/icon';
import { PASSWORD_MESSAGE, passwordMeter } from '../../auth.rules';

/**
 * D-0e — Yeni şifre. Opened from the password-reset e-mail (`/sifre-sifirla?token=…`, the address
 * the API puts in that e-mail). The founder types the new password twice; on success the login
 * screen says the password was changed. The server ends every session of the account and does
 * not sign in.
 */
@Component({
  selector: 'app-new-password-page',
  imports: [FormError, IText, Icon, RouterLink, TopBar],
  templateUrl: './new-password.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewPasswordPage {
  protected readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);

  protected readonly form = signal({
    password: '',
    /** The new password typed a second time. */
    repeat: '',
  });
  protected readonly ui = signal({ showPw: false });
  /** Validation messages show only after the first submit attempt. */
  protected readonly tried = signal(false);
  /**
   * The link's token, read once when the screen opens. It is then removed from the address bar
   * (the history entry is replaced), so it stays neither in the browser's history nor on screen.
   */
  protected readonly token: string | null;

  constructor() {
    // Not shown here; taken so a message meant for another screen does not wait for a later one.
    this.store.takeNotice();
    this.store.clearError();
    this.token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');
    if (this.token) inject(Location).replaceState('/sifre-sifirla');
  }

  protected setField(key: 'password' | 'repeat', e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  private readonly meter = computed(() => passwordMeter(this.form().password));

  protected readonly formError = computed(() => {
    if (!this.tried()) return null;
    const f = this.form();
    if (!this.meter().ok) return PASSWORD_MESSAGE;
    if (f.password !== f.repeat) return 'Yazdığınız iki şifre aynı değildir.';
    return null;
  });

  /** The token was read from the link when the screen opened. */
  protected async setNewPassword(token: string | null) {
    this.tried.set(true);
    if (!token || this.formError()) return;
    if (await this.store.confirmPasswordReset(token, this.form().password)) void this.router.navigateByUrl('/login');
  }

  protected readonly vals = computed(() => {
    const u = this.ui();
    const { strengthBars, strengthText, strengthColor } = this.meter();
    return {
      showPw: u.showPw,
      pwType: u.showPw ? 'text' : 'password',
      togglePw: () => this.ui.update((s) => ({ ...s, showPw: !u.showPw })),
      strengthBars,
      strengthText,
      strengthColor,
    };
  });
}
