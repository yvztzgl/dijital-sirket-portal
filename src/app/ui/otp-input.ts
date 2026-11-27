import { ChangeDetectionStrategy, Component, ElementRef, input, model, output, viewChildren } from '@angular/core';

/**
 * Six one-digit boxes for verification codes: auto-advance, backspace to previous, paste a whole
 * code, Enter submits. `platform` matches the portal's own style, `bank` the 3-D Secure modal.
 */
@Component({
  selector: 'app-otp-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', style: 'display:contents' },
  template: `
    @for (i of slots(); track i) {
      <input
        #box
        [value]="value().charAt(i).trim()"
        (input)="onInput(i, $event)"
        (keydown)="onKey(i, $event)"
        (paste)="onPaste($event)"
        (focus)="$any($event.target).select()"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="1"
        [attr.aria-label]="'Kodun ' + (i + 1) + '. hanesi'"
        [class]="variant()"
        [class.filled]="!!value().charAt(i).trim()"
      />
    }
  `,
  styles: `
    input { box-sizing: border-box; text-align: center; background: var(--bg-FFFFFF); outline: 0; padding: 0; min-width: 0; }
    .platform { height: 60px; border-radius: 10px; border: 1px solid var(--bd-D6DEEE); font: 600 24px/1 'IBM Plex Mono', monospace; color: var(--fg-061262); }
    .platform.filled { border-color: var(--bd-C7D5F7); }
    .platform:focus { border-color: var(--bd-061262); box-shadow: 0 0 0 3px rgba(6,18,98, .18); }
    .bank { width: 48px; height: 56px; border-radius: 8px; border: 1px solid var(--bd-D1D5DB); font: 600 22px/1 'IBM Plex Mono', monospace; color: var(--fg-111827); }
    .bank:focus { border: 2px solid var(--bd-111827); box-shadow: 0 0 0 3px rgba(17, 24, 39, .12); }
  `,
})
export class OtpInput {
  readonly length = input(6);
  readonly variant = input<'platform' | 'bank'>('platform');
  readonly value = model('');
  /** Emitted on Enter or when the last digit is typed. */
  readonly complete = output<string>();

  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');
  protected slots = () => Array.from({ length: this.length() }, (_, i) => i);

  focus() {
    const v = this.value();
    this.boxes()[Math.min(v.length, this.length() - 1)]?.nativeElement.focus();
  }

  protected onInput(i: number, e: Event) {
    const el = e.target as HTMLInputElement;
    const d = el.value.replace(/\D/g, '').slice(-1);
    el.value = d;
    const chars = this.value().padEnd(this.length(), ' ').split('');
    chars[i] = d || ' ';
    this.set(chars.join(''));
    if (d) this.boxes()[i + 1]?.nativeElement.focus();
  }

  protected onKey(i: number, e: KeyboardEvent) {
    const boxes = this.boxes();
    if (e.key === 'Backspace' && !(e.target as HTMLInputElement).value && i > 0) {
      boxes[i - 1].nativeElement.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      boxes[i - 1].nativeElement.focus();
    } else if (e.key === 'ArrowRight' && i < boxes.length - 1) {
      boxes[i + 1].nativeElement.focus();
    } else if (e.key === 'Enter') {
      this.complete.emit(this.value());
    }
  }

  protected onPaste(e: ClipboardEvent) {
    const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, this.length());
    if (!digits) return;
    e.preventDefault();
    this.set(digits);
    this.boxes()[Math.min(digits.length, this.length() - 1)]?.nativeElement.focus();
  }

  private set(v: string) {
    const clean = v.replace(/\s+$/, '');
    this.value.set(clean);
    if (/^\d+$/.test(clean) && clean.length === this.length()) this.complete.emit(clean);
  }
}
