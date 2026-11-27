import { WizardReference } from '@core/models/models';

/** One-line explanation under each funding option in the picker. */
const FUNDING_HINTS: Record<string, string> = {
  'own-abroad': 'Kendi adınıza yurt dışındaki bir hesaptan',
  'own-turkey': 'Türkiye’de kendi adınıza açılmış bir hesaptan',
  investor: 'Yatırım sözleşmesiyle gelen sermaye',
  'third-party': 'Başka bir kişi veya şirketten · uyum ekibi elle inceler',
};

/** The capital sources the API accepts, on D-1e and in D-1c's funding editor. */
export function fundingOptions(reference: WizardReference | null) {
  return (reference?.funding ?? []).map((v) => ({ value: v.key, label: v.label, hint: FUNDING_HINTS[v.key] }));
}
