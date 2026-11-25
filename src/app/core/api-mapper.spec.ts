import { splitNace, toAccount, toApplication, toStage } from './api-mapper';
import { ME, NEW_APPLICATION, REVIEW_APPLICATION } from './testing/api-fixtures';

describe('api-mapper', () => {
  const account = toAccount(ME);

  it('maps /api/me to an account without a password', () => {
    expect(account).toEqual({ email: 'ayse@example.test', firstName: 'Ayşe', lastName: 'Kaya', founderType: 'foreign', verified: true });
    expect(toAccount({ ...ME, email: null, founderType: 'resident' })).toMatchObject({ email: '', founderType: 'resident' });
  });

  it('maps a fresh application with neutral empty values where the API has nothing yet', () => {
    const app = toApplication(NEW_APPLICATION, account);
    expect(app.id).toBe('DS-26-03403699');
    expect(app.stage).toBe('profile');
    expect(app.createdAt).toBe('2026-11-25T09:41:12.408113+00:00');
    expect(app.founder).toEqual({ firstName: 'Ayşe', lastName: 'Kaya', nationality: '', passportNo: '' });
    expect(app.contact).toEqual({ email: 'ayse@example.test', phone: '', address: '', postalCode: '', country: '' });
    expect(app.company).toEqual({ deckName: '', root: '', activity: '', nace: [], suggestedNace: [], capital: 250_000 });
    expect(app.profile).toBeUndefined();
    expect(app.deck).toBeUndefined();
    expect(app.crossCheck).toEqual([]);
    expect(app.marks).toEqual({});
    expect(app.payment).toBeUndefined();
    expect(app.fees).toEqual([
      { code: 'tescil_ilan_harci', label: 'Ticaret sicili tescil ve ilan harçları', amount: 4_850 },
      { code: 'noter_eimza', label: 'Noter onayı ve e-İmza (ESHS)', amount: 2_400 },
      { code: 'sanal_ofis_yil1', label: 'Sanal ofis · ilk yıl', amount: 3_600 },
      { code: 'platform', label: 'Platform hizmet bedeli', amount: 1_900 },
    ]);
    expect(app.eligibility).toBeUndefined();
    expect(app.setup).toBeUndefined();
    expect(app.results).toBeUndefined();
    expect(app.logs).toEqual([{ at: '2026-11-25T09:41:12.408113+00:00', text: 'Başvuru oluşturuldu', who: 's' }]);
  });

  it('maps the review: profile, deck, comparison, the founder\'s current values and their marks', () => {
    const app = toApplication(REVIEW_APPLICATION, account);
    expect(app.stage).toBe('review');
    expect(app.profile).toEqual({ brand: 'Lumora', sector: 'software', funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya', at: '2026-11-25T09:45:00+00:00' });
    expect(app.deck).toEqual({
      fileName: 'Lumora Sunum.pdf',
      sizeKb: 57,
      pages: 16,
      startedAt: '2026-11-25T09:46:00+00:00',
      fields: [
        { key: 'trade_name', label: 'Şirket unvanı', value: 'Lumora Veri Analitiği', page: 13 },
        { key: 'nace_codes', label: 'NACE kodları', value: '62.01, 63.11', page: 13 },
        { key: 'phone', label: 'Telefon', value: '+49 151 2345 6789', page: 15 },
      ],
    });
    expect(app.crossCheck[1]).toEqual({ key: 'phone', label: 'Telefon', stated: '+49 151 2345 6700', read: '+49 151 2345 6789', match: false, choice: null, at: null });
    expect(app.company).toMatchObject({ deckName: 'Lumora Veri Analitiği', root: 'Lumora', activity: 'Veri Analitiği', nace: ['62.01', '63.11'] });
    expect(app.founder).toMatchObject({ firstName: 'Ayşe', lastName: 'Kaya-Berg', nationality: 'Almanya' });
    expect(app.contact).toEqual({ email: 'ayse@example.test', phone: '+49 151 2345 6789', address: 'Torstraße 45, Berlin', postalCode: '10119', country: 'Almanya' });
    expect(app.funding).toBe('investor');
    // trade_name was read with medium confidence: to be checked. A changed family name marks the whole name row.
    expect(app.marks).toEqual({ title: 'check', nace: 'ai', name: 'edited', phone: 'ai', address: 'edited', funding: 'edited' });
    expect(app.logs.map((l) => l.who)).toEqual(['s', 'u', 'a']);
  });

  it('maps the stages the portal knows and refuses one it does not', () => {
    expect(toStage('threeDs')).toBe('threeDs');
    expect(toStage('titleConflict')).toBe('titleConflict');
    // No screen for the MERSİS wait yet.
    expect(toStage('titleChecking')).toBe('review');
    expect(() => toStage('archived' as never)).toThrow('Unknown application stage');
  });

  it('maps the trade-name check, payment and signature where they exist', () => {
    const app = toApplication(
      {
        ...REVIEW_APPLICATION,
        stage: 'signed',
        titleCheck: { status: 'conflict', candidate: 'Lumora Veri Analitiği', reason: 'Benzer unvan kayıtlı.' },
        payment: { ...REVIEW_APPLICATION.payment, status: 'paid', last4: '4242', paidAt: '2026-11-25T10:00:00+00:00' },
        signature: { kind: 'daily', serial: 'ESHS-2611-AAAA', issuedAt: '2026-11-25T10:10:00+00:00', validUntil: '2026-11-26T10:10:00+00:00' },
        callConsentAt: '2026-11-25T10:05:00+00:00',
      },
      account,
    );
    expect(app.titleCheck).toEqual({ status: 'conflict', candidate: 'Lumora Veri Analitiği', alternatives: [] });
    expect(app.payment).toEqual({ holder: '', last4: '4242', amount: 12_750, paidAt: '2026-11-25T10:00:00+00:00' });
    expect(app.signature).toEqual({ method: 'eshs', serial: 'ESHS-2611-AAAA', holder: 'Ayşe Kaya-Berg', issuedAt: '2026-11-25T10:10:00+00:00', validUntil: '2026-11-26T10:10:00+00:00' });
    expect(app.callConsentAt).toBe('2026-11-25T10:05:00+00:00');
    expect(toApplication({ ...REVIEW_APPLICATION, titleCheck: { status: 'checking', candidate: 'x', reason: null } }, account).titleCheck).toBeUndefined();
  });

  it('splits NACE codes with the separators the API accepts', () => {
    expect(splitNace('62.01, 63.11 · 62.02;62.01')).toEqual(['62.01', '63.11', '62.02']);
    expect(splitNace('')).toEqual([]);
  });
});
