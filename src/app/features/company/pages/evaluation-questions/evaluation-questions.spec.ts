import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoServerApi } from '@core/api/demo/demo-server-api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application, EvaluationQuestions } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { companyRoutes } from '../../company.routes';

const routes = [...companyRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/deck/more-information');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    harness.detectChanges();
  };
  const radios = (card = 0) => [...root().querySelectorAll<HTMLElement>('.wz-questions section')[card].querySelectorAll<HTMLElement>('[role=radio]')];
  const choose = (n: number, card = 0) => {
    radios(card)[n].click();
    harness.detectChanges();
  };
  const textarea = () => root().querySelector<HTMLTextAreaElement>('.explain textarea');
  const explain = (text: string) => {
    textarea()!.value = text;
    textarea()!.dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  const send = () => {
    button('Yanıtları gönder')!.click();
    harness.detectChanges();
  };
  const fieldErrors = () => [...root().querySelectorAll('.wz-fielderr')].map((e) => e.textContent?.trim());
  const alerts = () => [...root().querySelectorAll('[role=alert]')].map((e) => e.textContent?.trim());
  return { harness, root, q, button, settle, radios, choose, textarea, explain, send, fieldErrors, alerts };
}

/** D-1g against the mock API, which asks the stand-in evaluator's one question. */
describe('EvaluationQuestionsPage (D-1g), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('evaluationQuestions');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(store.error()).toBeNull();
    expect(page.alerts()).toEqual([]);
  });

  it('says it is loading, then shows the question with its options; nothing chosen', async () => {
    const page = await open();
    expect(page.q('.wz-lead')).toBe('Sorular yükleniyor…');
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.root().querySelector('.wz-questions')).not.toBeNull();
    });
    expect(page.q('.wz-lead')).toContain('bir soruya yanıt bekliyor');
    expect(page.q('.wz-questions h2')).toBe('Müşteriye sunulan nihai teknik çözüm dışarıdan ne ölçüde hazır geliyor?');
    expect(page.radios().map((r) => r.querySelector('b')!.textContent!.trim())).toEqual([
      'Nihai teknik çözüm hazır gelmiyor',
      'Nihai teknik çözüm hazır veya anahtar teslim geliyor',
      'Bilmiyorum veya doğrulayamıyorum',
    ]);
    expect(page.radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false']);
    expect(page.textarea()).toBeNull();
  });

  it('checks before sending: a choice, and an explanation where the option asks for one', async () => {
    const answer = vi.spyOn(TestBed.inject(Api), 'answerEvaluation');
    const page = await open();
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.root().querySelector('.wz-questions')).not.toBeNull();
    });
    page.send();
    expect(page.fieldErrors()).toEqual(['Bu soruyu yanıtlayınız.']);
    expect(page.root().querySelector('[role=radiogroup]')!.getAttribute('aria-describedby')).toBe('qe-B1');

    page.choose(0);
    expect(page.fieldErrors()).toEqual([]);
    expect(page.radios()[0].getAttribute('aria-checked')).toBe('true');
    expect(page.q('.explain .hint')).toContain('Ürününüzün tanımlayıcı teknik davranışını');
    expect(page.textarea()!.maxLength).toBe(2000);
    expect(page.q('.explain .count')).toBe('0 / 2000');
    page.send();
    expect(page.fieldErrors()).toEqual(['Bu seçenek için açıklama yazınız.']);
    page.explain('   ');
    page.send();
    expect(page.fieldErrors()).toEqual(['Bu seçenek için açıklama yazınız.']);
    expect(answer).not.toHaveBeenCalled();
  });

  it('an option without an explanation: the box goes and nothing typed is sent', async () => {
    const answer = vi.spyOn(TestBed.inject(Api), 'answerEvaluation');
    const page = await open();
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.root().querySelector('.wz-questions')).not.toBeNull();
    });
    page.choose(0);
    page.explain('Yazılan ama gönderilmeyecek.');
    page.choose(2);
    expect(page.textarea()).toBeNull();
    page.send();
    expect(answer).toHaveBeenCalledWith([{ targetFactId: 'B1', optionId: 'UNABLE_TO_VERIFY', explanation: null }]);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/evaluating'));
  });

  it('sends the explanation as typed; the evaluation goes on (D-1b)', async () => {
    const answer = vi.spyOn(TestBed.inject(Api), 'answerEvaluation');
    const page = await open();
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.root().querySelector('.wz-questions')).not.toBeNull();
    });
    page.choose(0);
    page.explain(' Kendi sıralama algoritmamızı geliştirdik. ');
    expect(page.q('.explain .count')).toBe('41 / 2000');
    page.send();
    expect(answer).toHaveBeenCalledWith([{ targetFactId: 'B1', optionId: 'NOT_SUBSTANTIALLY_EXTERNALLY_SUPPLIED_AS_OFFERED', explanation: ' Kendi sıralama algoritmamızı geliştirdik. ' }]);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/evaluating'));
    expect(store.stage()).toBe('evaluating');
  });

  it('keyboard: Enter and Space choose an option', async () => {
    const page = await open();
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.root().querySelector('.wz-questions')).not.toBeNull();
    });
    page.radios()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    page.harness.detectChanges();
    expect(page.radios()[1].getAttribute('aria-checked')).toBe('true');
    page.radios()[2].dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    page.harness.detectChanges();
    expect(page.radios()[2].getAttribute('aria-checked')).toBe('true');
  });
});

/** Two cards, as the evaluation service may send them (hand-written: the stand-in evaluator asks one). */
const TWO: EvaluationQuestions = {
  answerable: true,
  receivedAt: '2026-11-25T14:19:14+00:00',
  cards: [
    {
      id: 'B1',
      prompt: 'Birinci soru?',
      options: [
        { id: 'A', label: 'Evet', description: 'Açıklamalı', explanationRequired: true, explanationPrompt: null },
        { id: 'B', label: 'Hayır', description: null, explanationRequired: false, explanationPrompt: null },
      ],
    },
    { id: 'C2', prompt: 'İkinci soru?', options: [{ id: 'X', label: 'Bir', description: null, explanationRequired: false, explanationPrompt: null }] },
  ],
};

/** D-1g in HTTP mode: the real store over a stand-in for the API. */
describe('EvaluationQuestionsPage (D-1g), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (view: unknown) => toApplication(view as never, account);

  function setUp(app: Application, calls: Record<string, unknown>, demo: { available: boolean; evaluation?: (o: string) => Promise<void> } = { available: false }) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = {
      demo: null,
      work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen },
      restore: async () => ({ account, app }),
      reference: vi.fn(async () => CAPTURED.reference),
      evaluationReference: vi.fn(async () => CAPTURED.referenceEvaluation),
      ...calls,
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: Api, useValue: api },
        { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T14:20:00Z')) } },
        { provide: DemoServerApi, useValue: { available: computed(() => demo.available), evaluation: demo.evaluation } },
      ],
    });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return { store, api };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('two cards are numbered; each card is checked on its own', async () => {
    setUp(map(CAPTURED.evaluationQuestions), { evaluationQuestions: async () => TWO });
    const page = await open();
    await page.settle();
    expect(page.q('.wz-lead')).toContain('2 soruya yanıt bekliyor');
    expect([...page.root().querySelectorAll('.wz-questions h2')].map((h) => h.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['1.Birinci soru?', '2.İkinci soru?']);
    page.choose(1, 0);
    page.send();
    expect(page.fieldErrors()).toEqual(['Bu soruyu yanıtlayınız.']);
    expect(page.root().querySelectorAll('.wz-questions section')[1].querySelector('.wz-fielderr')!.id).toBe('qe-C2');
  });

  it('sends one answer per card; the explanation only where the option asks for one', async () => {
    const answerEvaluation = vi.fn(async () => map(CAPTURED.evaluating));
    setUp(map(CAPTURED.evaluationQuestions), { evaluationQuestions: async () => TWO, answerEvaluation });
    const page = await open();
    await page.settle();
    page.choose(0, 0);
    page.explain('Neden.');
    page.choose(0, 1);
    page.send();
    expect(answerEvaluation).toHaveBeenCalledWith([
      { targetFactId: 'B1', optionId: 'A', explanation: 'Neden.' },
      { targetFactId: 'C2', optionId: 'X', explanation: null },
    ]);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck/evaluating'));
  });

  it('the API\'s refusal: a card\'s sentence at the card, the general one under the cards', async () => {
    const answerEvaluation = vi.fn(async () => {
      throw new ApiError('Eksik veya hatalı yanıtları düzeltiniz.', {
        code: 'validation_failed',
        status: 400,
        fields: { 'answers.C2': ['Seçeneklerden birini seçiniz.'], answers: ['Yanıtlar sorularla eşleşmiyor; sayfayı yenileyip tekrar deneyiniz.'] },
      });
    });
    setUp(map(CAPTURED.evaluationQuestions), { evaluationQuestions: async () => TWO, answerEvaluation });
    const page = await open();
    await page.settle();
    page.choose(1, 0);
    page.choose(0, 1);
    page.send();
    await page.settle();
    expect(page.fieldErrors()).toEqual(['Seçeneklerden birini seçiniz.', 'Yanıtlar sorularla eşleşmiyor; sayfayı yenileyip tekrar deneyiniz.']);
    expect(page.alerts()).toContain('Eksik veya hatalı yanıtları düzeltiniz.');
    // Choosing again clears the screen's own message only; the API's stays until the next send.
    page.choose(0, 1);
    expect(page.fieldErrors()).toEqual(['Seçeneklerden birini seçiniz.', 'Yanıtlar sorularla eşleşmiyor; sayfayı yenileyip tekrar deneyiniz.']);
  });

  it('questions it cannot show: the stop state with the files received, no form', async () => {
    setUp(map(CAPTURED.evaluationQuestions), { evaluationQuestions: async () => ({ answerable: false, receivedAt: '2026-11-25T14:19:14+00:00', cards: [] }) });
    const page = await open();
    await page.settle();
    expect(page.root().querySelector('.wz-questions')).toBeNull();
    expect(page.q('.wz-lead')).toBe('Değerlendirme hizmeti başvurunuzla ilgili ek bilgiye ihtiyaç duydu. Sizinle iletişime geçeceğiz; bu ekranda yapmanız gereken bir şey yoktur.');
    expect([...page.root().querySelectorAll('.wz-checks li small')].map((s) => s.textContent?.trim())[0]).toBe('Lumora Sunum questions.pdf · Ozgecmis.pdf');
  });

  it('a failed read of the questions: the same stop state', async () => {
    setUp(map(CAPTURED.evaluationQuestions), {
      evaluationQuestions: async () => {
        throw new ApiError('Yanıtlanacak soru yok.', { code: 'no_questions', status: 404 });
      },
    });
    const page = await open();
    await page.settle();
    expect(page.root().querySelector('.wz-questions')).toBeNull();
    expect(page.root().querySelector('.wz-checks')).not.toBeNull();
  });

  it('the demo bar against a demo API: "Tamamlandı"', async () => {
    const evaluation = vi.fn(async () => undefined);
    setUp(map(CAPTURED.evaluationQuestions), { evaluationQuestions: async () => TWO }, { available: true, evaluation });
    const page = await open();
    await page.settle();
    const bar = page.root().querySelector('app-demo-bar section')!;
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['Tamamlandı']);
    page.button('Tamamlandı')!.click();
    expect(evaluation).toHaveBeenCalledWith('done');
  });
});
