import { Application } from '@core/models/models';
import { founderInitials, signatureExpired } from './e-signature.rules';

const signature = { method: 'eshs' as const, serial: 'S', holder: 'H', issuedAt: '2026-11-25T10:00:00Z', validUntil: '2026-11-26T10:00:00Z' };
const app = (extra: Partial<Application>) => ({ stage: 'signing', founder: { firstName: 'ilker', lastName: 'Öz', nationality: '', passportNo: '' }, ...extra }) as Application;
const until = Date.parse(signature.validUntil);

describe('e-signature rules', () => {
  it('signatureExpired: at signing, with a certificate whose time is up', () => {
    expect(signatureExpired(app({ signature }), until)).toBe(true);
    expect(signatureExpired(app({ signature }), until - 1)).toBe(false);
    expect(signatureExpired(app({}), until)).toBe(false);
    expect(signatureExpired(app({ signature, stage: 'signed' }), until + 1)).toBe(false);
    expect(signatureExpired(null, until)).toBe(false);
  });

  it('founderInitials: first letters, Turkish upper case, empty without a founder', () => {
    expect(founderInitials(app({}))).toBe('İÖ');
    expect(founderInitials(null)).toBe('');
  });
});
