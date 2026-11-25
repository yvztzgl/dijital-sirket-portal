import { LOG_TEXTS, splitNace, toAccount, toApplication, toReviewFields, toStage } from './api-mapper';
import { CAPTURED, DECK_FAILED, IDENTITY_FAILED, IDENTITY_FAILED_TWICE, ME, NEW_APPLICATION, REVIEW_APPLICATION } from './testing/api-fixtures';

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
      // Under the portal's keys, which the scan and review screens look up.
      fields: [
        { key: 'title', label: 'Şirket unvanı', value: 'Lumora Veri Analitiği', page: 13 },
        { key: 'nace', label: 'NACE kodları', value: '62.01, 63.11', page: 13 },
        { key: 'phone', label: 'Telefon', value: '+49 151 2345 6789', page: 15 },
      ],
      status: 'read',
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
    expect(toStage('titleChecking')).toBe('titleChecking');
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
    expect(app.titleCheck).toEqual({
      status: 'conflict',
      candidate: 'Lumora Veri Analitiği',
      reason: 'Benzer unvan kayıtlı.',
      alternatives: ['Lumora Bulut Yazılım', 'Lumoranova Bilişim', 'Lumora Cloudline Teknoloji'],
    });
    expect(app.payment).toEqual({ holder: '', last4: '4242', amount: 12_750, paidAt: '2026-11-25T10:00:00+00:00' });
    expect(app.signature).toEqual({ method: 'eshs', serial: 'ESHS-2611-AAAA', holder: 'Ayşe Kaya-Berg', issuedAt: '2026-11-25T10:10:00+00:00', validUntil: '2026-11-26T10:10:00+00:00' });
    expect(app.callConsentAt).toBe('2026-11-25T10:05:00+00:00');
    expect(toApplication({ ...REVIEW_APPLICATION, titleCheck: { status: 'checking', candidate: 'X A.Ş.', reason: null } }, account).titleCheck).toEqual({
      status: 'checking',
      candidate: 'X',
    });
  });

  it('splits NACE codes with the separators the API accepts', () => {
    expect(splitNace('62.01, 63.11 · 62.02;62.01')).toEqual(['62.01', '63.11', '62.02']);
    expect(splitNace('')).toEqual([]);
  });
});

/** The portal model for each answer the running API gave in step 1 (testing/captured/, 2026-11-25). */
describe('api-mapper on captured API answers', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (key: keyof typeof CAPTURED) => toApplication(CAPTURED[key] as never, account);

  it('profile: a fresh application, the name from the account', () => {
    const app = map('profile');
    expect(app.stage).toBe('profile');
    expect(app.id).toMatch(/^DS-\d{2}-\d{8}$/);
    expect(app.founder).toEqual({ firstName: 'Deneme', lastName: 'Kurucu', nationality: '', passportNo: '' });
    expect(app.profile).toBeUndefined();
    expect(app.deck).toBeUndefined();
    expect(app.titleCheck).toBeUndefined();
  });

  it('verified: the profile as stated', () => {
    const app = map('verified');
    expect(app.stage).toBe('verified');
    expect(app.profile).toMatchObject({ brand: 'Lumora', sector: 'software', funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya' });
    expect(app.deck).toBeUndefined();
  });

  it('scanning: the deck without fields or pages yet, still reading', () => {
    const app = map('scanning');
    expect(app.stage).toBe('scanning');
    expect(app.deck).toMatchObject({ fileName: 'Lumora Sunum.pdf', sizeKb: 1, pages: 0, fields: [], status: 'reading' });
    expect(app.crossCheck).toEqual([]);
    expect(app.company.root).toBe('');
  });

  it('a failed reading: back at verified, the deck marked failed', () => {
    const app = toApplication(DECK_FAILED, account);
    expect(app.stage).toBe('verified');
    expect(app.deck!.status).toBe('failed');
  });

  it('review with open differences: deck fields under the portal\'s keys, funding as its label, two choices waiting', () => {
    const app = map('reviewOpen');
    expect(app.stage).toBe('review');
    expect(app.deck!.status).toBe('read');
    expect(app.deck!.fields.map((f) => f.key)).toEqual(['title', 'nace', 'share', 'name', 'name', 'nationality', 'email', 'phone', 'address', 'funding']);
    expect(app.deck!.fields.find((f) => f.key === 'funding')!.value).toBe('Yurt dışı banka transferi');
    const open = app.crossCheck.filter((c) => !c.match && !c.choice).map((c) => c.key).sort();
    expect(open).toEqual(['country', 'phone']);
    expect(app.crossCheck.find((c) => c.key === 'funding')).toMatchObject({ stated: 'Yurt dışı banka transferi', read: 'Yurt dışı banka transferi', match: true });
    expect(app.crossCheck.find((c) => c.key === 'country')).toMatchObject({ stated: 'Almanya', read: 'Torstraße 45, 10119 Berlin' });
    expect(app.company).toMatchObject({ deckName: 'Lumora Veri Analitiği', root: 'Lumora', activity: 'Veri Analitiği', nace: ['62.01', '63.11'] });
    expect(app.founder).toMatchObject({ firstName: 'Deneme', lastName: 'Kurucu', nationality: 'Almanya' });
    expect(app.contact).toEqual({ email: 'kurucu@example.test', phone: '+49 151 2345 6789', address: 'Torstraße 45, 10119 Berlin', postalCode: '', country: '' });
    expect(app.funding).toBe('own-abroad');
    expect(app.marks).toEqual({ title: 'ai', nace: 'ai', name: 'ai', email: 'ai', phone: 'ai', address: 'ai', funding: 'ai' });
  });

  it('review decided: the choices, the typed postal code and the stated country, and their marks', () => {
    const app = map('reviewDecided');
    expect(app.crossCheck.find((c) => c.key === 'phone')!.choice).toBe('read');
    expect(app.crossCheck.find((c) => c.key === 'country')!.choice).toBe('stated');
    expect(app.contact).toEqual({ email: 'kurucu@example.test', phone: '+49 151 2345 6789', address: 'Torstraße 45, 10119 Berlin', postalCode: '10119', country: 'Almanya' });
    expect(app.founder.lastName).toBe('Kurucu-Test');
    // "entered" (postal code, country chosen from the profile) and "edited" (family name) both show as edited.
    expect(app.marks).toMatchObject({ name: 'edited', address: 'edited', phone: 'ai' });
  });

  it('titleChecking: its own stage, the candidate without the suffix', () => {
    const app = map('titleChecking');
    expect(app.stage).toBe('titleChecking');
    expect(app.titleCheck).toEqual({ status: 'checking', candidate: 'Lumora Veri Analitiği' });
    expect(app.company).toMatchObject({ root: 'Lumora', activity: 'Veri Analitiği' });
    expect(toStage(CAPTURED.status.stage)).toBe('titleChecking');
  });

  it('titleConflict: the staff member\'s reason and the portal\'s own suggestions', () => {
    const app = map('titleConflict');
    expect(app.stage).toBe('titleConflict');
    expect(app.titleCheck).toEqual({
      status: 'conflict',
      candidate: 'Lumora Veri Analitiği',
      reason: 'Benzer bir unvan sicilde kayıtlıdır.',
      alternatives: ['Lumora Bulut Yazılım', 'Lumoranova Bilişim', 'Lumora Cloudline Teknoloji'],
    });
    // The review's trade name is still the one asked for.
    expect(app.company).toMatchObject({ root: 'Lumora', activity: 'Veri Analitiği' });
  });

  it('a new title: the company title is the one being checked, though the review keeps the old trade name', () => {
    const app = map('titleCheckingAgain');
    expect(app.stage).toBe('titleChecking');
    expect(CAPTURED.titleCheckingAgain.review.trade_name!.value).toBe('Lumora Veri Analitiği');
    expect(app.titleCheck).toEqual({ status: 'checking', candidate: 'Lumora Analitik Yazılım' });
    expect(app.company).toMatchObject({ root: 'Lumora', activity: 'Analitik Yazılım' });
  });

  it('the title reserved: on to the identity step with the reserved title', () => {
    const app = map('titleReserved');
    expect(app.stage).toBe('eligibility');
    expect(app.titleCheck).toEqual({ status: 'ok', candidate: 'Lumora Analitik Yazılım' });
    expect(app.company).toMatchObject({ root: 'Lumora', activity: 'Analitik Yazılım' });
  });

  it('the reference data: ten NACE codes, the sectors and funding keys the portal knows', () => {
    expect(CAPTURED.reference.naceCodes).toHaveLength(10);
    expect(CAPTURED.reference.sectors.map((s) => s.key)).toEqual(['software', 'ecommerce', 'consulting', 'design', 'education', 'other']);
    expect(CAPTURED.reference.funding.map((f) => f.key)).toEqual(['own-abroad', 'own-turkey', 'investor', 'third-party']);
  });

  it('review changes back to the API: only what differs, titles and NACE lists as single strings', () => {
    const view = CAPTURED.reviewOpen;
    expect(toReviewFields({ company: { root: 'Lumora', activity: 'Veri Analitiği' } }, view)).toEqual({});
    expect(toReviewFields({ company: { activity: 'Analitik Yazılım A.Ş.' } }, view)).toEqual({ trade_name: 'Lumora Analitik Yazılım' });
    expect(toReviewFields({ company: { nace: ['62.01', '63.11'] } }, view)).toEqual({});
    expect(toReviewFields({ company: { nace: ['62.01', '63.11', '62.02'] } }, view)).toEqual({ nace_codes: '62.01, 63.11, 62.02' });
    expect(
      toReviewFields(
        {
          founder: { firstName: 'Deneme', lastName: 'Kurucu ', nationality: 'Almanya' },
          contact: { email: 'kurucu@example.test', phone: '+49 151 2345 6789', address: 'Torstraße 45, 10119 Berlin', postalCode: '10119', country: 'Almanya' },
          funding: 'investor',
        },
        view,
      ),
    ).toEqual({ postal_code: '10119', residence_country: 'Almanya', source_of_funds: 'investor' });
    // A cleared value is sent, so the API's own message about it comes back.
    expect(toReviewFields({ contact: { phone: '' } }, view)).toEqual({ phone: '' });
    // The name shown from the account before the review has one is sent, to become the founder's own.
    expect(toReviewFields({ founder: { firstName: 'Deneme' } }, CAPTURED.scanning)).toEqual({ given_name: 'Deneme' });
  });
});

describe('api-mapper on captured API answers, step 2', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (key: keyof typeof CAPTURED, resultSeen = false) => toApplication(CAPTURED[key] as never, account, { resultSeen });

  it('before the check: the identity step with nothing started, no score, no result', () => {
    const app = map('titleReserved');
    expect(app.stage).toBe('eligibility');
    expect(app.eligibility).toEqual({ running: false });
  });

  it('a check started on the computer: running, started at the API\'s timeline line, not via the phone', () => {
    const app = map('identityRunning');
    const started = CAPTURED.identityRunning.logs.find((l) => l.text === LOG_TEXTS.identityStarted)!;
    expect(app.stage).toBe('eligibility');
    expect(app.eligibility).toEqual({ startedAt: started.at, consentAt: CAPTURED.identityRunning.eligibility!.consentAt, running: true });
  });

  it('a check started on the phone: the computer sees it running, via the phone', () => {
    const app = map('identityRunningPhone');
    const started = CAPTURED.identityRunningPhone.logs.find((l) => l.text === LOG_TEXTS.identityStartedByPhone)!;
    expect(app.eligibility).toMatchObject({ startedAt: started.at, via: 'phone', running: true });
  });

  it('a failed check: no check open, the error kept, nothing to animate', () => {
    const app = toApplication(IDENTITY_FAILED, account);
    expect(app.stage).toBe('eligibility');
    expect(app.eligibility).toEqual({ consentAt: IDENTITY_FAILED.eligibility!.consentAt, running: false, identityError: 'identity_failed' });
    expect(app.eligibility!.startedAt).toBeUndefined();
  });

  it('the second failure: manual review, without a result or a score', () => {
    const app = toApplication(IDENTITY_FAILED_TWICE, account);
    expect(app.stage).toBe('manual');
    expect(app.eligibility).toMatchObject({ running: false, identityError: 'identity_failed' });
    expect(app.eligibility!.result).toBeUndefined();
    expect(app.eligibility!.score).toBeUndefined();
  });

  it('declaration: the identity passed, nothing declared yet', () => {
    const app = map('declaration');
    expect(app.stage).toBe('declaration');
    expect(app.eligibility).toEqual({ consentAt: CAPTURED.declaration.eligibility!.consentAt, running: false });
  });

  it('a resident founder goes straight to the declaration, without a consent', () => {
    const app = toApplication(CAPTURED.residentDeclaration, { ...account, founderType: 'resident' });
    expect(app.stage).toBe('declaration');
    expect(app.founderType).toBe('resident');
    expect(app.eligibility).toEqual({ running: false });
  });

  it('screening: declared, the list search started at the declaration, the address proof in the documents', () => {
    const app = map('screening');
    const declaredAt = CAPTURED.screening.eligibility!.declaredAt!;
    expect(app.stage).toBe('screening');
    expect(app.eligibility).toMatchObject({ declaredAt, screeningStartedAt: declaredAt });
    expect(app.eligibility!.result).toBeUndefined();
    expect(app.docs.map((d) => d.name)).toEqual(['Sunum', 'Adres belgesi']);
    expect(app.docs[1].group).toBe('1 · Başvuru & Uygunluk');
  });

  it('a clear list search: the result screen once, then the payment', () => {
    const finished = CAPTURED.eligible.logs.find((l) => l.text === LOG_TEXTS.screeningDone)!;
    expect(CAPTURED.eligible.stage).toBe('payment');
    const app = map('eligible');
    expect(app.stage).toBe('eligible');
    expect(app.eligibility).toMatchObject({ result: 'eligible', finishedAt: finished.at });
    expect(app.eligibility!.score).toBeUndefined();
    expect(map('eligible', true).stage).toBe('payment');
    // Once a payment has been started the result screen is over, seen or not.
    const paying = { ...CAPTURED.eligible, payment: { ...CAPTURED.eligible.payment, status: '3ds_pending' } };
    expect(toApplication(paying, account).stage).toBe('payment');
  });

  it('manual review: the result manual and no reason of any kind', () => {
    const app = map('manual');
    expect(app.stage).toBe('manual');
    expect(app.eligibility).toMatchObject({ result: 'manual', running: false });
    // The view's eligibility has its seven fields and nothing that says why (the API keeps that from the founder).
    expect(Object.keys(CAPTURED.manual.eligibility!).sort()).toEqual(['consentAt', 'declaredAt', 'identityDone', 'identityError', 'result', 'running', 'screeningRunning']);
    expect(JSON.stringify({ ...CAPTURED.manual, titleCheck: null })).not.toMatch(/reason|risk|factor|case/i);
  });

  it('approved by staff: straight to the payment, without the result screen', () => {
    expect(map('reviewApproved').stage).toBe('payment');
    expect(map('reviewApproved').eligibility!.result).toBe('eligible');
  });

  it('the phone routes: states and times only', () => {
    expect(CAPTURED.phoneLink).toEqual({ token: '<token>', expiresInSeconds: 600 });
    expect(Object.keys(CAPTURED.phoneReady).sort()).toEqual(['expiresAt', 'startedAt', 'state']);
    expect(CAPTURED.phoneReady.state).toBe('ready');
    expect(CAPTURED.phoneRunning.state).toBe('running');
    expect(CAPTURED.phoneDone.state).toBe('done');
    expect(CAPTURED.closed).toMatchObject({ status: 404, code: 'no_application' });
  });
});
