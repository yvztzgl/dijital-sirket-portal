import { callStartedAt, LOG_TEXTS, splitNace, toAccount, toApplication, toReviewFields, toStage } from './api-mapper';
import { CAPTURED, IDENTITY_FAILED, IDENTITY_FAILED_TWICE, ME, NEW_APPLICATION, REVIEW_APPLICATION, SIGNATURE_EXPIRED } from './testing/api-fixtures';
import { AGENCIES } from './timeline';

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
    expect(app.company).toEqual({ brand: '', root: '', activity: '', nace: [], suggestedNace: [], capital: 250_000 });
    expect(app.profile).toBeUndefined();
    expect(app.deck).toBeUndefined();
    expect(app.cv).toBeUndefined();
    expect(app.evaluation).toBeUndefined();
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

  it('maps the company form: profile, deck and CV, the evaluation, the founder\'s current values and their marks', () => {
    const app = toApplication(REVIEW_APPLICATION, account);
    expect(app.stage).toBe('review');
    expect(app.profile).toEqual({ brand: 'Lumora', sector: 'software', funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya', at: '2026-11-25T09:45:00+00:00' });
    expect(app.deck).toEqual({ fileName: 'Lumora Sunum.pdf', sizeKb: 57 });
    expect(app.cv).toEqual({ fileName: 'Ozgecmis.pdf', sizeKb: 120 });
    expect(app.evaluation).toEqual({ status: 'done', attempt: 1, maxAttempts: 3, startedAt: '2026-11-25T09:46:00+00:00', finishedAt: '2026-11-25T09:50:00+00:00' });
    // The brand is the profile's; the suggested codes are those of the profile's activity area.
    expect(app.company).toMatchObject({ brand: 'Lumora', root: 'Lumora', activity: 'Veri Analitiği', nace: ['62.01', '63.11'], suggestedNace: ['62.01', '62.02', '63.11'] });
    expect(app.founder).toMatchObject({ firstName: 'Ayşe', lastName: 'Kaya-Berg', nationality: 'Almanya' });
    expect(app.contact).toEqual({ email: 'ayse@example.test', phone: '+49 151 2345 6700', address: '', postalCode: '10119', country: 'Almanya' });
    expect(app.funding).toBe('investor');
    // `entered` and `edited` both show as edited; a changed family name marks the whole name row.
    expect(app.marks).toEqual({ title: 'edited', nace: 'edited', name: 'edited', email: 'profile', phone: 'profile', address: 'edited', funding: 'edited' });
  });

  it('maps the stages the portal knows and refuses one it does not', () => {
    expect(toStage('threeDs')).toBe('threeDs');
    expect(toStage('titleConflict')).toBe('titleConflict');
    expect(toStage('titleChecking')).toBe('titleChecking');
    expect(toStage('evaluating')).toBe('evaluating');
    expect(toStage('evaluationQuestions')).toBe('evaluationQuestions');
    expect(() => toStage('scanning' as never)).toThrow('Unknown application stage');
    expect(() => toStage('archived' as never)).toThrow('Unknown application stage');
  });

  it('maps the trade-name check, payment and signature where they exist', () => {
    const app = toApplication(
      {
        ...REVIEW_APPLICATION,
        stage: 'signed',
        titleCheck: { status: 'conflict', candidate: 'Lumora Veri Analitiği', reason: 'Benzer unvan kayıtlı.' },
        payment: { ...REVIEW_APPLICATION.payment, status: 'captured', last4: '4242', paidAt: '2026-11-25T10:00:00+00:00' },
        signature: { kind: 'nes_daily', serial: 'ESHS-2611-AAAA', issuedAt: '2026-11-25T10:10:00+00:00', validUntil: '2026-11-26T10:10:00+00:00' },
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
    // The holder is the account's name (the API sends none), not the review's ("Kaya-Berg").
    expect(app.signature).toEqual({ method: 'eshs', serial: 'ESHS-2611-AAAA', holder: 'Ayşe Kaya', issuedAt: '2026-11-25T10:10:00+00:00', validUntil: '2026-11-26T10:10:00+00:00' });
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

  it('verified: no CV and no evaluation before the first upload', () => {
    const app = map('verified');
    expect(app.cv).toBeUndefined();
    expect(app.evaluation).toBeUndefined();
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
    const view = CAPTURED.reviewEdited;
    expect(toReviewFields({ company: { root: 'Lumora', activity: 'Analitik Yazılım' } }, view)).toEqual({});
    expect(toReviewFields({ company: { activity: 'Veri Analitiği A.Ş.' } }, view)).toEqual({ trade_name: 'Lumora Veri Analitiği' });
    expect(toReviewFields({ company: { nace: ['62.01', '63.11'] } }, view)).toEqual({});
    expect(toReviewFields({ company: { nace: ['62.01', '63.11', '62.02'] } }, view)).toEqual({ nace_codes: '62.01, 63.11, 62.02' });
    expect(
      toReviewFields(
        {
          founder: { firstName: 'Deneme', lastName: 'Kurucu-Berg ', nationality: 'Almanya' },
          contact: { email: 'kurucu@example.test', phone: '+49 151 2345 6700', address: 'Torstraße 45, Berlin', postalCode: '10115', country: 'Almanya' },
          funding: 'investor',
        },
        view,
      ),
    ).toEqual({ postal_code: '10115', source_of_funds: 'investor' });
    // A cleared value is sent, so the API's own message about it comes back.
    expect(toReviewFields({ contact: { phone: '' } }, view)).toEqual({ phone: '' });
    // The name shown from the account before the review has one is sent, to become the founder's own.
    expect(toReviewFields({ founder: { firstName: 'Deneme' } }, CAPTURED.evaluating)).toEqual({ given_name: 'Deneme' });
  });
});

/** The deck step with the outside evaluation, on the answers captured from the API's stand-in evaluator. */
describe('api-mapper on the evaluation answers (captured)', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });

  it('evaluating: the deck and the CV by name and size, the evaluation running, no form values', () => {
    const app = toApplication(CAPTURED.evaluating, account);
    expect(app.stage).toBe('evaluating');
    expect(app.deck).toEqual({ fileName: 'Lumora Sunum.pdf', sizeKb: 1 });
    expect(app.cv).toEqual({ fileName: 'Ozgecmis.pdf', sizeKb: 1 });
    expect(app.evaluation).toMatchObject({ status: 'queued', attempt: 1, maxAttempts: 3, finishedAt: null });
    expect(app.marks).toEqual({});
    expect(app.docs.map((d) => d.name)).toEqual(['Sunum', 'Özgeçmiş']);
    expect(toStage(CAPTURED.statusEvaluating.stage)).toBe('evaluating');
  });

  it('more information needed: its own stage, the evaluation waiting on questions', () => {
    const app = toApplication(CAPTURED.evaluationQuestions, account);
    expect(app.stage).toBe('evaluationQuestions');
    expect(app.evaluation!.status).toBe('questions');
  });

  it('a failed evaluation: back at the upload, the evaluation kept as failed', () => {
    const app = toApplication(CAPTURED.evaluationFailed, account);
    expect(app.stage).toBe('verified');
    expect(app.evaluation).toMatchObject({ status: 'failed', attempt: 3 });
    expect(() => toApplication({ ...CAPTURED.evaluationFailed, evaluation: { ...CAPTURED.evaluationFailed.evaluation!, status: 'lost' as never } }, account)).toThrow('Unknown evaluation status');
  });

  it('the company form: defaults from the profile and the account marked profile; an empty title and codes carry no mark', () => {
    const app = toApplication(CAPTURED.reviewDefaults, account);
    expect(app.stage).toBe('review');
    expect(app.company).toMatchObject({ brand: 'Lumora', root: '', activity: '', nace: [] });
    expect(app.founder).toMatchObject({ firstName: 'Deneme', lastName: 'Kurucu', nationality: 'Almanya' });
    expect(app.contact).toEqual({ email: 'kurucu@example.test', phone: '+49 151 2345 6700', address: '', postalCode: '', country: 'Almanya' });
    expect(app.funding).toBe('own-abroad');
    expect(app.marks).toEqual({ name: 'profile', email: 'profile', phone: 'profile', address: 'profile', funding: 'profile' });
    // Since 2026-11-26 the API proposes the title and the codes from the profile, marked `profile` like the other defaults.
    const proposed = toApplication({ ...CAPTURED.reviewDefaults, review: { ...CAPTURED.reviewDefaults.review,
      trade_name: { label: 'Şirket unvanı', value: 'Lumora Anonim Şirketi', mark: 'profile' },
      nace_codes: { label: 'NACE kodları', value: '62.01, 62.02, 63.11', mark: 'profile' } } }, account);
    expect([proposed.company.root, proposed.company.nace, proposed.marks['title'], proposed.marks['nace']]).toEqual(['Lumora', ['62.01', '62.02', '63.11'], 'profile', 'profile']);
  });

  it('the company form after the founder typed: entered and edited are the founder\'s own', () => {
    const app = toApplication(CAPTURED.reviewEdited, account);
    expect(app.company).toMatchObject({ root: 'Lumora', activity: 'Analitik Yazılım', nace: ['62.01', '63.11'] });
    expect(app.marks).toEqual({ title: 'edited', nace: 'edited', name: 'edited', email: 'profile', phone: 'profile', address: 'edited', funding: 'profile' });
  });

  it('the evaluation reference: the saved dictionary in the contract\'s shape', () => {
    const r = CAPTURED.referenceEvaluation;
    expect([r.activityGroups.length, r.activities.length, r.businessModels.length, r.revenueModels.length, r.productTypes.length]).toEqual([17, 216, 4, 8, 4]);
    expect(r.limits).toEqual({ deckMaxMb: 25, cvMaxMb: 5, deckMinPages: 3, deckMaxPages: 40, summaryMin: 50, summaryMax: 2000 });
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
    expect(app.docs.map((d) => d.name)).toEqual(['Sunum', 'Özgeçmiş', 'Adres belgesi']);
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
    const paying = { ...CAPTURED.eligible, payment: { ...CAPTURED.eligible.payment, status: '3ds_pending' as const } };
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

describe('api-mapper on captured API answers, step 3', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (key: keyof typeof CAPTURED, options = {}) => toApplication(CAPTURED[key] as never, account, options);
  const FEE_LINES = [
    { code: 'tescil_ilan_harci', label: 'Ticaret sicili tescil ve ilan harçları', amount: 4850 },
    { code: 'noter_eimza', label: 'Noter onayı ve e-İmza (ESHS)', amount: 2400 },
    { code: 'sanal_ofis_yil1', label: 'Sanal ofis · ilk yıl', amount: 3600 },
    { code: 'platform', label: 'Platform hizmet bedeli', amount: 1900 },
  ];

  it('before any payment: the result screen once, then the payment form; fees from the API in TL', () => {
    expect(map('paymentOpen').stage).toBe('eligible');
    const app = map('paymentOpen', { resultSeen: true });
    expect(app.stage).toBe('payment');
    expect(app.payment).toBeUndefined();
    expect(app.fees).toEqual(FEE_LINES);
  });

  it('3-D Secure open: stage threeDs, the amount in TL, no card unless this page typed one', () => {
    const app = map('payment3dsPending');
    expect(app.stage).toBe('threeDs');
    expect(app.payment).toEqual({ holder: '', last4: '', amount: 12_750 });
    expect(map('payment3dsPending', { card: { holder: 'DENEME KURUCU', last4: '4242' } }).payment).toEqual({ holder: 'DENEME KURUCU', last4: '4242', amount: 12_750 });
  });

  it('cancelled: back at the payment form with no payment, and the result screen does not come back', () => {
    const app = map('paymentCancelled');
    expect(CAPTURED.paymentCancelled.payment.status).toBe('failed');
    expect(app.stage).toBe('payment');
    expect(app.payment).toBeUndefined();
  });

  it('captured: on to the e-signature with the payment time', () => {
    const app = map('paymentCaptured');
    expect(app.stage).toBe('signing');
    expect(app.payment).toEqual({ holder: '', last4: '', amount: 12_750, paidAt: CAPTURED.paymentCaptured.payment.paidAt });
    expect(app.logs.some((l) => l.text === 'Ödeme alındı · 12.750 TL')).toBe(true);
  });

  it('the refusals the payment screens show, as the API words them', () => {
    expect(CAPTURED.stepUpRequired).toMatchObject({ status: 403, code: 'step_up_required', title: 'Bu işlem için e-posta adresinize gönderilen kodu girmeniz gerekir.' });
    expect(CAPTURED.stepUpWrongCode).toMatchObject({ status: 400, code: 'validation_failed', errors: { code: ['Kod hatalı veya süresi dolmuş.'] } });
    expect(CAPTURED.cardDeclined).toMatchObject({ status: 422, code: 'card_declined', title: 'Kartınızdan ödeme alınamadı. Lütfen başka bir kart deneyiniz.' });
    expect(CAPTURED.threeDsWrongCode).toMatchObject({ status: 422, code: '3ds_failed', title: 'Doğrulama kodu hatalı.' });
  });
});

describe('api-mapper on captured API answers, steps 4 and 5', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const resident = { ...account, founderType: 'resident' as const };
  const map = (key: keyof typeof CAPTURED, options = {}, who = account) => toApplication(CAPTURED[key] as never, who, options);

  it('signing: the consent is the server\'s, there is no call and no certificate', () => {
    expect(map('esignSigning')).toMatchObject({ stage: 'signing', callConsentAt: undefined, call: undefined, signature: undefined, setup: undefined });
    expect(map('esignConsent').callConsentAt).toBe(CAPTURED.esignConsent.callConsentAt);
    expect(CAPTURED.esignConsentMissing).toMatchObject({ status: 409, code: 'consent_missing', title: 'Görüşme başlamadan önce ön bilgilendirmeyi onaylayınız.' });
  });

  it('a call open: calling, its start from the timeline; hung up: signing again', () => {
    const open = map('esignCallOpen');
    const started = CAPTURED.esignCallOpen.logs.filter((l) => l.text === LOG_TEXTS.callStarted).at(-1)!.at;
    expect(open.stage).toBe('calling');
    expect(open.call).toEqual({ startedAt: started });
    expect(callStartedAt(CAPTURED.esignCallOpen)).toBe(started);
    const ended = map('esignCallEnded');
    expect(ended.stage).toBe('signing');
    expect(ended.call).toBeUndefined();
    expect(ended.logs.some((l) => l.text === 'Görüşme tamamlanmadan sonlandırıldı')).toBe(true);
    expect(CAPTURED.esignNoOpenCall).toMatchObject({ status: 409, code: 'no_open_call', title: 'Açık bir görüşme yok.' });
  });

  it('after the call was completed the API still says calling; only what HttpApi remembers tells it is issuing', () => {
    const started = callStartedAt(CAPTURED.esignIssuing)!;
    expect(CAPTURED.esignIssuing.stage).toBe('calling');
    expect(map('esignIssuing').call).toEqual({ startedAt: started });
    expect(map('esignIssuing', { callCompleted: started }).call).toEqual({ startedAt: started, completed: true });
    // A remembered earlier call does not mark a new one.
    expect(map('esignIssuing', { callCompleted: '2026-01-01T00:00:00+00:00' }).call!.completed).toBeUndefined();
  });

  it('signed: the certificate as the API sent it, the holder from the account, nes_daily as the call\'s method', () => {
    const app = map('esignSigned');
    const s = CAPTURED.esignSigned.signature!;
    expect(app.stage).toBe('signed');
    expect(app.signature).toEqual({ method: 'eshs', serial: s.serial, holder: 'Deneme Kurucu', issuedAt: s.issuedAt, validUntil: s.validUntil });
    expect(Date.parse(s.validUntil) - Date.parse(s.issuedAt)).toBe(24 * 3600_000);
  });

  it('an expired certificate: the API is back at signing and the view still names it', () => {
    const app = toApplication(SIGNATURE_EXPIRED, account);
    expect(app.stage).toBe('signing');
    expect(Date.parse(app.signature!.validUntil)).toBeLessThan(Date.now());
  });

  it('set-up started: steps null until the Worker creates them, the start time from the timeline', () => {
    const app = map('setupStarted');
    expect(app.stage).toBe('setup');
    expect(CAPTURED.setupStarted.setup).toBeNull();
    expect(app.setup).toEqual({
      startedAt: CAPTURED.setupStarted.logs.find((l) => l.text === 'Kuruluş başlatıldı')!.at,
      signConsentAt: CAPTURED.setupStarted.logs.find((l) => l.text === 'Kuruluş belgelerinin e-imza ile imzalanması onaylandı')!.at,
      steps: null,
    });
    expect(app.results).toBeUndefined();
    expect(CAPTURED.statusSetup.stage).toBe('setup');
  });

  it('the nine server steps line up with the portal\'s nine agencies, by number and title', () => {
    const steps = map('setupSteps').setup!.steps!;
    expect(steps.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Eight titles are word for word the portal's; the ninth differs in wording only.
    expect(steps.map((s) => s.title).slice(0, 8)).toEqual(AGENCIES.slice(0, 8).map((a) => a.t));
    expect([steps[8].title, AGENCIES[8].t]).toEqual(['Mali Müşavir Eşleştirme', 'Müşavir Yönlendirme']);
    expect(steps.map((s) => s.status)).toEqual(['completed', 'completed', 'completed', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending']);
    // The first institution task is already with the institution while its step still says pending.
    expect(steps[3].tasks).toEqual([{ code: 'registration.submit', title: 'Ticaret sicili tescil edildi', status: 'waiting' }]);
    expect(steps[4].tasks.map((t) => t.status)).toEqual(['pending', 'exempt']);
  });

  it('results as they arrive, under the portal\'s names; nothing the API did not send', () => {
    const app = map('setupResults');
    expect(app.stage).toBe('setup');
    const r = CAPTURED.setupResults.results!;
    expect(app.results).toEqual({ mersis: r['mersis_no'], registryNo: r['tescil_no'] });
    expect(app.setup!.steps![3].status).toBe('completed');
  });

  it('done: every step completed, the identifiers, no advisor, the finishing time from the timeline', () => {
    const app = map('setupDone');
    const r = CAPTURED.setupDone.results!;
    expect(app.stage).toBe('done');
    expect(app.results).toEqual({
      vkn: r['vkn'],
      taxOffice: r['vergi_dairesi'],
      mersis: r['mersis_no'],
      registryNo: r['tescil_no'],
      iban: r['iban'],
      eInvoiceNo: r['e_fatura_no'],
      sgkNo: r['sgk_isyeri_no'],
    });
    expect(app.results!.advisor).toBeUndefined();
    expect(app.setup!.steps!.every((s) => s.status === 'completed')).toBe(true);
    expect(app.setup!.finishedAt).toBe(CAPTURED.setupDone.logs.find((l) => l.text === 'Şirketiniz kuruldu')!.at);
    expect(CAPTURED.statusDone.stage).toBe('done');
  });

  it('documents: exactly the API\'s list, by readable Turkish names', () => {
    expect(map('setupDone').docs.map((d) => [d.group, d.name])).toEqual([
      ['1 · Başvuru & Uygunluk', 'Sunum'],
      ['1 · Başvuru & Uygunluk', 'Adres belgesi'],
    ]);
    const other = toApplication({ ...CAPTURED.setupDone, documents: [{ id: 'x', type: 'vergi_levhasi', sizeKb: 3, at: 't' }, { id: 'y', type: 'yeni_tur', sizeKb: 1, at: 't' }] }, account);
    expect(other.docs.map((d) => [d.group, d.name])).toEqual([['5 · Vergi', 'Vergi levhası'], ['Diğer belgeler', 'yeni_tur']]);
  });

  it('a resident: calling while the provider verifies, with no call; nes_existing as "existing"', () => {
    expect(map('residentSigning', {}, resident).stage).toBe('signing');
    const issuing = map('residentIssuing', {}, resident);
    expect(issuing.stage).toBe('calling');
    expect(issuing.founderType).toBe('resident');
    expect(issuing.call).toBeUndefined();
    const signed = map('residentSigned', {}, resident);
    expect(signed.signature).toMatchObject({ method: 'existing', serial: CAPTURED.residentSigned.signature!.serial, holder: 'Deneme Kurucu' });
    expect(map('residentSetupSteps', {}, resident).setup!.steps!).toHaveLength(9);
  });

  it('no T.C. kimlik no and no real address in the captured files', () => {
    const all = JSON.stringify([CAPTURED.residentSigning, CAPTURED.residentIssuing, CAPTURED.residentSigned, CAPTURED.residentSetupSteps]);
    expect(all).not.toMatch(/\b\d{11}\b/);
    expect(all).not.toContain('edevlet.test');
  });
});
