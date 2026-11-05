import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { Country, flagUrl, searchCountries } from '../core/countries';
import { Icon } from './icon';

/**
 * Searchable country dropdown shared by the country selector and the phone input.
 * ↑/↓ move, Enter picks, Esc closes. Search matches Turkish names, ISO and calling codes.
 */
@Component({
  selector: 'app-country-list',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel" role="dialog" aria-label="Ülke seçin">
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
      <ul #list class="list" role="listbox">
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
    :host { position: absolute; z-index: 970; top: calc(100% + 6px); left: 0; right: 0; min-width: 280px; }
    .panel {
      background: var(--bg-FFFFFF); border: 1px solid var(--bd-E5E7EB); border-radius: 12px; overflow: hidden;
      box-shadow: 0 18px 44px -18px rgba(6, 18, 98, .4); animation: in .14s cubic-bezier(.2, .8, .2, 1) both;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
    }
    .search { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px; border-bottom: 1px solid var(--bd-EEF1F6); color: var(--fg-8A93A6); }
    .search input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; font: 400 14px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .list { list-style: none; margin: 0; padding: 4px; max-height: 260px; overflow: auto; }
    li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; cursor: pointer; font: 400 14px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); }
    li.active { background: var(--bg-F1F4FA); }
    li.on .name { font-weight: 600; color: var(--fg-061262); }
    img { flex: none; width: 20px; height: 15px; border-radius: 2px; object-fit: cover; box-shadow: 0 0 0 1px rgba(6, 18, 98, .1); }
    .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dial { font: 500 12.5px/18px 'IBM Plex Mono', monospace; color: var(--fg-5B6478); }
    .tick { color: var(--fg-15803D); }
    .empty { cursor: default; color: var(--fg-5B6478); justify-content: center; }
    @keyframes in { from { opacity: 0; transform: translateY(-4px); } }
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

  constructor() {
    afterNextRender(() => {
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
