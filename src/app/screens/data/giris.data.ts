import { computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApplicationStore } from '../../core/application.store';
import { Clock } from '../../core/clock';
import { clock } from '../../core/format';
import { passwordStrength } from '../../core/mock-api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAST_EMAIL = 'dsp.lastEmail';

/** Login, register, e-mail verification and password reset (Ekranlar 0). */
export class GirisData {
  protected readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);
  private readonly now = inject(Clock).now;

  protected readonly form = signal({
    firstName: '',
    lastName: '',
    email: localStorage.getItem(LAST_EMAIL) ?? '',
    password: '',
  });
  protected readonly ui = signal({ showPw: false, remember: true, path: 'foreign' as 'foreign' | 'resident', kvkk: false, terms: false });
  /** Validation messages show only after the first submit attempt. */
  protected readonly tried = signal(false);
  protected readonly edevlet = signal<null | 'login' | 'register'>(null);
  protected readonly otp = signal('');
  protected readonly resetSent = signal(false);
  private readonly resendAt = signal(Date.now() + 60_000);

  constructor() {
    this.store.clearError();
  }

  protected setField(key: 'firstName' | 'lastName' | 'email' | 'password', e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected readonly strength = computed(() => passwordStrength(this.form().password));

  protected readonly formError = computed(() => {
    if (!this.tried()) return null;
    const f = this.form();
    if (this.router.url.startsWith('/register') && this.ui().path === 'foreign') {
      if (!f.firstName.trim() || !f.lastName.trim()) return 'Adınızı ve soyadınızı pasaportunuzdaki gibi yazın.';
      if (!EMAIL_RE.test(f.email)) return 'Geçerli bir e-posta adresi girin.';
      if (!this.strength().ok) return 'Şifre en az 10 karakter olmalı ve harf, rakam, sembol içermeli.';
      return null;
    }
    if (!EMAIL_RE.test(f.email)) return 'Geçerli bir e-posta adresi girin.';
    if (this.router.url.startsWith('/login') && !f.password) return 'Şifrenizi yazın.';
    return null;
  });

  // ------------------------------------------------------------------------------ actions

  protected async login() {
    this.tried.set(true);
    if (this.formError()) return;
    const f = this.form();
    if (await this.store.login(f.email, f.password)) {
      localStorage.setItem(LAST_EMAIL, f.email.trim());
      void this.router.navigateByUrl(this.store.resumeRoute());
    }
  }

  protected async register() {
    if (this.ui().path === 'resident') {
      this.edevlet.set('register');
      return;
    }
    this.tried.set(true);
    if (this.formError() || this.vals().cantSubmit) return;
    const f = this.form();
    if (await this.store.register(f)) {
      localStorage.setItem(LAST_EMAIL, f.email.trim());
      void this.router.navigateByUrl('/verify-email');
    }
  }

  protected edevletDone() {
    this.edevlet.set(null);
    void this.router.navigateByUrl(this.store.resumeRoute());
  }

  protected async verify(code = this.otp()) {
    if (!/^\d{6}$/.test(code)) {
      this.store.error.set('6 haneli kodu girin.');
      return;
    }
    if (await this.store.verifyEmail(code)) void this.router.navigateByUrl('/deck');
  }

  protected async resend() {
    if (this.resendIn() > 0) return;
    this.otp.set('');
    if (await this.store.resendEmailCode()) this.resendAt.set(Date.now() + 60_000);
  }

  protected readonly resendIn = computed(() => Math.max(0, this.resendAt() - this.now()));
  protected readonly resendLabel = computed(() => clock(this.resendIn()));

  protected async requestReset() {
    this.tried.set(true);
    if (!EMAIL_RE.test(this.form().email)) return;
    if (await this.store.requestPasswordReset(this.form().email)) {
      this.resetSent.set(true);
      this.resendAt.set(Date.now() + 60_000);
    }
  }

  /** Signed-in user who returns to the register page: offer to change e-mail = sign out. */
  protected changeEmail() {
    this.store.logout();
    void this.router.navigateByUrl('/register');
  }

  // --------------------------------------------------------------------------- view model

  protected readonly vals = computed(() => {
    const u = this.ui();
    const f = this.form();
    const set = (patch: Partial<typeof u>) => this.ui.update((s) => ({ ...s, ...patch }));
    const foreign = u.path === 'foreign';
    const can = u.kvkk && u.terms && !this.store.busy();
    const st = this.strength();
    const P: ['foreign' | 'resident', string, string][] = [
      ['foreign', 'Yabancı uyruklu kurucu', 'Pasaport ile, Türkiye dışından'],
      ['resident', 'T.C. vatandaşı', 'e-Devlet Kapısı ile'],
    ];
    const strengthColor = ['var(--fg-B42318)', 'var(--fg-B42318)', 'var(--fg-B54708)', 'var(--fg-15803D)', 'var(--fg-15803D)'][st.score];
    return {
      email: f.email,
      onEmail: (e: Event) => this.setField('email', e),
      showPw: u.showPw,
      pwType: u.showPw ? 'text' : 'password',
      togglePw: () => set({ showPw: !u.showPw }),
      remember: u.remember,
      toggleRemember: () => set({ remember: !u.remember }),
      trust: ['Başvurunuz her adımda otomatik kaydedilir', 'Bağlantınız 256-bit SSL ile şifrelenir', 'Verileriniz KVKK kapsamında işlenir'],
      steps: [
        { n: 1, t: 'Sunum', d: 'AI bilgilerinizi okur' },
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
      strengthBars: [0, 1, 2, 3].map((i) => (f.password && i < Math.max(1, st.score) ? strengthColor : 'var(--bg-E5E7EB)')),
      strengthText: f.password ? `${st.ok ? '✓ ' : ''}${st.label} · en az 10 karakter, harf, rakam ve sembol` : 'En az 10 karakter, harf, rakam ve sembol',
      strengthColor: f.password ? strengthColor : 'var(--fg-5B6478)',
      verifyEmail: this.store.account()?.email ?? '',
    };
  });
}
