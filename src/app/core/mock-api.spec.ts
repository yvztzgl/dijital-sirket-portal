import { TestBed } from '@angular/core/testing';
import { DemoSettings } from './demo-settings';
import { Inbox } from './inbox';
import {
  alternativesFor,
  ApiError,
  DEMO_ACCOUNT,
  DEMO_ANSWERS,
  demoFile,
  luhn,
  MockApi,
  passwordStrength,
  sameStem,
  validateCard,
  validTckn,
} from './mock-api';
import { FEE_TOTAL } from './models';
import { DECK_CONSENT_ERROR, evaluationErrors } from './rules';
import EVALUATION_REFERENCE from './evaluation-reference.json';
import { setupEvents, setupView } from './timeline';

describe('business rules', () => {
  it('validates card numbers with Luhn', () => {
    expect(luhn('4242 4242 4242 4242')).toBe(true);
    expect(luhn('4242 4242 4242 4241')).toBe(false);
  });

  it('validates the whole card', () => {
    const now = new Date('2026-11-05');
    const ok = { holder: 'AYSE KAYA', number: '4242424242424242', expiry: '12/30', cvv: '123' };
    expect(validateCard(ok, now)).toBeNull();
    expect(validateCard({ ...ok, expiry: '10/26' }, now)).toContain('geçmiş');
    expect(validateCard({ ...ok, expiry: '13/30' }, now)).toContain('AA/YY');
    expect(validateCard({ ...ok, cvv: '12' }, now)).toContain('CVV');
    expect(validateCard({ ...ok, holder: '' }, now)).toContain('adı');
  });

  it('checks T.C. kimlik numbers', () => {
    expect(validTckn('10000000146')).toBe(true);
    expect(validTckn('10000000147')).toBe(false);
    expect(validTckn('01234567890')).toBe(false);
  });

  it('flags titles that collide in MERSİS but allows different activities', () => {
    expect(sameStem('Acme Bulut Bilişim', 'Acme Bulut Bilişim Hizmetleri A.Ş.')).toBe(true);
    expect(sameStem('Acme Bulut Yazılım', 'Acme Bulut Bilişim Hizmetleri A.Ş.')).toBe(false);
    expect(alternativesFor('Acme', 'Acme Bulut Bilişim')).toContain('Acme Bulut Yazılım');
  });

  it('scores password strength', () => {
    expect(passwordStrength('short').ok).toBe(false);
    expect(passwordStrength('Nova-Lab-2026!').ok).toBe(true);
  });

  it('fees add up to the advertised total', () => {
    expect(FEE_TOTAL).toBe(12_750);
  });
});

describe('setup timeline', () => {
  it('finishes all 34 sub-steps and produces the 13 remaining documents', () => {
    expect(setupView(1).done).toBe(34);
    expect(setupView(0).agency).toBe(3); // first three agencies are done before setup starts
    const app = { setup: { startedAt: new Date().toISOString() } } as never;
    expect(setupEvents(app, 1).docs.length).toBe(13);
    expect(setupEvents(app, 0).docs.length).toBe(0);
  });
});

describe('MockApi flow', () => {
  let api: MockApi;
  let inbox: Inbox;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    TestBed.inject(DemoSettings).set({ speed: 1000, evaluationOutcome: 'done', forceConflict: false, forceManual: false });
    api = TestBed.inject(MockApi);
    inbox = TestBed.inject(Inbox);
  });

  const lastCode = () => inbox.messages()[0].code!;

  /** Both ticks of D-1a, as the founder gives them. */
  const CONSENTS = { noticeAcknowledged: true, aiConsent: true };
  /** The deck and the CV; the mock reads only names and sizes (and the pages, when there are bytes). */
  const FILES = () => ({ deck: demoFile('novalab-deck.pdf', 1000), cv: demoFile('cv.pdf', 1000) });

  /** At the deck upload: uploads, lets the evaluation end well and types the title and a code, ready to submit. */
  async function atReview(title = 'Novalab Bulut Yazılım') {
    await api.uploadDeck(FILES(), DEMO_ANSWERS, CONSENTS);
    await api.completeEvaluation();
    const [root, ...rest] = title.split(' ');
    return api.updateReview({ company: { root, activity: rest.join(' '), nace: ['62.01'] } }, ['title', 'nace']);
  }
  /** The statement on D-1e that agrees with the generic demo deck for a foreign founder. */
  const PROFILE = { brand: 'Novalab', sector: 'software', funding: 'own-abroad', nationality: 'Birleşik Krallık', phone: '+44 7700 900123', country: 'Birleşik Krallık' } as const;

  /** Registers, verifies the e-mail and fills in the profile, so the founder is at the deck upload (D-1a). */
  async function verifiedFounder(email = 'ayse@novalab.io', brand = 'Novalab') {
    await api.register({ firstName: 'Ayşe', lastName: 'Kaya', email, password: 'Nova-Lab-2026!' });
    await expect(api.uploadDeck(FILES(), DEMO_ANSWERS, CONSENTS)).rejects.toThrow('bulunamadı');
    await expect(api.verifyEmail(email, '000000')).rejects.toBeInstanceOf(ApiError);
    const { app } = await api.verifyEmail(email, lastCode());
    expect(app!.stage).toBe('profile');
    return api.submitProfile({ ...PROFILE, brand });
  }

  it('registers, verifies by e-mail code and creates an application', async () => {
    const app = await verifiedFounder();
    expect(app.stage).toBe('verified');
    expect(app.founder.firstName).toBe('Ayşe');
    expect(app.id).toMatch(/^DS-\d{2}-\d{4}$/);
    await expect(api.register({ firstName: 'X', lastName: 'Y', email: 'AYSE@novalab.io', password: 'x' })).rejects.toThrow('zaten');
  });

  it('hits a MERSİS conflict for an existing title', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email, 'Acme Cloud');
    await atReview('Acme Bulut Bilişim');
    let app = await api.submitReview();
    // The title waits for its answer, as on the API; the simulated check gives it.
    expect(app.stage).toBe('titleChecking');
    expect(app.titleCheck).toMatchObject({ status: 'checking', candidate: 'Acme Bulut Bilişim' });
    expect(app.titleCheck!.requestedAt).toBeTruthy();
    await expect(api.chooseTitle('Acme Bulut Yazılım')).rejects.toThrow('şu anki adımında');
    app = await api.completeTitleCheck();
    expect(app.stage).toBe('titleConflict');
    expect(app.titleCheck!.conflictWith).toBe('Acme Bulut Bilişim Hizmetleri A.Ş.');
    expect(app.titleCheck!.alternatives).toContain('Acme Bulut Yazılım');
    app = await api.chooseTitle('Acme Bulut Yazılım A.Ş.');
    expect(app.stage).toBe('titleChecking');
    expect(app.company.activity).toBe('Bulut Yazılım');
    app = await api.completeTitleCheck();
    expect(app.stage).toBe('eligibility');
    expect(app.titleCheck).toEqual({ status: 'ok', candidate: 'Acme Bulut Yazılım' });
  });

  it('hands the identity check to a phone through a short-lived link', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await atReview();
    await api.submitReview();
    await api.completeTitleCheck();
    expect(await api.phoneLinkStatus('nope')).toEqual({ state: 'invalid' });

    let app = await api.createPhoneLink();
    const first = app.phoneLink!.token;
    expect(first.length).toBeGreaterThanOrEqual(22);
    expect((await api.phoneLinkStatus(first)).state).toBe('ready');
    // A new code replaces the old one.
    app = await api.createPhoneLink();
    const token = app.phoneLink!.token;
    expect(token).not.toBe(first);
    expect(await api.phoneLinkStatus(first)).toEqual({ state: 'invalid' });

    await expect(api.startEligibilityByPhone('nope', true)).rejects.toThrow('geçersiz');
    await expect(api.startEligibilityByPhone(token, false)).rejects.toThrow('açık rıza');
    const running = await api.startEligibilityByPhone(token, true);
    expect(running.state).toBe('running');
    app = (await api.login(email, 'Nova-Lab-2026!')).app!;
    expect(app.eligibility!.via).toBe('phone');
    expect(app.phoneLink!.usedAt).toBe(app.eligibility!.startedAt);
    expect(app.logs.at(-1)!.text).toContain('telefondan');
    // The status tells the phone nothing about the founder.
    expect(Object.keys(running).sort()).toEqual(['startedAt', 'state']);
    await expect(api.createPhoneLink()).rejects.toThrow('zaten');

    // The phone does the camera check only; the declaration is made on the computer.
    expect(await api.completeIdentityByPhone(token)).toEqual({ state: 'done' });
    expect((await api.login(email, 'Nova-Lab-2026!')).app!.stage).toBe('declaration');
  });

  it('lets a phone link run out, and cancels it when the check starts on the computer', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await atReview();
    await api.submitReview();
    await api.completeTitleCheck();
    let app = await api.createPhoneLink();
    const token = app.phoneLink!.token;
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60_000;
    try {
      expect(await api.phoneLinkStatus(token)).toEqual({ state: 'expired' });
      await expect(api.startEligibilityByPhone(token, true)).rejects.toThrow('süresi dolmuştur');
    } finally {
      Date.now = realNow;
    }
    app = await api.startEligibility(true);
    expect(app.phoneLink).toBeUndefined();
    expect(await api.phoneLinkStatus(token)).toEqual({ state: 'invalid' });
  });

  it('asks for consent before the video call can start', async () => {
    const { account } = await api.seed('signing');
    await expect(api.startCall()).rejects.toThrow('ön bilgilendirmeyi');
    await expect(api.acceptCallTerms(false)).rejects.toThrow('onay metnini');
    let app = await api.acceptCallTerms(true);
    expect(app.callConsentAt).toBeTruthy();
    expect(app.logs.at(-1)!.who).toBe('u');
    app = await api.startCall();
    expect(app.stage).toBe('calling');
    // A call that was ended does not ask again.
    app = await api.endCall();
    expect(app.callConsentAt).toBeTruthy();
    expect((await api.startCall()).stage).toBe('calling');
  });

  it('sends third-party funding to manual review, and runs payment with 3-D Secure', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await atReview();
    await api.updateReview({ funding: 'third-party' }, ['funding']);
    await api.submitReview();
    let app = await api.completeTitleCheck();
    expect(app.stage).toBe('eligibility');
    // The identity check waits for the founder: nothing runs before "Doğrulamayı başlat".
    expect(app.eligibility).toBeUndefined();
    await expect(api.completeIdentity()).rejects.toThrow('başlatılmamıştır');
    await expect(api.startEligibility(false)).rejects.toThrow('açık rıza');
    app = await api.startEligibility(true);
    expect(app.eligibility!.result).toBe('manual');
    expect(app.eligibility!.consentAt).toBe(app.eligibility!.startedAt);
    expect(app.logs.slice(-2).map((l) => l.who)).toEqual(['u', 'u']);
    expect(app.logs.at(-2)!.text).toContain('Açık rıza');
    const startedAt = app.eligibility!.startedAt;
    app = await api.startEligibility(true);
    expect(app.eligibility!.startedAt).toBe(startedAt);
    // Three stages, three screens: camera check, then the founder's declaration, then the list search.
    app = await api.completeIdentity();
    expect(app.stage).toBe('declaration');
    expect(app.eligibility!.identityDoneAt).toBeTruthy();
    const pdf = { name: 'fatura.pdf', size: 300_000 };
    await expect(api.submitDeclaration({ file: null, declared: true })).rejects.toThrow('yükleyiniz');
    await expect(api.submitDeclaration({ file: { name: 'fatura.docx', size: 1 }, declared: true })).rejects.toThrow('PDF, JPG veya PNG');
    await expect(api.submitDeclaration({ file: { name: 'fatura.pdf', size: 11 * 1024 * 1024 }, declared: true })).rejects.toThrow('10 MB');
    await expect(api.submitDeclaration({ file: pdf, declared: false })).rejects.toThrow('beyanı onaylayınız');
    app = await api.submitDeclaration({ file: pdf, declared: true });
    expect(app.stage).toBe('screening');
    expect(app.eligibility!.address!.fileName).toBe('fatura.pdf');
    expect(app.eligibility!.declaredAt).toBe(app.eligibility!.screeningStartedAt);
    expect(app.logs.slice(-2).map((l) => l.who)).toEqual(['u', 'u']);
    expect(app.docs.length).toBe(0);
    app = await api.completeScreening();
    expect(app.stage).toBe('manual');
    expect(app.docs.length).toBe(3);
    await api.proceedToPayment();
    await expect(api.pay({ holder: 'AYSE KAYA', number: '4242 4242 4242 4241', expiry: '12/30', cvv: '123' })).rejects.toThrow('geçersiz');
    app = await api.pay({ holder: 'Ayse Kaya', number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' });
    expect(app.stage).toBe('threeDs');
    await expect(api.confirm3ds('000000')).rejects.toThrow('hatalı');
    app = await api.confirm3ds(inbox.messages()[0].code!);
    expect(app.stage).toBe('signing');
    expect(app.payment!.paidAt).toBeTruthy();
  });

  it('e-Devlet registers a T.C. citizen on first use and signs them in afterwards', async () => {
    await expect(api.edevlet('10000000147')).rejects.toThrow('doğrulanamadı');
    const first = await api.edevlet('10000000146');
    expect(first.created).toBe(true);
    expect(first.account.firstName).toBe('Mehmet');
    expect(first.account.founderType).toBe('resident');
    expect(first.app.stage).toBe('profile');
    const again = await api.edevlet('10000000146');
    expect(again.created).toBe(false);
    expect(again.app.id).toBe(first.app.id);
  });

  it('starts the formation only after the founder confirmed the signing', async () => {
    const { account } = await api.seed('signed');
    await expect(api.startSetup(false)).rejects.toThrow('imzalanmasını onaylayınız');
    const app = await api.startSetup(true);
    expect(app.stage).toBe('setup');
    expect(app.setup!.signConsentAt).toBe(app.setup!.startedAt);
    expect(app.logs.slice(-2).map((l) => l.text)).toEqual(['Kuruluş belgelerinin e-imza ile imzalanması onaylandı', 'Kuruluş başlatıldı']);
    // T.C. citizens choose their e-signature first and then confirm on the same screen.
    const resident = await api.seed('signing', 'resident');
    expect((await api.signResident('existing')).stage).toBe('signed');
  });

  it('refuses actions that do not belong to the current stage', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await expect(api.startSetup(true)).rejects.toThrow('adımında');
  });

  // ------------------------------------- profile, deck and the outside evaluation (2026-11-25)

  it('checks the profile with the API’s rules and messages', async () => {
    const email = 'ayse@novalab.io';
    await api.register({ firstName: 'Ayşe', lastName: 'Kaya', email, password: 'Nova-Lab-2026!' });
    await api.verifyEmail(email, lastCode());
    const refused = (patch: Record<string, string>, message: string) =>
      expect(api.submitProfile({ ...PROFILE, ...patch } as typeof PROFILE)).rejects.toThrow(message);
    await refused({ brand: ' A ' }, 'Şirketinizin veya markanızın adını yazınız.');
    await refused({ brand: 'x'.repeat(121) }, 'Şirketinizin veya markanızın adını yazınız.');
    await refused({ sector: 'mining' }, 'Faaliyet alanını seçiniz.');
    await refused({ funding: 'gift' }, 'Sermaye kaynağını seçiniz.');
    await refused({ nationality: ' ' }, 'Uyruğunuzu seçiniz.');
    await refused({ nationality: 'x'.repeat(61) }, 'Uyruğunuzu seçiniz.');
    await refused({ country: '' }, 'Yaşadığınız ülkeyi seçiniz.');
    await refused({ country: 'x'.repeat(61) }, 'Yaşadığınız ülkeyi seçiniz.');
    await refused({ phone: '+44 7700 9' }, 'Telefon numaranızı eksiksiz yazınız.');
    await refused({ phone: '+44 7700 9001 2345 678' }, 'Telefon numaranızı eksiksiz yazınız.');
    // Repeated spaces collapse before the length is counted, as on the API.
    const app = await api.submitProfile({ ...PROFILE, brand: '  Nova    Lab ' });
    expect(app.stage).toBe('verified');
    expect(app.profile).toMatchObject({ ...PROFILE, brand: 'Nova Lab' });
    expect(app.profile!.at).toBeTruthy();
    expect(app.logs.at(-1)).toMatchObject({ text: 'Ön bilgiler kaydedildi', who: 'u' });
  });

  it('asks for the profile before the deck, and takes a new profile only until the deck is uploaded', async () => {
    const email = 'ayse@novalab.io';
    await api.register({ firstName: 'Ayşe', lastName: 'Kaya', email, password: 'Nova-Lab-2026!' });
    const { app: created } = await api.verifyEmail(email, lastCode());
    expect(created!.stage).toBe('profile');
    await expect(api.uploadDeck(FILES(), DEMO_ANSWERS, CONSENTS)).rejects.toThrow('Önce ön bilgileri doldurunuz.');
    let app = await api.submitProfile(PROFILE);
    expect(app.stage).toBe('verified');
    // Saved again from D-1a's "Ön bilgileri düzenle": the new statement replaces the old one.
    app = await api.submitProfile({ ...PROFILE, brand: 'Novalab Labs' });
    expect(app.stage).toBe('verified');
    expect(app.profile!.brand).toBe('Novalab Labs');
    expect(app.logs.at(-1)!.text).toBe('Ön bilgiler güncellendi');
    await api.uploadDeck(FILES(), DEMO_ANSWERS, CONSENTS);
    await expect(api.submitProfile(PROFILE)).rejects.toThrow('adımında');
  });

  it('walks upload → evaluating → the company form with defaults from the profile and the account', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    let app = await api.uploadDeck(FILES(), DEMO_ANSWERS, CONSENTS);
    expect(app.stage).toBe('evaluating');
    expect(app.deck).toEqual({ fileName: 'novalab-deck.pdf', sizeKb: 1 });
    expect(app.cv).toEqual({ fileName: 'cv.pdf', sizeKb: 1 });
    expect(app.evaluation).toMatchObject({ status: 'running', attempt: 1, maxAttempts: 3, finishedAt: null });
    // The consent acts are the founder's own lines in the log.
    expect(app.logs.slice(-4).map((l) => l.who)).toEqual(['u', 'u', 'u', 's']);
    await expect(api.uploadDeck(FILES(), DEMO_ANSWERS, CONSENTS)).rejects.toThrow('adımında');
    await expect(api.submitReview()).rejects.toThrow('adımında');
    app = await api.completeEvaluation();
    expect(app.stage).toBe('review');
    expect(app.evaluation).toMatchObject({ status: 'done' });
    // Title and codes proposed from the profile (brand + "Anonim Şirketi", the sector's codes), marked like the API's defaults.
    expect(app.company).toMatchObject({ brand: 'Novalab', root: 'Novalab', activity: '', nace: ['62.01', '62.02', '63.11'], suggestedNace: ['62.01', '62.02', '63.11'] });
    expect(app.founder).toMatchObject({ firstName: 'Ayşe', lastName: 'Kaya', nationality: PROFILE.nationality });
    expect(app.contact).toEqual({ email, phone: PROFILE.phone, address: '', postalCode: '', country: PROFILE.country });
    expect(app.marks).toEqual({ title: 'profile', nace: 'profile', name: 'profile', email: 'profile', phone: 'profile', address: 'profile', funding: 'profile' });
    app = await api.updateReview({ company: { root: 'Novalab', activity: 'Yazılım' }, contact: { phone: '+44 7700 900999' } }, ['title', 'phone']);
    expect(app.marks).toMatchObject({ title: 'edited', phone: 'edited', email: 'profile', nace: 'profile' });
    await api.updateReview({ company: { root: '', activity: '' } }, ['title']);
    await expect(api.submitReview()).rejects.toThrow('Şirket unvanını yazınız.');
    await api.updateReview({ company: { root: 'Novalab', activity: 'Yazılım', nace: [] } }, ['title', 'nace']);
    await expect(api.submitReview()).rejects.toThrow('NACE');
    await api.updateReview({ company: { nace: ['62.01'] } }, ['nace']);
    expect((await api.submitReview()).stage).toBe('titleChecking');
  });

  it('ends the evaluation as the demo panel says, and rejects a deck outside 3–40 pages', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    const settings = TestBed.inject(DemoSettings);
    settings.set({ evaluationOutcome: 'questions' });
    await api.uploadDeck(FILES(), DEMO_ANSWERS, CONSENTS);
    let app = await api.completeEvaluation();
    expect(app.stage).toBe('evaluationQuestions');
    expect(app.evaluation).toMatchObject({ status: 'questions', finishedAt: null });

    // A failed evaluation sends the founder back to the upload, where a new one starts.
    await api.seed('verified');
    settings.set({ evaluationOutcome: 'failed' });
    await api.uploadDeck(FILES(), DEMO_ANSWERS, CONSENTS);
    app = await api.completeEvaluation();
    expect(app.stage).toBe('verified');
    expect(app.evaluation!.status).toBe('failed');
    expect(app.evaluation!.finishedAt).toBeTruthy();
    settings.set({ evaluationOutcome: 'done' });
    app = await api.uploadDeck(FILES(), DEMO_ANSWERS, CONSENTS);
    expect(app.evaluation!.status).toBe('running');

    // A two-page PDF (page objects the mock can count) ends rejected whatever the demo panel says.
    await api.seed('verified');
    const pages = (n: number) => new File([`%PDF-1.4 ${'<< /Type /Page >> '.repeat(n)}<< /Type /Pages >>`], 'kisa.pdf', { type: 'application/pdf' });
    await api.uploadDeck({ deck: pages(2), cv: FILES().cv }, DEMO_ANSWERS, CONSENTS);
    app = await api.completeEvaluation();
    expect(app.stage).toBe('verified');
    expect(app.evaluation!.status).toBe('rejected');
    await api.uploadDeck({ deck: pages(16), cv: FILES().cv }, DEMO_ANSWERS, CONSENTS);
    expect((await api.completeEvaluation()).stage).toBe('review');
  });

  it('takes the upload only with both ticks and the form\'s rules, naming the fields as the API does', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await expect(api.uploadDeck(FILES(), DEMO_ANSWERS, { noticeAcknowledged: false, aiConsent: true })).rejects.toThrow(DECK_CONSENT_ERROR);
    await expect(api.uploadDeck(FILES(), DEMO_ANSWERS, { noticeAcknowledged: true, aiConsent: false })).rejects.toThrow(DECK_CONSENT_ERROR);
    const refused = await api
      .uploadDeck(
        { deck: demoFile('novalab.pptx', 1000), cv: demoFile('cv.pdf', 5 * 1024 * 1024 + 1) },
        { summary: ' kısa ', activityGroupId: 99, activityId: null, businessModelIds: [], revenueModelIds: [7], productTypeIds: [2, 9] },
        CONSENTS,
      )
      .then(() => null, (e: ApiError) => e) as ApiError;
    expect(refused).toMatchObject({ code: 'validation_failed', status: 400 });
    expect(Object.keys(refused.fields!).sort()).toEqual(['activityGroupId', 'activityId', 'businessModelIds', 'cv', 'deck', 'productTypeIds', 'summary']);
    expect(refused.fields!['deck']).toEqual(['Sunum PDF biçiminde olmalıdır.']);
    expect((await api.login(email, 'Nova-Lab-2026!')).app!.deck).toBeUndefined();

    // The same checks the screen makes before sending, with the reference's limits.
    const limits = EVALUATION_REFERENCE.limits;
    const ok = { ...DEMO_ANSWERS, deck: { name: 'a.PDF', size: 25 * 1024 * 1024 }, cv: { name: 'cv.pdf', size: 5 * 1024 * 1024 } };
    expect(evaluationErrors(ok, limits, EVALUATION_REFERENCE)).toEqual({});
    const linked = { ...EVALUATION_REFERENCE, activities: EVALUATION_REFERENCE.activities.map((a) => ({ ...a, groupId: a.id <= 27 ? 1 : 2 })) };
    expect(evaluationErrors({ ...ok, activityId: 40 }, limits, linked)).toEqual({ activityId: 'Seçilen faaliyet alanı, seçilen faaliyet grubuna ait değildir.' });
    expect(evaluationErrors({ ...ok, deck: { name: 'a.pdf', size: 25 * 1024 * 1024 + 1 } }, limits).deck).toBe('Sunum dosyası 25 MB’tan büyük olamaz.');
    expect(evaluationErrors({ ...ok, deck: null, cv: { name: 'cv.docx', size: 1 } }, limits)).toEqual({ deck: 'Sunum dosyanızı yükleyiniz.', cv: 'Özgeçmiş PDF biçiminde olmalıdır.' });
    expect(evaluationErrors({ ...ok, summary: 'x'.repeat(49) }, limits).summary).toBe('Özet en az 50 karakter olmalıdır.');
    expect(evaluationErrors({ ...ok, summary: ` ${'x'.repeat(50)} ` }, limits).summary).toBeUndefined();
    expect(evaluationErrors({ ...ok, summary: 'x'.repeat(2001) }, limits).summary).toBe('Özet en fazla 2000 karakter olabilir.');
  });

  it('seeds the demo founder at the new deck stages', async () => {
    expect((await api.seed('evaluating')).app!.evaluation!.status).toBe('running');
    expect((await api.seed('evaluationQuestions')).app!.stage).toBe('evaluationQuestions');
    const review = (await api.seed('review')).app!;
    expect(review.marks['phone']).toBe('profile');
    expect(review.company.root).toBe('Acme');
    // Submitted untouched, the proposed title ("Acme Cloud" + Anonim Şirketi) goes to the title check.
    expect((await api.submitReview()).titleCheck).toMatchObject({ status: 'checking', candidate: 'Acme Cloud' });
    expect((await api.seed('eligibility')).app!.company).toMatchObject({ root: 'Acme', activity: 'Bulut Yazılım' });
  });

  it('sends an application left at the deck upload without a profile back to the profile form', async () => {
    const email = 'ayse@novalab.io';
    await api.register({ firstName: 'Ayşe', lastName: 'Kaya', email, password: 'Nova-Lab-2026!' });
    await api.verifyEmail(email, lastCode());
    const other = await api.seed('review');
    // Saved between 2026-11-20 and 2026-11-25: no profile. The other one was being read by the old AI reader.
    const db = JSON.parse(localStorage.getItem('dsp.db.v1')!);
    Object.assign(db.apps[email], { stage: 'verified', crossCheck: [] });
    Object.assign(db.apps[other.account.email], { stage: 'scanning', crossCheck: [], deck: { fileName: 'a.pptx', sizeKb: 1, pages: 0, startedAt: '', fields: [] }, marks: { title: 'ai', phone: 'check', name: 'edited' } });
    db.apps[other.account.email].company.deckName = 'Acme Cloud';
    delete db.apps[other.account.email].company.brand;
    localStorage.setItem('dsp.db.v1', JSON.stringify(db));
    const { app } = await api.login(email, 'Nova-Lab-2026!');
    expect(app!.stage).toBe('profile');
    expect('crossCheck' in app!).toBe(false);
    // The deck being read goes back to the upload; the old reader's leftovers are dropped.
    const later = (await api.login(other.account.email, DEMO_ACCOUNT.password)).app!;
    expect(later.stage).toBe('verified');
    expect(later.deck).toBeUndefined();
    expect(later.marks).toEqual({ name: 'edited' });
    expect(later.company.brand).toBe('Acme Cloud');
    // Signed in as the demo founder above; the rest is Ayşe's again.
    await api.login(email, 'Nova-Lab-2026!');
    await api.submitProfile(PROFILE);
    await atReview();
    expect((await api.submitReview()).stage).toBe('titleChecking');
    expect((await api.completeTitleCheck()).stage).toBe('eligibility');
  });

  // ------------------------------------------------------ sessions and password reset (2026-11-25)

  it('keeps who is signed in itself, as the API keeps a session', async () => {
    const email = 'ayse@novalab.io';
    await api.register({ firstName: 'Ayşe', lastName: 'Kaya', email, password: 'Nova-Lab-2026!' });
    const refused = await api.login(email, 'Nova-Lab-2026!').catch((e: ApiError) => e);
    expect(refused).toMatchObject({ code: 'email_not_verified', status: 403, message: 'E-posta adresiniz henüz doğrulanmadı. Size yeni bir kod gönderdik.' });
    await api.verifyEmail(email, lastCode());
    expect((await api.restore())!.account).toEqual({ email, firstName: 'Ayşe', lastName: 'Kaya', founderType: 'foreign', verified: true });
    await api.logout();
    expect(await api.restore()).toBeNull();
    await expect(api.submitProfile(PROFILE)).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });
    await expect(api.login(email, 'wrong')).rejects.toMatchObject({ code: 'invalid_credentials', message: 'E-posta veya şifre hatalı.' });
  });

  it('mails a working reset link, sets the new password once and signs the founder out', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await api.requestPasswordReset('nobody@novalab.io');
    expect(inbox.messages()[0].link).toBeUndefined();
    await api.requestPasswordReset(email);
    const url = inbox.messages()[0].link!.url;
    expect(url).toMatch(/^\/sifre-sifirla\?token=[\w-]{22}$/);
    const token = url.split('token=')[1];
    await expect(api.confirmPasswordReset(token, 'kısa')).rejects.toMatchObject({ fields: { password: ['Şifre en az 10 karakter olmalıdır.'] } });
    await api.confirmPasswordReset(token, 'Yeni-Sifre-2026!');
    expect(await api.restore()).toBeNull();
    await expect(api.confirmPasswordReset(token, 'Yeni-Sifre-2026!')).rejects.toMatchObject({ code: 'link_invalid' });
    await expect(api.login(email, 'Nova-Lab-2026!')).rejects.toThrow('E-posta veya şifre hatalı.');
    expect((await api.login(email, 'Yeni-Sifre-2026!')).account.email).toBe(email);
  });

  it('seeds the demo founder at any stage, including the finished company', async () => {
    const { app } = await api.seed('done');
    expect(app!.stage).toBe('done');
    expect(app!.docs.length).toBe(20);
    expect(app!.results!.iban).toMatch(/^TR\d{2} /);
    const resident = await api.seed('signing', 'resident');
    expect(resident.app!.founderType).toBe('resident');
  });
});
