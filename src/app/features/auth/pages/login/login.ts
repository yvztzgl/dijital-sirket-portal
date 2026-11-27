import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApplicationStore } from '@core/state/application.store';
import { HeaderTools } from '@layout/header-tools';
import { FormError } from '@layout/form-error';
import { IText, Icon } from '@ui/icon';
import { EMAIL_MESSAGE, isEmail } from '../../auth.rules';
import { DotEngraving } from '../../components/dot-engraving';
import { EdevletDialog } from '../../components/edevlet-dialog';

/** D-0a — Giriş. Kayıtlı kurucu kaldığı adımdan devam eder. T.C. vatandaşları e-Devlet ile girer. */
@Component({
  selector: 'app-login-page',
  imports: [DotEngraving, EdevletDialog, FormError, HeaderTools, IText, Icon, RouterLink],
  templateUrl: './login.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  protected readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);

  protected readonly form = signal({
    // Prefilled only in mock mode; HTTP mode keeps no e-mail in the browser.
    email: this.store.rememberedEmail(),
    password: '',
  });
  protected readonly ui = signal({ showPw: false, remember: true });
  /** Validation messages show only after the first submit attempt. */
  protected readonly tried = signal(false);
  protected readonly edevlet = signal<null | 'login'>(null);
  /** "Password changed", left by the set-new-password screen (D-0e). */
  protected readonly notice = this.store.takeNotice();

  constructor() {
    this.store.clearError();
  }

  protected setField(key: 'email' | 'password', e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected readonly formError = computed(() => {
    if (!this.tried()) return null;
    const f = this.form();
    if (!isEmail(f.email)) return EMAIL_MESSAGE;
    if (!f.password) return 'Şifrenizi yazın.';
    return null;
  });

  protected async login() {
    this.tried.set(true);
    if (this.formError()) return;
    const f = this.form();
    const ok = await this.store.login(f.email, f.password);
    this.store.rememberEmail(f.email);
    // Signed in, or the address still needs its code (stage `registered`): either way resume there.
    if (ok || this.store.stage() === 'registered') void this.router.navigateByUrl(this.store.resumeRoute());
  }

  protected edevletDone() {
    this.edevlet.set(null);
    void this.router.navigateByUrl(this.store.resumeRoute());
  }

  protected readonly vals = computed(() => {
    const u = this.ui();
    const set = (patch: Partial<typeof u>) => this.ui.update((s) => ({ ...s, ...patch }));
    return {
      email: this.form().email,
      onEmail: (e: Event) => this.setField('email', e),
      showPw: u.showPw,
      pwType: u.showPw ? 'text' : 'password',
      togglePw: () => set({ showPw: !u.showPw }),
      remember: u.remember,
      toggleRemember: () => set({ remember: !u.remember }),
      trust: ['Başvurunuz her adımda otomatik kaydedilir', 'Bağlantınız 256-bit SSL ile şifrelenir', 'Verileriniz KVKK kapsamında işlenir'],
    };
  });
}
