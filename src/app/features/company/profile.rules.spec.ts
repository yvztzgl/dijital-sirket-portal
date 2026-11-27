import { Profile } from '@core/models/models';
import { profileDraft, profileNaceOptions, profileReady, SAMPLE_PROFILE } from './profile.rules';

describe('profile rules (D-1e)', () => {
  const saved: Profile = { brand: 'Lumora', naceCodes: ['62.01'], funding: 'investor', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Fransa', at: '2026-11-25T09:45:00Z' };

  it('a draft from the saved profile, without its time and with its own copy of the codes', () => {
    const d = profileDraft(saved);
    expect(d).toEqual({ brand: 'Lumora', naceCodes: ['62.01'], funding: 'investor', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Fransa' });
    expect(d.naceCodes).not.toBe(saved.naceCodes);
    expect(profileDraft()).toEqual({ brand: '', naceCodes: [], funding: '', nationality: '', phone: '', country: '' });
  });

  it('ready only with every field, a brand of 2+ and a phone of 8 to 15 digits', () => {
    const ok = profileDraft(saved);
    expect(profileReady(ok)).toBe(true);
    expect(profileReady(SAMPLE_PROFILE)).toBe(true);
    expect(profileReady({ ...ok, brand: ' L ' })).toBe(false);
    expect(profileReady({ ...ok, naceCodes: [] })).toBe(false);
    expect(profileReady({ ...ok, funding: '' })).toBe(false);
    expect(profileReady({ ...ok, nationality: '' })).toBe(false);
    expect(profileReady({ ...ok, country: '' })).toBe(false);
    expect(profileReady({ ...ok, phone: '1234567' })).toBe(false);
    expect(profileReady({ ...ok, phone: '+1 (234) 567-8' })).toBe(true);
    expect(profileReady({ ...ok, phone: '1'.repeat(15) })).toBe(true);
    expect(profileReady({ ...ok, phone: '1'.repeat(16) })).toBe(false);
  });

  it('the NACE choices by name', () => {
    expect(profileNaceOptions({ sectors: [], funding: [], naceCodes: [{ code: '62.01', title: 'Programlama', translationKey: '' }] })).toEqual([{ value: '62.01', label: 'Programlama' }]);
    expect(profileNaceOptions(null)).toEqual([]);
  });
});
