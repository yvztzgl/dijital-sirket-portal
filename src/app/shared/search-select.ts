import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, model, signal } from '@angular/core';
import { Icon } from './icon';
import type { SelectOption } from './select';

let uid = 0;

/** Turkish-aware folding for matching: "İş" and "iş" and "is" all match. */
const fold = (v: string) =>
  v.toLocaleLowerCase('tr-TR').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');

/**
 * A select for long lists (D-1a's 216 activities): a text box that filters the options as the
 * founder types, with the same box and list look as `Select`. Shows the chosen option's label when
 * not typing. Keyboard: ↓/↑ move, Enter picks, Esc closes. `value` is the option's value ('' when
 * nothing is chosen).
 */
@Component({
  selector: 'app-search-select',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:mousedown)': 'outside($event)' },
  template: `
    <div class="box" [class.open]="open()">
      <app-icon name="search" size="15px" [stroke]="2" />
      <input
        role="combobox"
        aria-autocomplete="list"
        autocomplete="off"
        [attr.aria-label]="label() || null"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="id + '-list'"
        [attr.aria-activedescendant]="open() && shown().length ? id + '-' + active() : null"
        [placeholder]="placeholder()"
        [value]="query() ?? current()?.label ?? ''"
        (input)="type($any($event.target).value)"
        (focus)="show($any($event.target))"
        (keydown)="key($event)"
      />
    </div>
    @if (open()) {
      <ul class="list" role="listbox" [id]="id + '-list'" [attr.aria-label]="label() || null">
        @for (o of shown(); track o.value; let i = $index) {
          <li
            [id]="id + '-' + i"
            role="option"
            [attr.aria-selected]="o.value === value()"
            [class.active]="i === active()"
            [class.on]="o.value === value()"
            (mousemove)="active.set(i)"
            (mousedown)="$event.preventDefault()"
            (click)="pick(o)"
          >{{ o.label }}</li>
        } @empty {
          <li class="none" role="presentation">Eşleşen seçenek yok</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { position: relative; display: block; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    .box {
      height: 42px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 12px;
      border: 1px solid var(--bd-C9D2E3); border-radius: 10px; background: var(--bg-FFFFFF); color: var(--fg-5B6478); transition: border-color .15s;
    }
    .box:hover { border-color: var(--bd-5B6478); }
    .box.open, .box:focus-within { border-color: var(--bd-061262); }
    input { flex: 1; min-width: 0; height: 100%; border: 0; padding: 0; background: transparent; outline: 0; font: 400 14.5px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); }
    input::placeholder { color: var(--fg-8A93A6); }
    .list {
      position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 1200; box-sizing: border-box; max-height: 280px; overflow: auto;
      margin: 0; padding: 4px; list-style: none; background: var(--bg-FFFFFF); border: 1px solid var(--bd-C9D2E3); border-radius: 12px;
    }
    li { padding: 9px 10px; border-radius: 8px; cursor: pointer; font: 500 14px/19px 'IBM Plex Sans', sans-serif; color: var(--fg-1F2A44); }
    li.active { background: var(--bg-F1F4FA); }
    li.on { font-weight: 600; color: var(--fg-061262); }
    li.none { cursor: default; font-weight: 400; color: var(--fg-5B6478); }
  `,
})
export class SearchSelect {
  readonly value = model<string>('');
  readonly options = input<SelectOption[]>([]);
  readonly placeholder = input('Aramak için yazınız');
  readonly label = input('');

  protected readonly id = `ssel-${++uid}`;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly open = signal(false);
  /** What the founder has typed; null while not typing (the box then shows the chosen label). */
  protected readonly query = signal<string | null>(null);
  protected readonly active = signal(0);
  protected readonly current = computed(() => this.options().find((o) => o.value === this.value()));
  protected readonly shown = computed(() => {
    const q = fold((this.query() ?? '').trim());
    return q ? this.options().filter((o) => fold(o.label).includes(q)) : this.options();
  });

  protected show(el: HTMLInputElement) {
    this.open.set(true);
    const i = this.shown().findIndex((o) => o.value === this.value());
    this.active.set(Math.max(0, i));
    el.select();
  }

  protected type(text: string) {
    this.query.set(text);
    this.active.set(0);
    this.open.set(true);
  }

  protected pick(o: SelectOption) {
    this.value.set(o.value);
    this.close();
  }

  private close() {
    this.open.set(false);
    this.query.set(null);
  }

  protected key(e: KeyboardEvent) {
    const n = this.shown().length;
    const move = (i: number) => {
      e.preventDefault();
      this.open.set(true);
      if (!n) return;
      this.active.set((i + n) % n);
      this.host.querySelector(`#${this.id}-${this.active()}`)?.scrollIntoView({ block: 'nearest' });
    };
    switch (e.key) {
      case 'ArrowDown':
        return move(this.open() ? this.active() + 1 : this.active());
      case 'ArrowUp':
        return move(this.active() - 1);
      case 'Enter': {
        if (!this.open()) return;
        e.preventDefault();
        const o = this.shown()[this.active()];
        if (o) this.pick(o);
        return;
      }
      case 'Escape':
        if (!this.open()) return;
        e.preventDefault();
        e.stopPropagation();
        return this.close();
      case 'Tab':
        return this.close();
    }
  }

  protected outside(e: Event) {
    if (this.open() && !this.host.contains(e.target as Node)) this.close();
  }
}
