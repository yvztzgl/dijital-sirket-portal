import { afterNextRender, booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, inject, Injector, input, model, signal, viewChild } from '@angular/core';
import { Icon } from './icon';
import { SelectOption } from './select';

let uid = 0;

/**
 * Multi-choice version of <app-select>: same trigger box, a popup list with a tick box per option.
 * Picking an option toggles it and keeps the list open; Esc, Tab or a click outside closes it.
 * Keyboard: ↑/↓/Home/End move, Enter/Space toggle, typing jumps to a matching label.
 */
@Component({
  selector: 'app-multi-select',
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
      [disabled]="disabled()"
      (click)="toggle()"
      (keydown)="triggerKey($event)"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="id + '-list'"
      [attr.aria-label]="label() ? label() + (picked().length ? ': ' + summary() : '') : null"
    >
      <span class="text" [class.placeholder]="!picked().length">{{ picked().length ? summary() : placeholder() }}</span>
      @if (picked().length > 1) {<span class="count" aria-hidden="true">{{ picked().length }}</span>}
      <app-icon class="chev" name="chevron-down" size="16px" />
    </button>
    @if (open()) {
      <ul
        #list
        class="list"
        role="listbox"
        aria-multiselectable="true"
        tabindex="-1"
        [id]="id + '-list'"
        [attr.aria-label]="label() || null"
        [attr.aria-activedescendant]="id + '-' + active()"
        [style.top.px]="pos().top"
        [style.left.px]="pos().left"
        [style.width.px]="pos().width"
        [style.max-height.px]="pos().maxHeight"
        (keydown)="listKey($event)"
      >
        @for (o of options(); track o.value; let i = $index) {
          @let on = value().includes(o.value);
          <li
            [id]="id + '-' + i"
            role="option"
            [attr.aria-selected]="on"
            [class.active]="i === active()"
            [class.on]="on"
            (mousemove)="active.set(i)"
            (mousedown)="$event.preventDefault()"
            (click)="flip(i)"
          >
            <span class="box" aria-hidden="true">@if (on) {<app-icon name="check" size="13px" [stroke]="3" />}</span>
            <span class="label">{{ o.label }}</span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host { position: relative; display: block; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    .field {
      width: 100%; height: 42px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 12px;
      border: 1px solid var(--bd-C9D2E3); border-radius: 10px; background: var(--bg-FFFFFF); cursor: pointer; text-align: left;
      font: 400 14.5px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); transition: border-color .15s;
    }
    .field:hover:not(:disabled) { border-color: var(--bd-5B6478); }
    .field.open, .field:focus-visible { border-color: var(--bd-061262); outline: 0; }
    .field:disabled { opacity: .6; cursor: default; }
    .text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .placeholder { color: var(--fg-8A93A6); }
    .count { flex: none; min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 10px; display: grid; place-items: center; background: var(--bg-EFF4FF); color: var(--fg-061262); font: 600 11.5px/1 'IBM Plex Sans', sans-serif; }
    .chev { flex: none; color: var(--fg-5B6478); transition: transform .15s; }
    .field.open .chev { transform: rotate(180deg); }
    .list {
      position: fixed; z-index: 1200; box-sizing: border-box; margin: 0; padding: 4px; list-style: none; overflow: auto; outline: 0;
      background: var(--bg-FFFFFF); border: 1px solid var(--bd-C9D2E3); border-radius: 12px;
      animation: in .14s cubic-bezier(.2, .8, .2, 1) both;
    }
    li { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; cursor: pointer; }
    li.active { background: var(--bg-F1F4FA); }
    .box { flex: none; width: 18px; height: 18px; box-sizing: border-box; border: 1.5px solid var(--bd-C9D2E3); border-radius: 5px; display: grid; place-items: center; color: var(--fg-FFFFFF); }
    li.on .box { background: var(--bg-061262); border-color: var(--bd-061262); }
    .label { flex: 1; min-width: 0; font: 500 14px/19px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); }
    li.on .label { font-weight: 600; color: var(--fg-061262); }
    @keyframes in { from { opacity: 0; transform: translateY(-4px); } }
    @media (prefers-reduced-motion: reduce) { .list { animation: none; } }
  `,
})
export class MultiSelect {
  readonly value = model<string[]>([]);
  readonly options = input<SelectOption[]>([]);
  readonly placeholder = input('Seçiniz');
  readonly label = input('');
  readonly disabled = input(false, { transform: booleanAttribute });

  protected readonly id = `msel-${++uid}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly pos = signal({ top: 0, left: 0, width: 0, maxHeight: 280 });
  /** Picked options in the list's own order, not the order they were clicked. */
  protected readonly picked = computed(() => this.options().filter((o) => this.value().includes(o.value)));
  protected readonly summary = computed(() => this.picked().map((o) => o.label).join(', '));
  private typed = '';
  private typedAt = 0;

  protected toggle() {
    if (this.open()) this.close();
    else this.show();
  }

  private show() {
    const first = this.options().findIndex((o) => this.value().includes(o.value));
    this.active.set(Math.max(0, first));
    this.reposition();
    this.open.set(true);
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
    const want = Math.min(320, this.options().length * 38 + 10);
    const up = below < Math.min(want, 200) && above > below;
    const maxHeight = Math.max(120, Math.min(want, up ? above : below));
    // The three fields share a row, so the trigger can be narrower than the longest label.
    const width = Math.min(Math.max(r.width, 220), innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, innerWidth - 12 - width));
    this.pos.set({ top: up ? r.top - 6 - maxHeight : r.bottom + 6, left, width, maxHeight });
  }

  protected flip(i: number) {
    const o = this.options()[i];
    if (!o) return;
    this.active.set(i);
    this.value.update((v) => (v.includes(o.value) ? v.filter((x) => x !== o.value) : [...v, o.value]));
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
        return this.flip(this.active());
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        return this.close();
      case 'Tab':
        return this.close(false);
    }
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
