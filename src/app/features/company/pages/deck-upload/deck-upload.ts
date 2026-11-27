import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { followFlow } from '@core/flow/follow';
import { EvaluationAnswers } from '@core/models/models';
import { ApplicationStore } from '@core/state/application.store';
import { DECK_CONSENT_ERROR, EvaluationField, evaluationErrors } from '@core/utils/rules';
import { Icon } from '@ui/icon';
import { MultiSelect } from '@ui/multi-select';
import { FormError } from '@layout/form-error';
import { SearchSelect } from '@ui/search-select';
import { StepPage } from '@layout/step-page';
import { DeckConsents } from '../../components/deck-consents';
import { DeckFormatDialog } from '../../components/deck-format-dialog';
import * as form from '../../deck-form.view';
import { ChoiceKey, MultiKey } from '../../deck-form.view';

/**
 * D-1a — Sunum ve değerlendirme soruları. The deck and the CV (PDF), a short summary, the activity
 * group and activity, the business, revenue and product choices, and the two ticks; then the outside
 * evaluation starts. A notice above the form when the last evaluation ended without a result.
 */
@Component({
  selector: 'app-deck-upload-page',
  imports: [DeckConsents, DeckFormatDialog, FormError, Icon, MultiSelect, RouterLink, SearchSelect, StepPage],
  templateUrl: './deck-upload.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckUploadPage {
  protected readonly store = inject(ApplicationStore);
  protected readonly formatOpen = signal(false);

  protected readonly deckFile = signal<File | null>(null);
  protected readonly cvFile = signal<File | null>(null);
  protected readonly answers = signal<EvaluationAnswers>({ ...form.EMPTY_ANSWERS });
  /** The screen's own checks (`evaluationErrors`), shown at the fields like the API's refusals. */
  protected readonly formErrors = signal<Partial<Record<EvaluationField, string>>>({});
  protected readonly consentError = signal<string | null>(null);

  /**
   * The two ticks the upload needs. They start unticked and are sent with this one upload only
   * (the API records both per upload); nothing is remembered from an earlier upload.
   */
  protected readonly noticeAcknowledged = signal(false);
  protected readonly aiConsent = signal(false);
  protected readonly consentsGiven = computed(() => this.noticeAcknowledged() && this.aiConsent());

  constructor() {
    this.store.clearError();
    followFlow();
    // D-1a's choices are the evaluation service's; the API's own list is read too, for D-1e ("Ön bilgileri düzenle").
    void this.store.loadReference();
    void this.store.loadEvaluationReference();
    // Once both ticks are given, the message asking for them has done its job.
    effect(() => {
      if (this.consentsGiven() && untracked(this.consentError)) this.consentError.set(null);
    });
  }

  /**
   * The profile can be changed at the upload step: before the first upload and, since API step 21,
   * again after an evaluation that ended without a result (the brand goes to the service as the
   * startup name, so a conflict may need it corrected). The API refuses it at every later stage.
   */
  protected readonly profileEditable = computed(() => this.store.stage() === 'verified');
  protected readonly evaluationEnded = computed(() => form.evaluationNotice(this.store.stage(), this.store.app()?.evaluation));

  protected readonly limits = computed(() => this.store.evaluationReference()?.limits ?? null);
  protected readonly fixedGroupLabel = computed(() => form.fixedGroupLabel(this.store.evaluationReference()));
  private readonly groupOfActivity = computed(() => form.groupOfActivity(this.store.evaluationReference()));
  protected readonly activityOptions = computed(() => form.activityOptions(this.store.evaluationReference(), this.answers().activityGroupId, this.groupOfActivity().size > 0));
  protected readonly activityPlaceholder = computed(() => form.activityPlaceholder(this.answers().activityGroupId, this.groupOfActivity().size > 0));
  protected readonly multiChoices = computed(() => form.multiChoices(this.store.evaluationReference()));
  protected readonly summaryHint = computed(() => form.summaryHint(this.limits(), this.answers().summary));
  protected readonly summaryOver = computed(() => form.summaryOver(this.limits(), this.answers().summary));

  /** The message at a field: the screen's own check first, else the API's refusal. */
  protected deckFieldError(key: EvaluationField): string | null {
    return this.formErrors()[key] ?? this.store.fieldErrors()[key]?.[0] ?? null;
  }

  private clearFieldError(key: EvaluationField) {
    if (!this.formErrors()[key]) return;
    const next = { ...this.formErrors() };
    delete next[key];
    this.formErrors.set(next);
  }

  /** The screen's own message and the API's refusal at one of the two choices. */
  private clearChoiceError(key: ChoiceKey) {
    this.clearFieldError(key);
    if (!this.store.fieldErrors()[key]) return;
    const { [key]: _, ...rest } = this.store.fieldErrors();
    this.store.fieldErrors.set(rest);
  }

  protected setSummary(value: string) {
    this.answers.update((a) => ({ ...a, summary: value }));
    this.clearFieldError('summary');
  }

  protected setChoice(key: ChoiceKey, value: string) {
    const { answers, cleared } = form.choose(this.answers(), key, value, this.groupOfActivity());
    this.answers.set(answers);
    if (cleared) this.clearChoiceError(cleared);
    this.clearChoiceError(key);
  }

  protected multiValue(key: MultiKey): string[] {
    return this.answers()[key].map(String);
  }

  /** The multi-select hands back string values; the API takes the numeric ids. */
  protected setMulti(key: MultiKey, values: string[]) {
    this.answers.update((a) => ({ ...a, [key]: values.map(Number) }));
    this.clearFieldError(key);
  }

  protected onFilePicked(which: 'deck' | 'cv', e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    if (!f) return;
    (which === 'deck' ? this.deckFile : this.cvFile).set(f);
    // Say at once when the file itself is wrong (type, size); the other fields wait for "Gönder".
    const l = this.limits();
    const error = l ? evaluationErrors({ ...this.answers(), deck: this.deckFile(), cv: this.cvFile() }, l)[which] : undefined;
    this.formErrors.update((x) => {
      const next = { ...x };
      if (error) next[which] = error;
      else delete next[which];
      return next;
    });
  }

  /** Checks everything on screen, then sends the deck, the CV and the answers; the evaluation starts. */
  protected async submitDeck() {
    const l = this.limits();
    const ref = this.store.evaluationReference();
    if (!l || !ref) return;
    const errors = evaluationErrors({ ...this.answers(), deck: this.deckFile(), cv: this.cvFile() }, l, ref);
    this.formErrors.set(errors);
    this.consentError.set(this.consentsGiven() ? null : DECK_CONSENT_ERROR);
    if (Object.keys(errors).length || !this.consentsGiven()) return;
    await this.store.uploadDeck({ deck: this.deckFile()!, cv: this.cvFile()! }, this.answers(), { noticeAcknowledged: this.noticeAcknowledged(), aiConsent: this.aiConsent() });
  }
}
