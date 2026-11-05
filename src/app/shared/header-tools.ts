import { booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core';
import { ApplicationStore } from '../core/application.store';
import { Assistant } from '../core/assistant';
import { Lang, Preferences } from '../core/preferences';
import { ScreenPill } from '../shell/screen-pill';
import { Icon } from './icon';

/**
 * Header utilities shared by every header: help menu, light/dark theme toggle and language menu.
 * `dark` adapts the colours for the navy welcome hero.
 */
@Component({
  selector: 'app-header-tools',
  imports: [Icon, ScreenPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.dark]': 'dark()',
    '(document:click)': 'outside($event)',
    '(document:keydown.escape)': 'open.set(null)',
  },
  template: `
    <div class="wrap">
      <app-screen-pill class="screens" [dark]="dark()" [compact]="compact()" />
      <button type="button" class="btn" (click)="toggle('help')" [attr.aria-expanded]="open() === 'help'" aria-haspopup="menu">
        <app-icon name="help" size="17px" [stroke]="1.9" />
        <span class="label">Yardım</span>
      </button>
      @if (open() === 'help') {
        <div class="menu help" role="menu">
          @if (store.signedIn()) {
            <button type="button" role="menuitem" class="item" (click)="askAi()">
              <app-icon name="sparkles" size="16px" />
              <span><b>Terminal AI’ye sorun</b><small>Bu adımla ilgili anında yanıt</small></span>
            </button>
          }
          <a role="menuitem" class="item" href="mailto:destek@dijitalsirket.gov.tr">
            <app-icon name="mail" size="16px" />
            <span><b>destek&#64;dijitalsirket.gov.tr</b><small>1 iş günü içinde yanıt</small></span>
          </a>
          <div class="item static">
            <app-icon name="info" size="16px" />
            <span><b>0850 455 00 00</b><small>Hafta içi 09:00–18:00 · TR / EN</small></span>
          </div>
        </div>
      }

      <button
        type="button"
        class="btn icon-only"
        (click)="prefs.toggleTheme()"
        [attr.aria-pressed]="isDark()"
        [attr.aria-label]="isDark() ? 'Açık temaya geç' : 'Koyu temaya geç'"
        [attr.title]="isDark() ? 'Açık tema' : 'Koyu tema'"
      >
        @if (isDark()) {<app-icon class="theme-ico" name="sun" size="17px" [stroke]="1.9" />} @else {<app-icon class="theme-ico" name="moon" size="17px" [stroke]="1.9" />}
      </button>

      <button type="button" class="btn" (click)="toggle('lang')" [attr.aria-expanded]="open() === 'lang'" aria-haspopup="menu" aria-label="Dil seçin">
        <img class="flag" [src]="flagOf(prefs.state().lang)" alt="" width="20" height="14" />
        <span class="code">{{ prefs.state().lang.toUpperCase() }}</span>
        <app-icon name="chevron-down" size="14px" />
      </button>
      @if (open() === 'lang') {
        <div class="menu lang" role="menu">
          @for (l of langs; track l.code) {
            <button type="button" role="menuitemradio" class="item" [attr.aria-checked]="prefs.state().lang === l.code" [disabled]="!l.ready" (click)="pick(l.code)">
              <img class="flag lg" [src]="flagOf(l.code)" alt="" width="24" height="17" />
              <span><b>{{ l.name }}</b>@if (!l.ready) {<small>Yakında</small>}</span>
              @if (prefs.state().lang === l.code) {<app-icon class="tick" name="check" size="16px" />}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    .wrap { position: relative; display: flex; align-items: center; gap: 4px; }
    .screens { margin-right: 8px; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px;
      border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--fg-3B4660);
      font: 500 13px/18px 'IBM Plex Sans', sans-serif; cursor: pointer; transition: background .15s, color .15s;
    }
    .btn:hover, .btn[aria-expanded='true'] { background: var(--bg-F1F4FA); color: var(--fg-061262); }
    .btn.icon-only { width: 36px; padding: 0; justify-content: center; }
    .theme-ico { animation: themeIn .3s cubic-bezier(.2, .8, .2, 1); }
    @keyframes themeIn { from { opacity: 0; transform: rotate(-60deg) scale(.6); } }
    @media (prefers-reduced-motion: reduce) { .theme-ico { animation: none; } }
    .code { font: 600 12px/16px 'IBM Plex Mono', monospace; letter-spacing: .04em; }
    .menu {
      position: absolute; top: calc(100% + 8px); z-index: 960; min-width: 240px; padding: 6px;
      background: var(--bg-FFFFFF); border: 1px solid var(--bd-E5E7EB); border-radius: 12px; box-shadow: 0 16px 40px -16px rgba(6,18,98, .35);
      animation: menuIn .14s cubic-bezier(.2, .8, .2, 1) both;
    }
    .menu.help { left: 0; width: 290px; }
    .menu.lang { right: 0; }
    .item {
      width: 100%; box-sizing: border-box; display: flex; align-items: flex-start; gap: 10px; padding: 9px 10px; border: 0; border-radius: 8px;
      background: transparent; color: var(--fg-061262); text-align: left; text-decoration: none; cursor: pointer; font-family: inherit;
    }
    .item:hover:not(:disabled):not(.static) { background: var(--bg-F7F9FE); text-decoration: none; }
    .item.static { cursor: default; color: var(--fg-5B6478); }
    .item:disabled { cursor: not-allowed; opacity: .6; }
    .item app-icon { margin-top: 2px; }
    .item span { display: flex; flex-direction: column; gap: 1px; flex: 1; }
    .item b { font: 600 13px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .item small { font: 400 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .flag { flex: none; display: block; width: 20px; height: 14px; object-fit: cover; border-radius: 3px; box-shadow: 0 0 0 1px rgba(6, 18, 98, .12); }
    .flag.lg { width: 24px; height: 17px; margin-top: 1px; }
    .tick { color: var(--fg-15803D); }
    :host(.dark) .btn { color: var(--fg-E6EBF7); }
    :host(.dark) .btn:hover, :host(.dark) .btn[aria-expanded='true'] { background: rgba(255, 255, 255, .12); color: var(--fg-FFFFFF); }
    @keyframes menuIn { from { opacity: 0; transform: translateY(-4px); } }
  `,
})
export class HeaderTools {
  readonly dark = input(false);
  /** Tight headers (login/register panel): screen pill shows only the screen code. */
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly store = inject(ApplicationStore);
  protected readonly prefs = inject(Preferences);
  private readonly assistant = inject(Assistant);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly isDark = computed(() => this.prefs.state().theme === 'dark');
  protected readonly open = signal<'help' | 'lang' | null>(null);
  protected readonly langs: { code: Lang; name: string; ready: boolean }[] = [
    { code: 'tr', name: 'Türkçe', ready: true },
    { code: 'en', name: 'English', ready: false },
  ];

  protected flagOf(code: Lang) {
    return `/assets/flags/${code === 'en' ? 'gb' : code}.svg`;
  }

  protected toggle(m: 'help' | 'lang') {
    this.open.set(this.open() === m ? null : m);
  }

  protected outside(e: Event) {
    if (!this.host.contains(e.target as Node)) this.open.set(null);
  }

  protected pick(code: Lang) {
    this.prefs.setLang(code);
    this.open.set(null);
  }

  protected askAi() {
    this.open.set(null);
    void this.assistant.ask('Bu adımda ne yapmam gerekiyor?');
  }
}
