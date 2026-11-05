import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, model, signal, untracked } from '@angular/core';
import { AsYouType, CountryCode, getExampleNumber, isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';
import examples from 'libphonenumber-js/mobile/examples';
import { COUNTRIES, countryByIso, countryByName, flagUrl } from '../core/countries';
import { CountryList } from './country-list';
import { Icon } from './icon';

/** Country to assume when a calling code is shared (e.g. +44 is also Jersey and Guernsey). */
const MAIN: Record<string, CountryCode> = { '1': 'US', '7': 'RU', '44': 'GB', '47': 'NO', '61': 'AU', '212': 'MA', '262': 'RE', '290': 'SH', '358': 'FI', '590': 'GP', '599': 'CW' };

/** Countries where the leading 0 is part of the number, not a trunk prefix. */
const KEEP_ZERO = new Set(['IT', 'SM', 'VA', 'CI', 'CG', 'GA', 'TG']);

/**
 * International phone field: country code picker (flag + "+49") and a number box that formats
 * as you type for that country. `value` is the full international form, e.g. "+49 151 2345 6789".
 * Pasting a number with "+" switches the country automatically.
 */
@Component({
  selector: 'app-phone-input',
  imports: [CountryList, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:mousedown)': 'outside($event)' },
  template: `
    <div class="field" [class.focus]="focused() || open()" [class.bad]="showInvalid()">
      <button type="button" class="code" (click)="open.set(!open())" aria-haspopup="listbox" [attr.aria-expanded]="open()" [attr.aria-label]="'Ülke kodu: ' + country().name + ' +' + country().dial">
        <img [src]="flag(country().iso)" alt="" width="22" height="16" />
        <span>+{{ country().dial }}</span>
        <app-icon class="chev" name="chevron-down" size="14px" />
      </button>
      <input
        #num
        type="tel"
        inputmode="tel"
        autocomplete="tel-national"
        [attr.aria-label]="label()"
        [attr.aria-invalid]="showInvalid()"
        [value]="national()"
        [placeholder]="example()"
        (input)="typed($event)"
        (focus)="focused.set(true)"
        (blur)="focused.set(false); touched.set(true)"
      />
      @if (valid()) {<app-icon class="ok" name="check" size="16px" [stroke]="2.2" />}
    </div>
    @if (showInvalid()) {<span class="hint" role="alert">Bu numara {{ country().name }} için geçerli görünmüyor.</span>}
    @if (open()) {
      <app-country-list [selected]="country().iso" [dial]="true" (picked)="pick($event)" (closed)="closeList()" />
    }
  `,
  styles: `
    :host { position: relative; display: block; }
    .field {
      height: 44px; box-sizing: border-box; display: flex; align-items: center; border: 1px solid var(--bd-D6DEEE);
      border-radius: 9px; background: var(--bg-FFFFFF); transition: border-color .15s, box-shadow .15s;
    }
    .field:hover { border-color: var(--bd-C9D2E3); }
    .field.focus { border-color: var(--bd-061262); box-shadow: 0 0 0 3px rgba(6, 18, 98, .14); }
    .field.bad { border-color: var(--bd-FBD5D1); }
    .field.bad.focus { box-shadow: 0 0 0 3px rgba(180, 35, 24, .14); }
    .code {
      flex: none; height: 100%; display: flex; align-items: center; gap: 7px; padding: 0 10px 0 12px; border: 0;
      border-right: 1px solid var(--bd-EEF1F6); border-radius: 9px 0 0 9px; background: transparent; cursor: pointer;
      font: 500 14.5px/20px 'IBM Plex Mono', monospace; color: var(--fg-061262);
    }
    .code:hover { background: var(--bg-F7F9FE); }
    .code:focus-visible { outline: 0; background: var(--bg-EFF4FF); }
    img { width: 22px; height: 16px; border-radius: 3px; object-fit: cover; box-shadow: 0 0 0 1px rgba(6, 18, 98, .12); }
    .chev { color: var(--fg-5B6478); }
    input {
      flex: 1; min-width: 0; height: 100%; padding: 0 12px; border: 0; outline: 0; background: transparent;
      font: 500 15px/20px 'IBM Plex Sans', sans-serif; letter-spacing: .01em; color: var(--fg-061262);
    }
    input::placeholder { color: var(--fg-8A93A6); font-weight: 400; }
    .ok { margin-right: 12px; color: var(--fg-15803D); }
    .hint { display: block; margin-top: 6px; font: 400 12.5px/18px 'IBM Plex Sans', sans-serif; color: var(--fg-B42318); }
  `,
})
export class PhoneInput {
  /** Full international number, e.g. "+49 151 2345 6789". */
  readonly value = model('');
  /** Country name to start with when the value has no country code yet (e.g. the address country). */
  readonly defaultCountry = input('');
  readonly label = input('Telefon numarası');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly flag = flagUrl;
  protected readonly open = signal(false);
  protected readonly focused = signal(false);
  protected readonly touched = signal(false);
  protected readonly iso = signal<CountryCode>('TR');
  /** Digits after the calling code. */
  private readonly digits = signal('');

  protected readonly country = computed(() => countryByIso(this.iso()) ?? countryByIso('TR')!);
  protected readonly national = computed(() => {
    const d = this.digits();
    if (!d) return '';
    const prefix = `+${this.country().dial}`;
    return new AsYouType().input(prefix + d).replace(prefix, '').trim();
  });
  protected readonly full = computed(() => (this.digits() ? `+${this.country().dial} ${this.national()}` : ''));
  protected readonly valid = computed(() => !!this.digits() && isValidPhoneNumber(`+${this.country().dial}${this.digits()}`));
  protected readonly showInvalid = computed(() => this.touched() && !this.focused() && this.digits().length > 0 && !this.valid());
  protected readonly example = computed(() => {
    const ex = getExampleNumber(this.iso(), examples);
    return ex ? ex.formatInternational().replace(`+${ex.countryCallingCode}`, '').trim() : '';
  });

  constructor() {
    // Take outside changes (initial value, reset) without echoing our own emissions back.
    effect(() => {
      const v = this.value();
      untracked(() => {
        if (v === this.full()) return;
        const p = v ? parsePhoneNumberFromString(v) : undefined;
        if (p) {
          this.iso.set(this.countryFor(p.country, p.countryCallingCode));
          this.digits.set(String(p.nationalNumber));
        } else {
          const fallback = countryByName(this.defaultCountry())?.iso;
          if (fallback) this.iso.set(fallback);
          this.digits.set(v.replace(/\D/g, ''));
        }
      });
    });
  }

  protected typed(e: Event) {
    const el = e.target as HTMLInputElement;
    const raw = el.value;
    if (raw.trim().startsWith('+')) {
      // Pasted/typed an international number: let it pick the country.
      const p = parsePhoneNumberFromString(raw);
      if (p) {
        this.iso.set(this.countryFor(p.country, p.countryCallingCode));
        this.digits.set(String(p.nationalNumber));
        return this.emit(el);
      }
    }
    let d = raw.replace(/\D/g, '');
    if (!KEEP_ZERO.has(this.iso())) d = d.replace(/^0+/, '');
    this.digits.set(d.slice(0, 15));
    this.emit(el);
  }

  protected pick(iso: string) {
    this.iso.set(iso as CountryCode);
    this.value.set(this.full());
    this.closeList();
  }

  protected closeList() {
    this.open.set(false);
    this.host.querySelector<HTMLInputElement>('input[type=tel]')?.focus();
  }

  protected outside(e: Event) {
    if (this.open() && !this.host.contains(e.target as Node)) this.open.set(false);
  }

  /** Exact country when known; otherwise the default country if it shares the code, else the main one. */
  private countryFor(exact: CountryCode | undefined, dial: string): CountryCode {
    if (exact) return exact;
    const preferred = countryByName(this.defaultCountry());
    if (preferred?.dial === dial) return preferred.iso;
    return MAIN[dial] ?? COUNTRIES.find((c) => c.dial === dial)?.iso ?? 'TR';
  }

  private emit(el: HTMLInputElement) {
    // Re-render the formatted text and keep the caret at the end of what was typed.
    el.value = this.national();
    this.value.set(this.full());
  }
}
