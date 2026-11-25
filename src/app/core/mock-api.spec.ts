import { TestBed } from '@angular/core/testing';
import { DemoSettings } from './demo-settings';
import { Inbox } from './inbox';
import {
  alternativesFor,
  ApiError,
  brandFromFile,
  DEMO_ACCOUNT,
  demoFile,
  luhn,
  MockApi,
  passwordStrength,
  sameStem,
  validateCard,
  validTckn,
} from './mock-api';
import { FEE_TOTAL } from './models';
import { DECK_CONSENT_ERROR, deckFileError } from './rules';
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

  it('derives a brand from the deck file name', () => {
    expect(brandFromFile('acme-cloud-pitch_v3.pdf')).toBe('Acme Cloud');
    expect(brandFromFile('pitch.pdf')).toBe('Yeni Girişim');
    expect(brandFromFile('ornek-sunum-lumora-analytics.pptx')).toBe('Lumora Analytics');
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
    TestBed.inject(DemoSettings).set({ speed: 1000, forceConflict: false, forceManual: false });
    api = TestBed.inject(MockApi);
    inbox = TestBed.inject(Inbox);
  });

  const lastCode = () => inbox.messages()[0].code!;

  /** Both ticks of D-1a, as the founder gives them. */
  const CONSENTS = { noticeAcknowledged: true, aiConsent: true };
  /** A deck file of a given size; the mock reads only name and size. */
  const deck = (name: string, size = 1000) => demoFile(name, size);
  /** The statement on D-1e that agrees with the generic demo deck for a foreign founder. */
  const PROFILE = { brand: 'Novalab', sector: 'software', funding: 'own-abroad', nationality: 'Birleşik Krallık', phone: '+44 7700 900123', country: 'Birleşik Krallık' } as const;

  /** Registers, verifies the e-mail and fills in the profile, so the founder is at the deck upload (D-1a). */
  async function verifiedFounder(email = 'ayse@novalab.io', brand = 'Novalab') {
    await api.register({ firstName: 'Ayşe', lastName: 'Kaya', email, password: 'Nova-Lab-2026!' });
    await expect(api.uploadDeck(deck('x.pdf', 1), CONSENTS)).rejects.toThrow('bulunamadı');
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

  it('carries the founder into the scanned fields and hits a MERSİS conflict for an existing title', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email, 'Acme Cloud');
    let app = await api.uploadDeck(deck('acme-cloud-pitch.pdf', 1000), CONSENTS);
    expect(app.stage).toBe('scanning');
    expect(app.deck!.fields.find((f) => f.key === 'name')!.value).toBe('Ayşe Kaya');
    app = await api.completeScan();
    app = await api.submitReview();
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
    await api.uploadDeck(deck('novalab-deck.pdf', 1000), CONSENTS);
    await api.completeScan();
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
    await api.uploadDeck(deck('novalab-deck.pdf', 1000), CONSENTS);
    await api.completeScan();
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
    await api.uploadDeck(deck('novalab-deck.pdf', 1000), CONSENTS);
    await api.completeScan();
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

  it('reads the downloadable sample deck exactly as written on its slides', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    const app = await api.uploadDeck(deck('lumora-analytics-pitch.pptx', 57_000), CONSENTS);
    expect(app.company.deckName).toBe('Lumora Analytics');
    expect(app.company.nace).toEqual(['62.01', '63.11', '62.02']);
    expect(app.founder.nationality).toBe('Almanya');
    expect(app.contact.phone).toBe('+49 151 2345 6789');
    expect(app.deck!.pages).toBe(16);
    expect(Object.values(app.marks)).not.toContain('check');
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

  // ------------------------------------------------ profile, cross-check, deck consents (2026-11-25)

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
    expect(created!.crossCheck).toEqual([]);
    await expect(api.uploadDeck(deck('novalab-deck.pdf'), CONSENTS)).rejects.toThrow('Önce ön bilgileri doldurunuz.');
    let app = await api.submitProfile(PROFILE);
    expect(app.stage).toBe('verified');
    // Saved again from D-1a's "Ön bilgileri düzenle": the new statement replaces the old one.
    app = await api.submitProfile({ ...PROFILE, brand: 'Novalab Labs' });
    expect(app.stage).toBe('verified');
    expect(app.profile!.brand).toBe('Novalab Labs');
    expect(app.logs.at(-1)!.text).toBe('Ön bilgiler güncellendi');
    await api.uploadDeck(deck('novalab-deck.pdf'), CONSENTS);
    await expect(api.submitProfile(PROFILE)).rejects.toThrow('adımında');
  });

  it('checks the deck against the profile and waits for the founder to decide each difference', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    // Changed before the deck: the phone and the capital source no longer agree with the deck.
    let app = await api.submitProfile({ ...PROFILE, phone: '+44 7700 900999', funding: 'investor' });
    await api.uploadDeck(deck('novalab-deck.pdf'), CONSENTS);
    expect((await api.login(email, 'Nova-Lab-2026!')).app!.crossCheck).toEqual([]);
    app = await api.completeScan();
    expect(app.crossCheck.length).toBe(6);
    expect(app.crossCheck.filter((c) => !c.match).map((c) => c.key)).toEqual(['funding', 'phone']);
    expect(app.crossCheck.find((c) => c.key === 'phone')).toEqual({
      key: 'phone', label: 'Telefon', stated: '+44 7700 900999', read: '+44 7700 900123', match: false, choice: null, at: null,
    });
    expect(app.logs.at(-1)!.text).toBe('Ön bilgilerle karşılaştırıldı: 4 bilgi uyuşuyor, 2 bilgi farklı');
    await expect(api.submitReview()).rejects.toThrow('Ön bilgilerinizle uyuşmayan bilgilerde doğru değeri seçiniz.');
    await expect(api.resolveCrossCheck('brand', 'read')).rejects.toThrow('Bu bilgi için seçim gerekmemektedir.');
    // The profile's capital source is written into the application; the deck's phone is kept.
    app = await api.resolveCrossCheck('funding', 'stated');
    expect(app.funding).toBe('investor');
    expect(app.marks['funding']).toBe('edited');
    app = await api.resolveCrossCheck('phone', 'read');
    expect(app.contact.phone).toBe('+44 7700 900123');
    const phone = app.crossCheck.find((c) => c.key === 'phone')!;
    expect(phone.choice).toBe('read');
    expect(phone.at).toBeTruthy();
    expect(app.logs.at(-1)).toMatchObject({ text: 'Telefon: sunumdaki değer seçildi', who: 'u' });
    expect((await api.submitReview()).stage).toBe('titleChecking');
    expect((await api.completeTitleCheck()).stage).toBe('eligibility');
  });

  it('counts a difference as decided when the founder types another value in the review', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await api.submitProfile({ ...PROFILE, nationality: 'İrlanda' });
    await api.uploadDeck(deck('novalab-deck.pdf'), CONSENTS);
    await api.completeScan();
    const app = await api.updateReview({ founder: { nationality: 'Kanada' } }, ['name']);
    expect(app.crossCheck.find((c) => c.key === 'nationality')!.choice).toBe('edited');
    expect((await api.submitReview()).stage).toBe('titleChecking');
    expect((await api.completeTitleCheck()).stage).toBe('eligibility');
  });

  it('shows "—" for a compared value the deck did not give', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await api.uploadDeck(deck('novalab-deck.pdf'), CONSENTS);
    // A deck without a phone number on its contact page.
    const db = JSON.parse(localStorage.getItem('dsp.db.v1')!);
    db.apps[email].contact.phone = '';
    localStorage.setItem('dsp.db.v1', JSON.stringify(db));
    const app = await api.completeScan();
    expect(app.crossCheck.find((c) => c.key === 'phone')).toMatchObject({ read: '—', match: false });
  });

  it('shows the sample deck with the sample profile as one difference, the phone', async () => {
    const email = 'ayse@novalab.io';
    await api.register({ firstName: 'Ayşe', lastName: 'Kaya', email, password: 'Nova-Lab-2026!' });
    await api.verifyEmail(email, lastCode());
    // The values of D-1e's "Demo: örnek bilgileri doldur".
    await api.submitProfile({ brand: 'Lumora Analytics', sector: 'software', funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya' });
    await api.uploadDeck(deck('lumora-analytics-pitch.pptx', 57_000), CONSENTS);
    const app = await api.completeScan();
    expect(app.crossCheck.filter((c) => !c.match).map((c) => c.key)).toEqual(['phone']);
  });

  it('seeds the demo founder with one difference open at the review and decided after it', async () => {
    const review = await api.seed('review');
    expect(review.app!.crossCheck.filter((c) => !c.match).map((c) => [c.key, c.choice])).toEqual([['phone', null]]);
    const later = await api.seed('eligibility');
    expect(later.app!.crossCheck.find((c) => c.key === 'phone')!.choice).toBe('read');
    expect((await api.seed('profile')).app!.stage).toBe('profile');
    expect((await api.seed('verified')).app!.profile).toBeTruthy();
  });

  it('takes the deck only with both ticks, as PDF or PPTX of at most 25 MB', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    const pdf = deck('novalab-deck.pdf');
    await expect(api.uploadDeck(pdf, { noticeAcknowledged: false, aiConsent: true })).rejects.toThrow(DECK_CONSENT_ERROR);
    await expect(api.uploadDeck(pdf, { noticeAcknowledged: true, aiConsent: false })).rejects.toThrow(DECK_CONSENT_ERROR);
    await expect(api.uploadDeck(deck('novalab.key'), CONSENTS)).rejects.toThrow('Sunum PDF veya PPTX biçiminde olmalıdır.');
    await expect(api.uploadDeck(deck('novalab.ppt'), CONSENTS)).rejects.toThrow('Sunum PDF veya PPTX biçiminde olmalıdır.');
    await expect(api.uploadDeck(deck('novalab.pdf', 25 * 1024 * 1024 + 1), CONSENTS)).rejects.toThrow('Dosya 25 MB’tan büyüktür.');
    expect((await api.login(email, 'Nova-Lab-2026!')).app!.deck).toBeUndefined();
    const app = await api.uploadDeck(deck('novalab.PPTX', 25 * 1024 * 1024), CONSENTS);
    expect(app.stage).toBe('scanning');
    expect(app.deck!.noticeAt).toBe(app.deck!.startedAt);
    expect(app.deck!.aiConsentAt).toBe(app.deck!.startedAt);
    expect(app.logs.slice(-3).map((l) => l.who)).toEqual(['u', 'u', 'u']);
    expect(app.logs.at(-2)!.text).toContain('yapay zekâ');
    // The same checks the screen makes before sending.
    expect(deckFileError({ name: 'a.pdf', size: 1 })).toBeNull();
    expect(deckFileError({ name: 'a.key', size: 1 })).toContain('PDF veya PPTX');
    expect(deckFileError({ name: 'a.pdf', size: 26 * 1024 * 1024 })).toContain('25 MB');
  });

  it('sends an application left at the deck upload without a profile back to the profile form', async () => {
    const email = 'ayse@novalab.io';
    await api.register({ firstName: 'Ayşe', lastName: 'Kaya', email, password: 'Nova-Lab-2026!' });
    await api.verifyEmail(email, lastCode());
    const other = await api.seed('review');
    // Saved between 2026-11-20 and 2026-11-25: no profile, no comparison.
    const db = JSON.parse(localStorage.getItem('dsp.db.v1')!);
    Object.assign(db.apps[email], { stage: 'verified' });
    delete db.apps[email].crossCheck;
    delete db.apps[other.account.email].profile;
    delete db.apps[other.account.email].crossCheck;
    localStorage.setItem('dsp.db.v1', JSON.stringify(db));
    const { app } = await api.login(email, 'Nova-Lab-2026!');
    expect(app!.stage).toBe('profile');
    expect(app!.crossCheck).toEqual([]);
    // A later stage stays where it is, with an empty comparison that blocks nothing.
    const later = (await api.login(other.account.email, DEMO_ACCOUNT.password)).app!;
    expect(later.stage).toBe('review');
    expect(later.crossCheck).toEqual([]);
    // Signed in as the demo founder above; the rest is Ayşe's again.
    await api.login(email, 'Nova-Lab-2026!');
    await api.submitProfile(PROFILE);
    await api.uploadDeck(deck('novalab-deck.pdf'), CONSENTS);
    await api.completeScan();
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
