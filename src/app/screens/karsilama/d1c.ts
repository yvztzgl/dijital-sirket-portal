import { Select } from '../../shared/select';
import { CountrySelect } from '../../shared/country-select';
import { PhoneInput } from '../../shared/phone-input';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, Injector, inject, signal, viewChild } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/**
 * D-1c — Şirket formu. After the outside evaluation the founder fills the company's details
 * themselves: the brand from the profile on top, then every value as a flat row with a pencil.
 * Values taken from the profile or the account carry a quiet "Ön bilgilerinizden"; so do the title
 * (proposed from the brand) and the NACE codes (the sector's), when the profile gives them.
 *
 * The editor a pencil opens is drawn right after that pencil's row, across the whole card (see
 * `.wz-review .rows` in src/wizard.scss for how the grid keeps the row beside it in place). Focus
 * moves into the editor when it opens and back to the pencil when it closes.
 */
@Component({
  selector: 'app-screen-d1c',
  imports: [CountrySelect, FormError, Icon, PhoneInput, Select, StepPage],
  templateUrl: './d1c.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1c extends KarsilamaData {
  private readonly injector = inject(Injector);
  private readonly slot = viewChild<ElementRef<HTMLElement>>('slot');
  /** The row whose pencil opened the editor (several rows share one, e.g. E-posta, Telefon, Adres). */
  private readonly origin = signal<string | null>(null);
  private opener: HTMLButtonElement | null = null;

  /** The row the open editor is drawn under. */
  protected readonly editorRow = computed(() => {
    const e = this.editor();
    if (!e) return null;
    const rows = this.rows();
    return (rows.find((r) => r.key === this.origin() && r.edit === e) ?? rows.find((r) => r.edit === e))?.key ?? null;
  });

  protected pencil(key: string, button: HTMLButtonElement) {
    const e = this.rows().find((r) => r.key === key)?.edit;
    if (!e) return;
    this.opener = button;
    if (this.editor() === e && this.editorRow() !== key) {
      // Same editor, another of its rows: move it there and keep what was typed.
      this.origin.set(key);
    } else {
      this.origin.set(key);
      this.openEditor(e);
      if (!this.editor()) return; // the same pencil again closes it; focus stays on the pencil
    }
    afterNextRender(() => this.reveal(), { injector: this.injector });
  }

  protected close() {
    this.openEditor(null);
    this.returnFocus();
  }

  protected async save() {
    await this.saveEditor();
    if (!this.editor()) this.returnFocus();
  }

  /** Focus the editor's first input and scroll it into view only if part of it is hidden. */
  private reveal() {
    const el = this.slot()?.nativeElement;
    if (!el) return;
    const first = el.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea') ?? el.querySelector<HTMLElement>('button');
    first?.focus({ preventScroll: true });
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }

  private returnFocus() {
    const b = this.opener;
    this.opener = null;
    if (b) afterNextRender(() => b.isConnected && b.focus(), { injector: this.injector });
  }
}
