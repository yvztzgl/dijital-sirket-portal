import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { DemoServerApi } from '../core/demo-server-api';

/**
 * Demo controls against the real API (docs/api-client.md, "Demo mode against the API"): one line
 * that shows the code (or the password-reset link) last e-mailed to an address, read from the API's
 * development outbox (`GET /api/demo/codes?email=`). Shown only when `DemoServerApi.available()`.
 *
 * - `kind="code"`: "Demo: kod 123456" with "Doldur", which emits the code for the screen to put in its boxes.
 * - `kind="link"`: "Demo: sıfırlama bağlantısı" with "Bağlantıyı aç", which opens the link's path in
 *   this portal (so it works whatever port the portal is served on).
 *
 * With `fixed` it shows that code and reads nothing. Otherwise it reads again whenever `email` or `refresh` changes (the screen passes the time of its last send)
 * and on "Yenile" (the e-mail may be written a moment after the send was answered).
 */
@Component({
  selector: 'app-demo-code-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demo.available() && (email() || fixed())) {
      <div class="hint" role="status">
        <span class="tag">Demo</span>
        @if (kind() === 'code') {
          <span class="t">@if (fixed() ?? code(); as c) {kod <b>{{ c }}</b>} @else { {{ loading() ? 'kod okunuyor…' : 'kod henüz yok' }} }</span>
          @if (fixed() ?? code(); as c) {<button type="button" (click)="fill.emit(c)">Doldur</button>}
        } @else {
          <span class="t">@if (link()) {sıfırlama bağlantısı hazır} @else { {{ loading() ? 'bağlantı okunuyor…' : 'bağlantı henüz yok' }} }</span>
          @if (link(); as l) {<button type="button" (click)="open(l)">Bağlantıyı aç</button>}
        }
        @if (!fixed()) {<button type="button" class="ghost" (click)="load()" [disabled]="loading()">Yenile</button>}
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .hint {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 8px 12px; text-align: left;
      border: 1px dashed var(--bd-C7D5F7); border-radius: 10px; background: var(--bg-F7F9FE);
      font: 400 13px/18px 'IBM Plex Sans', system-ui, sans-serif; color: var(--fg-3B4660);
    }
    .tag {
      flex: none; padding: 2px 7px; border-radius: 6px; background: var(--bg-061262); color: var(--fg-FFFFFF);
      font: 600 10px/14px 'IBM Plex Sans', sans-serif; letter-spacing: .08em; text-transform: uppercase;
    }
    .t { flex: 1 1 auto; }
    b { font: 600 14px/18px 'IBM Plex Mono', monospace; letter-spacing: .08em; color: var(--fg-061262); }
    button {
      border: 1px solid var(--bd-C7D5F7); border-radius: 8px; padding: 4px 10px; background: var(--bg-FFFFFF);
      color: var(--fg-061262); font: 600 12px/16px 'IBM Plex Sans', sans-serif; cursor: pointer;
    }
    button.ghost { border-color: transparent; background: none; }
    button:focus-visible { outline: 2px solid var(--bd-061262); outline-offset: 2px; }
    button:disabled { opacity: .55; cursor: progress; }
  `,
})
export class DemoCodeHint {
  protected readonly demo = inject(DemoServerApi);
  private readonly router = inject(Router);

  /** The address the code or link was sent to. */
  readonly email = input<string | null | undefined>(null);
  /** Changes when the screen sent a new code (e.g. its send time); the hint then reads again. */
  readonly refresh = input<unknown>(null);
  readonly kind = input<'code' | 'link'>('code');
  /** A known code to show instead of reading the outbox (D-3b: the stand-in bank's fixed 3-D Secure code). */
  readonly fixed = input<string | null>(null);
  /** "Doldur": the code, for the screen's code boxes. */
  readonly fill = output<string>();

  protected readonly code = signal<string | null>(null);
  protected readonly link = signal<string | null>(null);
  protected readonly loading = signal(false);
  private reads = 0;

  constructor() {
    effect(() => {
      this.refresh();
      if (!this.demo.available() || !this.email() || this.fixed()) return;
      untracked(() => void this.load());
    });
  }

  protected async load() {
    const email = this.email();
    if (!email) return;
    const read = ++this.reads;
    this.loading.set(true);
    try {
      const r = await this.demo.codes(email);
      if (read !== this.reads) return;
      this.code.set(r.code);
      this.link.set(r.link);
    } catch {
      if (read === this.reads) {
        this.code.set(null);
        this.link.set(null);
      }
    } finally {
      if (read === this.reads) this.loading.set(false);
    }
  }

  /** Opens the e-mailed link's path and query inside this portal. */
  protected open(link: string) {
    try {
      const url = new URL(link, location.origin);
      void this.router.navigateByUrl(url.pathname + url.search);
    } catch {
      // Not a URL: nothing to open.
    }
  }
}
