import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { ANSWER_MAX, EvaluationQuestions, QuestionCard } from '@core/models/models';
import { ApplicationStore } from '@core/state/application.store';
import { FormError } from '@layout/form-error';
import { Icon } from '@ui/icon';
import { StepPage } from '@layout/step-page';
import { DemoBar } from '@demo/demo-bar';
import { uploadedFiles } from '../../waiting.view';

/** One card's draft: the chosen option and the explanation typed for it. */
interface Draft {
  optionId: string | null;
  explanation: string;
}

/**
 * D-1g — Ek bilgi gerekiyor (stage `evaluationQuestions`). The evaluation service asked follow-up
 * questions (API step 22): one card per question, one choice per card, and a text box when the
 * chosen option asks for an explanation. Sending them puts the evaluation back to `evaluating`, and
 * `followFlow` moves the founder to D-1b.
 *
 * When the questions cannot be read (the API knows them in no shape it can show, or the read
 * failed) the screen is the stop state it was before step 22: the platform will contact the founder.
 */
@Component({
  selector: 'app-evaluation-questions-page',
  imports: [DemoBar, FormError, Icon, StepPage],
  templateUrl: './evaluation-questions.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EvaluationQuestionsPage {
  protected readonly store = inject(ApplicationStore);
  protected readonly answerMax = ANSWER_MAX;
  /** null while loading; `answerable: false` also stands for a failed read. */
  protected readonly questions = signal<EvaluationQuestions | null>(null);
  protected readonly drafts = signal<Record<string, Draft>>({});
  /** Cards the founder tried to send without a complete answer (checked here before the API checks again). */
  protected readonly missing = signal<Record<string, string>>({});

  /** The stop state lists what was received. */
  protected readonly uploadedFiles = computed(() => uploadedFiles(this.store.app()));

  constructor() {
    this.store.clearError();
    followFlow();
    // Not shown here: read while waiting so the screens after the evaluation have their choices at once.
    void this.store.loadReference();
    void this.store.loadEvaluationReference();
    this.store.evaluationQuestions().then(
      (q) => this.questions.set(q),
      () => this.questions.set({ answerable: false, receivedAt: '', cards: [] }),
    );
  }

  /** A refusal's message for one field, under the API's field name (`answers`, `answers.<card id>`). */
  protected fieldError(key: string): string | null {
    return this.store.fieldErrors()[key]?.[0] ?? null;
  }

  protected answerDraft(card: QuestionCard): Draft {
    return this.drafts()[card.id] ?? { optionId: null, explanation: '' };
  }

  /** The chosen option of a card when it asks for an explanation; null otherwise. */
  protected explained(card: QuestionCard) {
    const option = card.options.find((o) => o.id === this.answerDraft(card).optionId);
    return option?.explanationRequired ? option : null;
  }

  protected choose(card: QuestionCard, optionId: string) {
    this.drafts.update((d) => ({ ...d, [card.id]: { ...this.answerDraft(card), optionId } }));
    this.missing.update(({ [card.id]: _, ...rest }) => rest);
  }

  protected explain(card: QuestionCard, explanation: string) {
    this.drafts.update((d) => ({ ...d, [card.id]: { ...this.answerDraft(card), explanation } }));
  }

  protected cardError(card: QuestionCard): string | null {
    return this.missing()[card.id] ?? this.fieldError(`answers.${card.id}`);
  }

  protected readonly answeredCount = computed(() => {
    const cards = this.questions()?.cards ?? [];
    return cards.filter((c) => this.answerDraft(c).optionId !== null).length;
  });

  protected async submitAnswers() {
    const cards = this.questions()?.cards ?? [];
    const missing: Record<string, string> = {};
    for (const card of cards) {
      const d = this.answerDraft(card);
      if (d.optionId === null) missing[card.id] = 'Bu soruyu yanıtlayınız.';
      else if (this.explained(card) && !d.explanation.trim()) missing[card.id] = 'Bu seçenek için açıklama yazınız.';
      else if (d.explanation.trim().length > ANSWER_MAX) missing[card.id] = `Açıklama en fazla ${ANSWER_MAX} karakter olabilir.`;
    }
    this.missing.set(missing);
    if (Object.keys(missing).length) return;
    await this.store.answerEvaluation(
      cards.map((card) => ({
        targetFactId: card.id,
        optionId: this.answerDraft(card).optionId!,
        explanation: this.explained(card) ? this.answerDraft(card).explanation : null,
      })),
    );
  }
}
