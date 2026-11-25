import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { Country, flagUrl, searchCountries } from '../core/countries';
import { Icon } from './icon';

/**
 * Searchable country dropdown shared by the country selector and the phone input.
 * ↑/↓ move, Enter picks, Esc closes. Search matches Turkish names, ISO and calling codes.
 * Fixed-positioned under its field (the parent element), or above it when there is not enough
 * room below, so it is never clipped by an overflow:hidden card or pushed off the window.
 */
@Component({
  selector: 'app-country-list',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.up]': 'pos().up',
    '[style.top.px]': 'pos().up ? null : pos().top',
    '[style.bottom.px]': 'pos().up ? pos().bottom : null',
    '[style.left.px]': 'pos().left',
    '[style.width.px]': 'pos().width',
    '[style.visibility]': 'pos().placed ? null : "hidden"',
    '(window:scroll)': 'place()',
    '(window:resize)': 'place()',
  },
  template: `
    <div class="panel" role="dialog" aria-label="Ülke seçiniz">
      <label class="search">
        <app-icon name="search" size="15px" [stroke]="2" />
        <input
          #q
          [value]="query()"
          (input)="query.set($any($event.target).value); active.set(0)"
          (keydown)="key($event)"
          [placeholder]="dial() ? 'Ülke veya kod ara (+49)…' : 'Ülke ara…'"
          aria-label="Ülke ara"
          role="combobox"
          aria-expanded="true"
          [attr.aria-activedescendant]="'cl-' + active()"
          autocomplete="off"
        />
      </label>
      <ul #list class="list" role="listbox" [style.max-height.px]="pos().listMax">
        @for (c of results(); track c.iso; let i = $index) {
          <li
            [id]="'cl-' + i"
            role="option"
            [attr.aria-selected]="c.iso === selected()"
            [class.active]="i === active()"
            [class.on]="c.iso === selected()"
            (mousemove)="active.set(i)"
            (mousedown)="$event.preventDefault()"
            (click)="picked.emit(c.iso)"
          >
            <img [src]="flag(c.iso)" alt="" width="20" height="15" loading="lazy" />
            <span class="name">{{ c.name }}</span>
            @if (dial()) {<span class="dial">+{{ c.dial }}</span>}
            @if (c.iso === selected()) {<app-icon class="tick" name="check" size="15px" />}
          </li>
        } @empty {
          <li class="empty">Sonuç bulunamadı</li>
        }
      </ul>
    </div>
  `,
  styles: `
    :host { position: fixed; z-index: 1200; display: block; }
    .panel {
      background: var(--bg-FFFFFF); border: 1px solid var(--bd-C9D2E3); border-radius: 12px; overflow: hidden;
      animation: in .14s cubic-bezier(.2, .8, .2, 1) both;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
    }
    :host(.up) .panel { display: flex; flex-direction: column-reverse; animation-name: in-up; }
    :host(.up) .search { border-bottom: 0; border-top: 1px solid var(--bd-EEF1F6); }
    .search { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px; border-bottom: 1px solid var(--bd-EEF1F6); color: var(--fg-8A93A6); }
    .search input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; font: 400 14px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .list { list-style: none; margin: 0; padding: 4px; overflow: auto; }
    li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; font: 400 14px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); }
    li.active { background: var(--bg-F1F4FA); }
    li.on .name { font-weight: 600; color: var(--fg-061262); }
    img { flex: none; width: 20px; height: 15px; border-radius: 2px; object-fit: cover; outline: 1px solid rgba(6, 18, 98, .1); outline-offset: -1px; }
    .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dial { font: 500 12.5px/18px 'IBM Plex Mono', monospace; color: var(--fg-5B6478); }
    .tick { color: var(--fg-15803D); }
    .empty { cursor: default; color: var(--fg-5B6478); justify-content: center; }
    @keyframes in { from { opacity: 0; transform: translateY(-4px); } }
    @keyframes in-up { from { opacity: 0; transform: translateY(4px); } }
    @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
  `,
})
export class CountryList {
  readonly selected = input<string | null>(null);
  /** Show calling codes (phone input). */
  readonly dial = input(false);
  readonly picked = output<Country['iso']>();
  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly results = computed(() => searchCountries(this.query()));
  protected readonly flag = flagUrl;

  private readonly q = viewChild.required<ElementRef<HTMLInputElement>>('q');
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Where the panel sits: below the field, or above it (`up`) when below is short and above is roomier. */
  protected readonly pos = signal({ placed: false, up: false, top: 0, bottom: 0, left: 0, width: 280, listMax: 260 });

  protected place() {
    const field = this.host.parentElement?.getBoundingClientRect();
    if (!field) return;
    const SEARCH = 44;
    const GAP = 6;
    const want = SEARCH + 268;
    const below = innerHeight - field.bottom - GAP - 12;
    const above = field.top - GAP - 12;
    const up = below < want && above > below;
    const room = up ? above : below;
    const width = Math.max(280, field.width);
    const left = Math.min(field.left, innerWidth - width - 8);
    this.pos.set({
      placed: true,
      up,
      top: field.bottom + GAP,
      bottom: innerHeight - field.top + GAP,
      left: Math.max(8, left),
      width,
      listMax: Math.max(120, Math.min(260, room - SEARCH)),
    });
  }

  constructor() {
    afterNextRender(() => {
      this.place();
      this.q().nativeElement.focus();
      // Open with the current country in view and highlighted.
      const i = this.results().findIndex((c) => c.iso === this.selected());
      if (i >= 0) {
        this.active.set(i);
        queueMicrotask(() => this.scrollTo(i, 'center'));
      }
    });
  }

  protected key(e: KeyboardEvent) {
    const n = this.results().length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      const i = (this.active() + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      this.active.set(i);
      this.scrollTo(i, 'nearest');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = this.results()[this.active()];
      if (c) this.picked.emit(c.iso);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.closed.emit();
    } else if (e.key === 'Tab') {
      this.closed.emit();
    }
  }

  private scrollTo(i: number, block: ScrollLogicalPosition) {
    this.list().nativeElement.querySelector(`#cl-${i}`)?.scrollIntoView({ block });
  }
}
