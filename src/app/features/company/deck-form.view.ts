import { Evaluation, EvaluationAnswers, EvaluationReason, EvaluationReference, Stage } from '@core/models/models';
import { EvaluationLimits } from '@core/utils/rules';

/**
 * STB's "Faaliyet grubu" is fixed to 1 "Yazılım ve BT" (owner, 2026-11-27): shown read-only on D-1a and
 * sent with every upload; "Faaliyet alanı" then lists that group's activities only.
 */
export const FIXED_ACTIVITY_GROUP_ID = 1;

/** D-1a's answers before the founder gives any. */
export const EMPTY_ANSWERS: EvaluationAnswers = { summary: '', activityGroupId: FIXED_ACTIVITY_GROUP_ID, activityId: null, businessModelIds: [], revenueModelIds: [], productTypeIds: [] };

/** The three multiple choices' fields. */
export type MultiKey = 'businessModelIds' | 'revenueModelIds' | 'productTypeIds';
/** The two single choices' fields. */
export type ChoiceKey = 'activityGroupId' | 'activityId';

/** What D-1a says above the form when the last evaluation did not end well (the API is back at `verified`). */
const EVALUATION_ENDED: Record<'failed' | 'rejected' | 'cancelled', { title: string; text: string }> = {
  failed: { title: 'Önceki değerlendirme tamamlanamadı', text: 'Değerlendirme hizmeti başvurunuzu sonuçlandıramadı. Lütfen sunumunuzu ve özgeçmişinizi yeniden yükleyiniz.' },
  rejected: { title: 'Sunumunuz değerlendirmeye alınamadı', text: 'Lütfen sunumun 3 ile 40 sayfa arasında bir PDF dosyası olduğunu kontrol ederek yeniden yükleyiniz.' },
  cancelled: { title: 'Önceki değerlendirme iptal edildi', text: 'Devam etmek için sunumunuzu ve özgeçmişinizi yeniden yükleyiniz.' },
};

/**
 * A `rejected` evaluation whose reason the API knows gets its own words instead of the general
 * `rejected` notice. The brand is the profile's ("Ön bilgileri düzenle" below the form); the other
 * three are answers on this form.
 */
const EVALUATION_REJECTED_BECAUSE: Record<EvaluationReason, { title: string; text: string }> = {
  formDeckConflict: { title: 'Form yanıtlarınız sunumunuzla uyuşmuyor', text: 'Değerlendirme hizmeti, formdaki bilgileri sunumunuzdaki ürün veya faaliyet bilgileriyle uyumlu bulmadı. Marka adınızı (Ön bilgiler), kısa özet, faaliyet alanı ve gelir modeli yanıtlarınızı sunumunuza göre düzelterek yeniden yükleyiniz.' },
};

/** The last evaluation ended without a result; D-1a says so above the form and takes a new upload. */
export function evaluationNotice(stage: Stage | null, evaluation: Evaluation | undefined) {
  const e = stage === 'verified' ? evaluation : undefined;
  const status = e?.status;
  if (status === 'rejected' && e?.reason) return EVALUATION_REJECTED_BECAUSE[e.reason];
  return status === 'failed' || status === 'rejected' || status === 'cancelled' ? EVALUATION_ENDED[status] : null;
}

/** The fixed activity group's label from STB's dictionary ("Yazılım ve BT"); the field is read-only. */
export function fixedGroupLabel(ref: EvaluationReference | null): string {
  return ref?.activityGroups.find((o) => o.id === FIXED_ACTIVITY_GROUP_ID)?.label ?? 'Yazılım ve BT';
}

/**
 * Each activity's group, when the reference links them (`groupId`, our derived mapping, not from
 * STB); empty from an API built before it, and then group and activity stay independent.
 */
export function groupOfActivity(ref: EvaluationReference | null): Map<number, number> {
  const pairs = (ref?.activities ?? []).flatMap((o) => (o.groupId === undefined ? [] : [[o.id, o.groupId] as const]));
  return new Map<number, number>(pairs);
}

/** A chosen group narrows the activities to its own; without a group (or without the link) all of them. */
export function activityOptions(ref: EvaluationReference | null, group: number | null, linked: boolean) {
  return (ref?.activities ?? [])
    .filter((o) => group === null || !linked || o.groupId === group)
    .map((o) => ({ value: String(o.id), label: o.label }));
}

/** A group's list is short (2 to 28), so it reads as a plain choice; the full list asks for a search. */
export function activityPlaceholder(group: number | null, linked: boolean): string {
  return group !== null && linked ? 'Seçiniz' : 'Aramak için yazınız';
}

/** The three multiple choices, in the form's order, with the API's field names. */
export function multiChoices(ref: EvaluationReference | null) {
  return [
    { key: 'businessModelIds' as const, title: 'İş modeli', options: ref?.businessModels ?? [] },
    { key: 'revenueModelIds' as const, title: 'Gelir modeli', options: ref?.revenueModels ?? [] },
    { key: 'productTypeIds' as const, title: 'Ürün türü', options: ref?.productTypes ?? [] },
  ].map((c) => ({ ...c, options: c.options.map((o) => ({ value: String(o.id), label: o.label })) }));
}

/** "120 / 2000 karakter · en az 50" under the summary. */
export function summaryHint(limits: EvaluationLimits | null, summary: string): string {
  const n = summary.trim().length;
  if (!limits) return `${n} karakter`;
  return n < limits.summaryMin ? `${n} / ${limits.summaryMax} karakter · en az ${limits.summaryMin}` : `${n} / ${limits.summaryMax} karakter`;
}

export function summaryOver(limits: EvaluationLimits | null, summary: string): boolean {
  return summary.trim().length > (limits?.summaryMax ?? Infinity);
}

/**
 * Group and activity are parent and child when the reference links them: an activity brings its
 * group with it, and a group that does not hold the chosen activity clears it. `cleared`: the other
 * choice whose messages go too (the chosen one's always go).
 */
export function choose(a: EvaluationAnswers, key: ChoiceKey, value: string, groupOf: Map<number, number>): { answers: EvaluationAnswers; cleared: ChoiceKey | null } {
  const id = value ? Number(value) : null;
  if (key === 'activityId') {
    const group = id === null ? undefined : groupOf.get(id);
    return {
      answers: { ...a, activityId: id, activityGroupId: group ?? a.activityGroupId },
      cleared: group !== undefined && group !== a.activityGroupId ? 'activityGroupId' : null,
    };
  }
  const keep = a.activityId === null || id === null || !groupOf.has(a.activityId) || groupOf.get(a.activityId) === id;
  return { answers: { ...a, activityGroupId: id, activityId: keep ? a.activityId : null }, cleared: keep ? null : 'activityId' };
}
