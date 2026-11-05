import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { ApplicationStore } from '../core/application.store';
import { validTckn } from '../core/mock-api';
import { FormError } from './form-error';

/**
 * Simulated e-Devlet Kapısı hand-off for T.C. citizens. One step for both sign-up and sign-in:
 * the T.C. kimlik no is verified and everything else (name, e-mail, address) comes from e-Devlet.
 */
@Component({
  selector: 'app-edevlet-dialog',
  imports: [FormError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="closed.emit()"></div>
    <div role="dialog" aria-modal="true" aria-labelledby="edv-title" class="card">
      <div class="head">
        <img class="logo" src="/assets/brand/e-devlet.svg" alt="e-Devlet" width="28" height="28" />
        <span id="edv-title" class="title">e-Devlet Kapısı</span>
        <span class="sim">Simülasyon</span>
      </div>
      <form (submit)="$event.preventDefault(); submit()" class="body">
        <p class="lead">
          {{ mode() === 'login' ? 'Dijital Şirket Platformu’na e-Devlet ile giriş yapıyorsunuz.' : 'Hesabınız e-Devlet ile oluşturulur; e-posta doğrulaması gerekmez.' }}
          Hesabınız yoksa ilk girişte otomatik açılır.
        </p>
        <label>T.C. Kimlik No
          <input [value]="tckn()" (input)="setTckn($event)" inputmode="numeric" autocomplete="off" placeholder="11 haneli numara" autofocus />
        </label>
        <div class="from">
          <span class="from-title">e-Devlet’ten alınacak bilgiler</span>
          <span>Ad, soyad, T.C. kimlik no, yerleşim adresi ve kayıtlı e-posta adresiniz.</span>
        </div>
        <span class="hint">Demo için geçerli bir numara: <button type="button" class="link" (click)="tckn.set('10000000146')">10000000146</button></span>
        <app-form-error [message]="error()" />
        <div class="actions">
          <button type="button" class="ghost" (click)="closed.emit()">Vazgeç</button>
          <button type="submit" class="primary" [disabled]="store.busy()">{{ store.busy() ? 'Doğrulanıyor…' : 'e-Devlet ile devam et →' }}</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    .scrim { position: absolute; inset: 0; background: rgba(11, 20, 48, .55); }
    .card { position: relative; width: min(440px, calc(100vw - 32px)); background: var(--bg-FFFFFF); border-radius: 14px; overflow: hidden; box-shadow: 0 24px 60px -24px rgba(6,18,98, .5); }
    .head { display: flex; align-items: center; gap: 10px; padding: 14px 18px; background: var(--bg-F8F1F2); border-bottom: 1px solid var(--bd-F0D9DC); }
    .logo { display: block; flex: none; border-radius: 6px; }
    .title { flex: 1; font: 600 15px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-5C0A16); }
    .sim { font: 600 10px/14px 'IBM Plex Mono', monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--fg-8A93A6); }
    .body { display: flex; flex-direction: column; gap: 14px; padding: 18px; }
    .lead { margin: 0; font: 400 13.5px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); }
    label { display: flex; flex-direction: column; gap: 6px; font: 500 13px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); }
    input { height: 42px; box-sizing: border-box; border: 1px solid var(--bd-D6DEEE); border-radius: 9px; padding: 0 12px; font: 500 15px/20px 'IBM Plex Mono', monospace; letter-spacing: .04em; color: var(--fg-061262); outline: 0; }
    input:focus { border-color: var(--bd-061262); box-shadow: 0 0 0 3px rgba(6,18,98, .18); }
    .from { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 9px; background: var(--bg-F7F9FE); border: 1px dashed var(--bd-C7D5F7); font: 400 12.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-3B4660); }
    .from-title { font: 600 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .hint { font: 400 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .link { border: 0; background: none; padding: 0; font: 500 12px/16px 'IBM Plex Mono', monospace; color: var(--fg-061262); cursor: pointer; }
    .actions { display: flex; gap: 10px; justify-content: flex-end; }
    .ghost, .primary { border-radius: 10px; padding: 11px 18px; font: 600 14px/18px 'IBM Plex Sans', sans-serif; cursor: pointer; }
    .ghost { border: 1px solid var(--bd-D6DEEE); background: var(--bg-FFFFFF); color: var(--fg-061262); }
    .primary { border: 0; background: var(--bg-D0011B); color: var(--fg-FFFFFF); }
    .primary:disabled { opacity: .6; cursor: progress; }
  `,
})
export class EdevletDialog {
  /** Only changes the wording; both modes sign in, creating the account if needed. */
  readonly mode = input<'login' | 'register'>('login');
  readonly done = output<void>();
  readonly closed = output<void>();

  protected readonly store = inject(ApplicationStore);
  protected readonly tckn = signal('');
  /** Kept local so the page behind the dialog doesn't show the same message again. */
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.store.clearError();
  }

  protected setTckn(e: Event) {
    const el = e.target as HTMLInputElement;
    el.value = el.value.replace(/\D/g, '').slice(0, 11);
    this.tckn.set(el.value);
    this.error.set(null);
  }

  protected async submit() {
    if (!validTckn(this.tckn())) {
      this.error.set('Geçerli bir T.C. kimlik numarası girin.');
      return;
    }
    const ok = await this.store.edevlet(this.tckn());
    this.error.set(this.store.error());
    this.store.clearError();
    if (ok) this.done.emit();
  }
}
