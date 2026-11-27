import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApplicationStore } from '@core/state/application.store';
import { HeaderTools } from '@layout/header-tools';
import { FormError } from '@layout/form-error';
import { IText, Icon } from '@ui/icon';
import { EMAIL_MESSAGE, PASSWORD_MESSAGE, isEmail, passwordMeter } from '../../auth.rules';
import { DotEngraving } from '../../components/dot-engraving';
import { EdevletDialog } from '../../components/edevlet-dialog';

type Path = 'foreign' | 'resident';

/** D-0b — Kayıt. İlk soru yolu belirler: yabancı kurucu e-posta ile, T.C. vatandaşı e-Devlet ile devam eder. */
@Component({
  selector: 'app-register-page',
  imports: [DotEngraving, EdevletDialog, FormError, HeaderTools, IText, Icon, RouterLink],
  templateUrl: './register.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);

  protected readonly form = signal({
    firstName: '',
    lastName: '',
    // Prefilled only in mock mode; HTTP mode keeps no e-mail in the browser.
    email: this.store.rememberedEmail(),
    password: '',
  });
  protected readonly ui = signal({ showPw: false, path: 'foreign' as Path, kvkk: false, terms: false });
  /** Validation messages show only after the first submit attempt. */
  protected readonly tried = signal(false);
  protected readonly edevlet = signal<null | 'register'>(null);

  constructor() {
    // Not shown here; taken so a message meant for another screen does not wait for a later one.
    this.store.takeNotice();
    this.store.clearError();
  }

  protected setField(key: 'firstName' | 'lastName' | 'email' | 'password', e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  private readonly meter = computed(() => passwordMeter(this.form().password));

  protected readonly formError = computed(() => {
    if (!this.tried()) return null;
    const f = this.form();
    if (this.ui().path === 'foreign') {
      if (!f.firstName.trim() || !f.lastName.trim()) return 'Adınızı ve soyadınızı pasaportunuzdaki gibi yazın.';
      if (!isEmail(f.email)) return EMAIL_MESSAGE;
      if (!this.meter().ok) return PASSWORD_MESSAGE;
      return null;
    }
    // Kept as it was: after a failed foreign attempt the resident path, which has no e-mail field,
    // still shows the e-mail message while the (hidden) address is invalid.
    return isEmail(f.email) ? null : EMAIL_MESSAGE;
  });

  protected async register() {
    if (this.ui().path === 'resident') {
      this.edevlet.set('register');
      return;
    }
    this.tried.set(true);
    if (this.formError() || this.vals().cantSubmit) return;
    const f = this.form();
    // The KVKK and terms ticks are checked here only: the API's register call has no field for them.
    if (await this.store.register({ firstName: f.firstName, lastName: f.lastName, email: f.email, password: f.password })) {
      this.store.rememberEmail(f.email);
      void this.router.navigateByUrl('/verify-email');
    }
  }

  protected edevletDone() {
    this.edevlet.set(null);
    void this.router.navigateByUrl(this.store.resumeRoute());
  }

  protected readonly vals = computed(() => {
    const u = this.ui();
    const set = (patch: Partial<typeof u>) => this.ui.update((s) => ({ ...s, ...patch }));
    const foreign = u.path === 'foreign';
    const can = u.kvkk && u.terms && !this.store.busy();
    const { strengthBars, strengthText, strengthColor } = this.meter();
    const P: [Path, string, string][] = [
      ['foreign', 'Yabancı uyruklu kurucu', 'Pasaport ile, Türkiye dışından'],
      ['resident', 'T.C. vatandaşı', 'e-Devlet Kapısı ile'],
    ];
    return {
      showPw: u.showPw,
      pwType: u.showPw ? 'text' : 'password',
      togglePw: () => set({ showPw: !u.showPw }),
      steps: [
        { n: 1, t: 'Sunum', d: 'Sunum ve özgeçmiş değerlendirilir' },
        { n: 2, t: 'Uygunluk', d: 'Kimlik ve AML kontrolü' },
        { n: 3, t: 'Ödeme', d: 'Tüm harçlar tek seferde' },
        { n: 4, t: 'e-İmza', d: 'Kısa görüntülü görüşme' },
        { n: 5, t: 'Kuruluş', d: 'Kurum adımları otomatik' },
      ],
      paths: P.map(([id, t, d]) => {
        const on = u.path === id;
        return {
          t,
          d,
          on,
          pick: () => set({ path: id }),
          pad: on ? '13px 15px' : '14px 16px',
          border: on ? '2px solid var(--bd-061262)' : '1px solid var(--bd-D6DEEE)',
          bg: on ? 'var(--bg-F7F9FE)' : 'var(--bg-FFFFFF)',
          dot: on ? '5px solid var(--bd-061262)' : '1.5px solid var(--bd-C9D2E3)',
        };
      }),
      foreign,
      resident: !foreign,
      consents: [
        { link: 'KVKK Aydınlatma Metni', rest: '’ni okudum, kişisel verilerimin başvuru kapsamında işlenmesine onay veriyorum.', on: u.kvkk, toggle: () => set({ kvkk: !u.kvkk }) },
        { link: 'Kullanım Koşulları', rest: '’nı kabul ediyorum.', on: u.terms, toggle: () => set({ terms: !u.terms }) },
      ],
      cantSubmit: !can,
      ctaBg: can ? 'var(--bg-061262)' : 'var(--bg-9AA6C4)',
      cta: this.store.busy() ? 'Hesap oluşturuluyor…' : foreign ? 'Hesap oluştur →' : 'e-Devlet ile devam et →',
      strengthBars,
      strengthText,
      strengthColor,
    };
  });
}
