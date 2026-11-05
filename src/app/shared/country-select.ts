import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, model, signal } from '@angular/core';
import { countryByIso, countryByName, flagUrl } from '../core/countries';
import { CountryList } from './country-list';
import { Icon } from './icon';

/**
 * Country picker with flags and search. `value` is the Turkish country name ("Almanya"), which is
 * what the application stores. Unknown free-text values are shown as-is until a country is picked.
 */
@Component({
  selector: 'app-country-select',
  imports: [CountryList, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:mousedown)': 'outside($event)' },
  template: `
    <button
      type="button"
      class="field"
      [class.open]="open()"
      (click)="open.set(!open())"
      (keydown.arrowDown)="$event.preventDefault(); open.set(true)"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="label() + ': ' + (value() || 'seçilmedi')"
    >
      @if (country(); as c) {
        <img [src]="flag(c.iso)" alt="" width="22" height="16" />
        <span class="text">{{ c.name }}</span>
      } @else {
        <span class="text placeholder">{{ value() || 'Ülke seçin' }}</span>
      }
      <app-icon class="chev" name="chevron-down" size="16px" />
    </button>
    @if (open()) {
      <app-country-list [selected]="country()?.iso ?? null" (picked)="pick($event)" (closed)="close()" />
    }
  `,
  styles: `
    :host { position: relative; display: block; }
    .field {
      width: 100%; height: 44px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 0 12px;
      border: 1px solid var(--bd-D6DEEE); border-radius: 9px; background: var(--bg-FFFFFF); cursor: pointer; text-align: left;
      font: 500 15px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); transition: border-color .15s, box-shadow .15s;
    }
    .field:hover { border-color: var(--bd-C9D2E3); }
    .field.open, .field:focus-visible { border-color: var(--bd-061262); box-shadow: 0 0 0 3px rgba(6, 18, 98, .14); outline: 0; }
    img { flex: none; width: 22px; height: 16px; border-radius: 3px; object-fit: cover; box-shadow: 0 0 0 1px rgba(6, 18, 98, .12); }
    .text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .placeholder { color: var(--fg-8A93A6); font-weight: 400; }
    .chev { color: var(--fg-5B6478); transition: transform .15s; }
    .field.open .chev { transform: rotate(180deg); }
  `,
})
export class CountrySelect {
  readonly value = model('');
  readonly label = input('Ülke');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly open = signal(false);
  protected readonly country = computed(() => countryByName(this.value()));
  protected readonly flag = flagUrl;

  protected pick(iso: string) {
    const c = countryByIso(iso);
    if (c) this.value.set(c.name);
    this.close();
  }

  protected close() {
    this.open.set(false);
    this.host.querySelector<HTMLButtonElement>('.field')?.focus();
  }

  protected outside(e: Event) {
    if (this.open() && !this.host.contains(e.target as Node)) this.open.set(false);
  }
}
