import { Evaluation, EvaluationReference } from '@core/models/models';
import { activityOptions, activityPlaceholder, choose, EMPTY_ANSWERS, evaluationNotice, fixedGroupLabel, groupOfActivity, multiChoices, summaryHint, summaryOver } from './deck-form.view';

const LIMITS = { deckMaxMb: 25, cvMaxMb: 5, deckMinPages: 3, deckMaxPages: 40, summaryMin: 50, summaryMax: 2000 };
const REF: EvaluationReference = {
  activityGroups: [{ id: 1, label: 'Yazılım ve BT' }, { id: 2, label: 'Finans' }],
  activities: [{ id: 3, label: 'YZ', groupId: 1 }, { id: 11, label: 'ERP', groupId: 1 }, { id: 40, label: 'Banka', groupId: 2 }],
  businessModels: [{ id: 1, label: 'B2B' }],
  revenueModels: [{ id: 2, label: 'Komisyon' }],
  productTypes: [{ id: 3, label: 'Dijital' }],
  limits: LIMITS,
};
const ended = (status: Evaluation['status'], reason: Evaluation['reason'] = null): Evaluation => ({ status, attempt: 1, maxAttempts: 3, startedAt: '', finishedAt: null, reason });

describe('deck form view (D-1a)', () => {
  it('a notice only at `verified` after an evaluation that ended without a result', () => {
    expect(evaluationNotice('verified', undefined)).toBeNull();
    expect(evaluationNotice('verified', ended('done'))).toBeNull();
    expect(evaluationNotice('evaluating', ended('failed'))).toBeNull();
    expect(evaluationNotice('verified', ended('failed'))!.title).toBe('Önceki değerlendirme tamamlanamadı');
    expect(evaluationNotice('verified', ended('cancelled'))!.title).toBe('Önceki değerlendirme iptal edildi');
    expect(evaluationNotice('verified', ended('rejected'))!.title).toBe('Sunumunuz değerlendirmeye alınamadı');
    expect(evaluationNotice('verified', ended('rejected', 'formDeckConflict'))!.title).toBe('Form yanıtlarınız sunumunuzla uyuşmuyor');
  });

  it('the fixed group\'s label, with a fallback before the reference', () => {
    expect(fixedGroupLabel({ ...REF, activityGroups: [{ id: 1, label: 'Yazılım' }] })).toBe('Yazılım');
    expect(fixedGroupLabel(null)).toBe('Yazılım ve BT');
  });

  it('activities narrowed to a linked group; all of them without the link or a group', () => {
    const linked = groupOfActivity(REF).size > 0;
    expect(activityOptions(REF, 1, linked).map((o) => o.value)).toEqual(['3', '11']);
    expect(activityOptions(REF, null, linked).map((o) => o.value)).toEqual(['3', '11', '40']);
    expect(activityOptions(REF, 1, false).map((o) => o.value)).toEqual(['3', '11', '40']);
    expect(activityPlaceholder(1, true)).toBe('Seçiniz');
    expect(activityPlaceholder(1, false)).toBe('Aramak için yazınız');
    expect(activityPlaceholder(null, true)).toBe('Aramak için yazınız');
    expect(groupOfActivity({ ...REF, activities: [{ id: 3, label: 'YZ' }] }).size).toBe(0);
  });

  it('the three multiple choices with string values', () => {
    expect(multiChoices(REF)).toEqual([
      { key: 'businessModelIds', title: 'İş modeli', options: [{ value: '1', label: 'B2B' }] },
      { key: 'revenueModelIds', title: 'Gelir modeli', options: [{ value: '2', label: 'Komisyon' }] },
      { key: 'productTypeIds', title: 'Ürün türü', options: [{ value: '3', label: 'Dijital' }] },
    ]);
    expect(multiChoices(null).map((c) => c.options)).toEqual([[], [], []]);
  });

  it('the summary\'s count and its maximum', () => {
    expect(summaryHint(null, ' abc ')).toBe('3 karakter');
    expect(summaryHint(LIMITS, 'a'.repeat(49))).toBe('49 / 2000 karakter · en az 50');
    expect(summaryHint(LIMITS, 'a'.repeat(50))).toBe('50 / 2000 karakter');
    expect(summaryOver(LIMITS, 'a'.repeat(2001))).toBe(true);
    expect(summaryOver(LIMITS, 'a'.repeat(2000))).toBe(false);
    expect(summaryOver(null, 'a'.repeat(5000))).toBe(false);
  });

  it('an activity brings its group; a group that does not hold the activity clears it', () => {
    const groupOf = groupOfActivity(REF);
    expect(choose(EMPTY_ANSWERS, 'activityId', '40', groupOf)).toEqual({ answers: { ...EMPTY_ANSWERS, activityId: 40, activityGroupId: 2 }, cleared: 'activityGroupId' });
    expect(choose(EMPTY_ANSWERS, 'activityId', '3', groupOf)).toEqual({ answers: { ...EMPTY_ANSWERS, activityId: 3 }, cleared: null });
    expect(choose(EMPTY_ANSWERS, 'activityId', '', groupOf)).toEqual({ answers: { ...EMPTY_ANSWERS, activityId: null }, cleared: null });
    const withActivity = { ...EMPTY_ANSWERS, activityId: 3 };
    expect(choose(withActivity, 'activityGroupId', '2', groupOf)).toEqual({ answers: { ...withActivity, activityGroupId: 2, activityId: null }, cleared: 'activityId' });
    expect(choose(withActivity, 'activityGroupId', '1', groupOf)).toEqual({ answers: withActivity, cleared: null });
    // Without the link they are independent.
    expect(choose(withActivity, 'activityGroupId', '2', new Map())).toEqual({ answers: { ...withActivity, activityGroupId: 2 }, cleared: null });
  });
});
