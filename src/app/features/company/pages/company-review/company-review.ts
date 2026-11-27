import { Select } from '@ui/select';
import { CountrySelect } from '@ui/country-select';
import { PhoneInput } from '@ui/phone-input';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, Injector, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { followFlow } from '@core/flow/follow';
import { companyPurpose } from '@core/reference/nace';
import { ApplicationStore } from '@core/state/application.store';
import { Icon } from '@ui/icon';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { fundingOptions } from '../../funding-options';
import * as review from '../../review.view';
import { Editor } from '../../review.view';

/**
 * D-1c — Şirket formu. After the outside evaluation the founder fills the company's details
 * themselves: the brand from the profile on top, then every value as a flat row with a pencil.
 * Values taken from the profile or the account carry a quiet "Ön bilgilerinizden"; so do the title
 * (proposed from the brand) and the NACE codes (the profile's), when the profile gives them.
 *
 * The editor a pencil opens is drawn right after that pencil's row, across the whole card (see
 * `.wz-review .rows` in src/wizard.scss for how the grid keeps the row beside it in place). Focus
 * moves into the editor when it opens and back to the pencil when it closes.
 */
@Component({
  selector: 'app-company-review-page',
  imports: [CountrySelect, FormError, Icon, PhoneInput, Select, StepPage],
  templateUrl: './company-review.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyReviewPage {
  protected readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly slot = viewChild<ElementRef<HTMLElement>>('slot');
  /** The row whose pencil opened the editor (several rows share one, e.g. E-posta, Telefon, Adres). */
  private readonly origin = signal<string | null>(null);
  private opener: HTMLButtonElement | null = null;

  constructor() {
    this.store.clearError();
    followFlow();
    // The NACE names and the funding sources are the API's own list (Api.reference).
    void this.store.loadReference();
    // Not shown here: kept as every step 1 screen reads it (D-1a's choices after a reload elsewhere).
    void this.store.loadEvaluationReference();
  }

  /** Which editor is open under the rows; one at a time. */
  protected readonly editor = signal<Editor | null>(null);
  /** What is typed in the open founder, contact or funding editor. */
  protected readonly draft = signal<Partial<Record<string, string>>>({});
  protected readonly naceQuery = signal('');

  private readonly naceTitles = computed(() => review.naceTitles(this.store.reference()));
  protected readonly rows = computed(() => review.reviewRows(this.store.app(), this.store.fullTitle(), this.naceTitles()));
  protected readonly rowErrors = computed(() => review.rowErrors(this.store.fieldErrors()));
  protected readonly inputErrors = computed(() => review.inputErrors(this.store.fieldErrors()));
  private readonly cards = computed(() => review.editorCards(this.store.app(), fundingOptions(this.store.reference())));
  /** The founder / contact / funding form shown when that editor is open. */
  protected readonly editorCard = computed(() => this.cards().find((c) => c.id === this.editor()) ?? null);
  protected readonly brand = computed(() => review.brandOf(this.store.app()?.company));
  protected readonly naceChips = computed(() => (this.store.app()?.company.nace ?? []).map((code) => ({ code, name: review.naceName(this.naceTitles(), code) })));
  protected readonly naceOptions = computed(() => review.naceChoices(this.store.app()?.company, this.naceTitles(), this.naceQuery()));
  protected readonly purpose = computed(() => companyPurpose(this.naceChips().map((c) => ({ code: c.code, title: c.name }))));
  /** D-1c opened from D-1d: the title was refused. */
  protected readonly titleRefused = computed(() => this.store.stage() === 'titleConflict');

  /** The row the open editor is drawn under. */
  protected readonly editorRow = computed(() => {
    const e = this.editor();
    if (!e) return null;
    const rows = this.rows();
    return (rows.find((r) => r.key === this.origin() && r.edit === e) ?? rows.find((r) => r.edit === e))?.key ?? null;
  });

  protected setTitle(value: string) {
    void this.store.updateReview({ company: review.titleParts(value) }, ['title']);
  }

  protected addNace(code: string) {
    const c = this.store.app()!.company;
    if (c.nace.includes(code)) return;
    this.naceQuery.set('');
    void this.store.updateReview({ company: { nace: [...c.nace, code] } }, ['nace']);
  }

  protected removeNace(code: string) {
    const c = this.store.app()!.company;
    void this.store.updateReview({ company: { nace: c.nace.filter((x) => x !== code) } }, ['nace']);
  }

  protected setDraftValue(key: string, v: string) {
    this.draft.update((d) => ({ ...d, [key]: v }));
  }

  protected setDraft(key: string, e: Event) {
    this.setDraftValue(key, (e.target as HTMLInputElement | HTMLSelectElement).value);
  }

  /** The logo on the confirm screen can be replaced with the founder's own image file. */
  protected onLogoInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const error = review.logoError(f);
    if (error) return this.store.error.set(error);
    const reader = new FileReader();
    reader.onload = () => void this.store.updateReview({ company: { logo: String(reader.result) } }, []);
    reader.readAsDataURL(f);
  }

  protected submitReview() {
    void this.store.submitReview();
  }

  /** D-1c opened from D-1d: back to the title choice. */
  protected backToTitles() {
    void this.router.navigateByUrl('/deck/name-rejected');
  }

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
    const e = this.editor();
    if (e && e !== 'title' && e !== 'nace') {
      const { patch, edited } = review.cardPatch(e, this.draft());
      if (await this.store.updateReview(patch, edited)) this.editor.set(null);
    }
    if (!this.editor()) this.returnFocus();
  }

  /** Opens an editor with the saved values (the same one again closes it). */
  private openEditor(e: Editor | null) {
    if (!e || this.editor() === e) return this.editor.set(null);
    this.editor.set(e);
    const card = this.cards().find((c) => c.id === e);
    if (card) this.draft.set(Object.fromEntries(card.fields.map((f) => [f.key, f.value])));
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
