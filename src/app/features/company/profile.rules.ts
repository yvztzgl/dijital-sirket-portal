import { FundingSource, Profile, WizardReference } from '@core/models/models';

/** D-1e's form: a profile without its time, the source not chosen yet (''). */
export type ProfileDraft = Omit<Profile, 'at' | 'funding'> & { funding: FundingSource | '' };

/** Starts from what was saved before, when the founder comes back to change it. */
export function profileDraft(saved?: Profile): ProfileDraft {
  return saved
    ? { brand: saved.brand, naceCodes: [...saved.naceCodes], funding: saved.funding, nationality: saved.nationality, phone: saved.phone, country: saved.country }
    : { brand: '', naceCodes: [], funding: '', nationality: '', phone: '', country: '' };
}

/** Every field given: a brand of 2+ characters, an activity, a source, both countries and a phone of 8 to 15 digits. */
export function profileReady(p: ProfileDraft): boolean {
  const digits = p.phone.replace(/\D/g, '').length;
  return p.brand.trim().length >= 2 && p.naceCodes.length > 0 && !!p.funding && !!p.nationality && !!p.country && digits >= 8 && digits <= 15;
}

/** D-1e's "Faaliyet alanı": the NACE list of `Api.reference`, by name only; the codes stay out of sight (API step 24). */
export function profileNaceOptions(reference: WizardReference | null) {
  return (reference?.naceCodes ?? []).map((n) => ({ value: n.code, label: n.title }));
}

/** Demo: values for the downloadable sample deck (Lumora Analytics). */
export const SAMPLE_PROFILE: ProfileDraft = { brand: 'Lumora Analytics', naceCodes: ['62.10.00', '63.10.00'], funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya' };
