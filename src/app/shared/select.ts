import { afterNextRender, booleanAttribute, ChangeDetectionStrategy, Injector, Component, computed, ElementRef, inject, input, model, signal, viewChild } from '@angular/core';
import { Icon } from './icon';

export interface SelectOption {
  value: string;
  label: string;
  /** Secondary line under the label. */
  hint?: string;
}

let uid = 0;

/**
 * Themed replacement for the native <select>: button trigger + listbox popup.
 * Keyboard: ↑/↓/Home/End move, Enter/Space pick, Esc closes, typing jumps to a matching label.
 * The popup is fixed-positioned so it is never clipped by overflow:hidden parents.
 */
@Component({
  selector: 'app-select',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:mousedown)': 'outside($event)',
    '(window:resize)': 'close(false)',
    '(window:scroll)': 'reposition()',
  },
  template: `
    <button
      #trigger
      type="button"
      class="field"
      [class.open]="open()"
      [class.compact]="compact()"
      [disabled]="disabled()"
      (click)="toggle()"
      (keydown)="triggerKey($event)"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="id + '-list'"
      [attr.aria-label]="label() || null"
    >
      <span class="text" [class.placeholder]="!current()">{{ current()?.label ?? placeholder() }}</span>
      <app-icon class="chev" name="chevron-down" size="16px" />
    </button>
    @if (open()) {
      <ul
        #list
        class="list"
        role="listbox"
        tabindex="-1"
        [id]="id + '-list'"
        [attr.aria-activedescendant]="id + '-' + active()"
        [style.top.px]="pos().top"
        [style.left.px]="pos().left"
        [style.width.px]="pos().width"
        [style.max-height.px]="pos().maxHeight"
        (keydown)="listKey($event)"
      >
        @for (o of options(); track o.value; let i = $index) {
          <li
            [id]="id + '-' + i"
            role="option"
            [attr.aria-selected]="o.value === value()"
            [class.active]="i === active()"
            [class.on]="o.value === value()"
            (mousemove)="active.set(i)"
            (mousedown)="$event.preventDefault()"
            (click)="pick(i)"
          >
            <span class="opt">
              <span class="label">{{ o.label }}</span>
              @if (o.hint) {<span class="hint">{{ o.hint }}</span>}
            </span>
            @if (o.value === value()) {<app-icon class="tick" name="check" size="16px" />}
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host { position: relative; display: block; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    .field {
      width: 100%; height: 44px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 0 12px;
      border: 1px solid var(--bd-D6DEEE); border-radius: 9px; background: var(--bg-FFFFFF); cursor: pointer; text-align: left;
      font: 500 15px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); transition: border-color .15s, box-shadow .15s;
    }
    .field.compact { height: 36px; border-radius: 8px; font-size: 13px; padding: 0 10px; }
    .field:hover:not(:disabled) { border-color: var(--bd-C9D2E3); }
    .field.open, .field:focus-visible { border-color: var(--bd-061262); box-shadow: 0 0 0 3px rgba(6, 18, 98, .14); outline: 0; }
    .field:disabled { opacity: .6; cursor: default; }
    .text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .placeholder { color: var(--fg-8A93A6); font-weight: 400; }
    .chev { color: var(--fg-5B6478); transition: transform .15s; }
    .field.open .chev { transform: rotate(180deg); }
    .list {
      position: fixed; z-index: 1200; box-sizing: border-box; margin: 0; padding: 4px; list-style: none; overflow: auto; outline: 0;
      background: var(--bg-FFFFFF); border: 1px solid var(--bd-E5E7EB); border-radius: 12px;
      box-shadow: 0 18px 44px -18px rgba(6, 18, 98, .4); animation: in .14s cubic-bezier(.2, .8, .2, 1) both;
    }
    li { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; cursor: pointer; }
    li.active { background: var(--bg-F1F4FA); }
    .opt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .label { font: 500 14px/19px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); }
    li.on .label { font-weight: 600; color: var(--fg-061262); }
    .hint { font: 400 12px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .tick { flex: none; color: var(--fg-15803D); }
    @keyframes in { from { opacity: 0; transform: translateY(-4px); } }
    @media (prefers-reduced-motion: reduce) { .list { animation: none; } }
  `,
})
export class Select {
  readonly value = model<string>('');
  readonly options = input<SelectOption[]>([]);
  readonly placeholder = input('Seçin');
  readonly label = input('');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly id = `sel-${++uid}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly pos = signal({ top: 0, left: 0, width: 0, maxHeight: 280 });
  protected readonly current = computed(() => this.options().find((o) => o.value === this.value()));
  private typed = '';
  private typedAt = 0;

  protected toggle() {
    if (this.open()) this.close();
    else this.show();
  }

  private show() {
    const i = this.options().findIndex((o) => o.value === this.value());
    this.active.set(Math.max(0, i));
    this.reposition();
    this.open.set(true);
    // Wait for the popup to render before moving focus into it.
    afterNextRender(() => {
      const el = this.list()?.nativeElement;
      el?.focus();
      el?.querySelector(`#${this.id}-${this.active()}`)?.scrollIntoView({ block: 'nearest' });
    }, { injector: this.injector });
  }

  close(refocus = true) {
    if (!this.open()) return;
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }

  /** Drop below the trigger, or above it when there isn't room. */
  protected reposition() {
    const r = this.trigger().nativeElement.getBoundingClientRect();
    const below = innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const want = Math.min(320, this.options().length * 56 + 10);
    const up = below < Math.min(want, 200) && above > below;
    const maxHeight = Math.max(120, Math.min(want, up ? above : below));
    this.pos.set({ top: up ? r.top - 6 - maxHeight : r.bottom + 6, left: r.left, width: r.width, maxHeight });
  }

  protected pick(i: number) {
    const o = this.options()[i];
    if (o) this.value.set(o.value);
    this.close();
  }

  protected triggerKey(e: KeyboardEvent) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      this.show();
    }
  }

  protected listKey(e: KeyboardEvent) {
    const n = this.options().length;
    const move = (i: number) => {
      e.preventDefault();
      this.active.set((i + n) % n);
      this.list()?.nativeElement.querySelector(`#${this.id}-${this.active()}`)?.scrollIntoView({ block: 'nearest' });
    };
    switch (e.key) {
      case 'ArrowDown': return move(this.active() + 1);
      case 'ArrowUp': return move(this.active() - 1);
      case 'Home': return move(0);
      case 'End': return move(n - 1);
      case 'Enter':
      case ' ':
        e.preventDefault();
        return this.pick(this.active());
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        return this.close();
      case 'Tab':
        return this.close(false);
    }
    // Type-ahead: jump to the first option starting with the typed letters.
    if (e.key.length === 1) {
      const now = Date.now();
      this.typed = (now - this.typedAt > 700 ? '' : this.typed) + e.key.toLocaleLowerCase('tr-TR');
      this.typedAt = now;
      const i = this.options().findIndex((o) => o.label.toLocaleLowerCase('tr-TR').startsWith(this.typed));
      if (i >= 0) move(i);
    }
  }

  protected outside(e: Event) {
    if (this.open() && !this.host.contains(e.target as Node)) this.close(false);
  }
}
