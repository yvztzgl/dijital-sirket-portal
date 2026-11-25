import { TestBed } from '@angular/core/testing';
import { DemoSettings } from './demo-settings';
import { Inbox } from './inbox';
import {
  alternativesFor,
  ApiError,
  brandFromFile,
  luhn,
  MockApi,
  passwordStrength,
  sameStem,
  validateCard,
  validTckn,
} from './mock-api';
import { FEE_TOTAL } from './models';
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

  /** Registers and verifies the e-mail, so the founder is at the deck upload (D-1a). */
  async function verifiedFounder(email = 'ayse@novalab.io') {
    await api.register({ firstName: 'Ayşe', lastName: 'Kaya', email, password: 'Nova-Lab-2026!' });
    await expect(api.uploadDeck(email, { name: 'x.pdf', size: 1 })).rejects.toThrow('bulunamadı');
    await expect(api.verifyEmail(email, '000000')).rejects.toBeInstanceOf(ApiError);
    const { app } = await api.verifyEmail(email, lastCode());
    return app;
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
    await verifiedFounder(email);
    let app = await api.uploadDeck(email, { name: 'acme-cloud-pitch.pdf', size: 1000 });
    expect(app.stage).toBe('scanning');
    expect(app.deck!.fields.find((f) => f.key === 'name')!.value).toBe('Ayşe Kaya');
    app = await api.completeScan(email);
    app = await api.submitReview(email);
    expect(app.stage).toBe('titleConflict');
    expect(app.titleCheck!.conflictWith).toBe('Acme Bulut Bilişim Hizmetleri A.Ş.');
    app = await api.chooseTitle(email, 'Acme Bulut Yazılım A.Ş.');
    expect(app.stage).toBe('eligibility');
    expect(app.company.activity).toBe('Bulut Yazılım');
  });

  it('hands the identity check to a phone through a short-lived link', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await api.uploadDeck(email, { name: 'novalab-deck.pdf', size: 1000 });
    await api.completeScan(email);
    await api.submitReview(email);
    expect(await api.phoneLinkStatus('nope')).toEqual({ state: 'invalid' });

    let app = await api.createPhoneLink(email);
    const first = app.phoneLink!.token;
    expect(first.length).toBeGreaterThanOrEqual(22);
    expect((await api.phoneLinkStatus(first)).state).toBe('ready');
    // A new code replaces the old one.
    app = await api.createPhoneLink(email);
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
    await expect(api.createPhoneLink(email)).rejects.toThrow('zaten');

    // The phone does the camera check only; the declaration is made on the computer.
    expect(await api.completeIdentityByPhone(token)).toEqual({ state: 'done' });
    expect((await api.login(email, 'Nova-Lab-2026!')).app!.stage).toBe('declaration');
  });

  it('lets a phone link run out, and cancels it when the check starts on the computer', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await api.uploadDeck(email, { name: 'novalab-deck.pdf', size: 1000 });
    await api.completeScan(email);
    await api.submitReview(email);
    let app = await api.createPhoneLink(email);
    const token = app.phoneLink!.token;
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60_000;
    try {
      expect(await api.phoneLinkStatus(token)).toEqual({ state: 'expired' });
      await expect(api.startEligibilityByPhone(token, true)).rejects.toThrow('süresi dolmuştur');
    } finally {
      Date.now = realNow;
    }
    app = await api.startEligibility(email, true);
    expect(app.phoneLink).toBeUndefined();
    expect(await api.phoneLinkStatus(token)).toEqual({ state: 'invalid' });
  });

  it('asks for consent before the video call can start', async () => {
    const { account } = await api.seed('signing');
    await expect(api.startCall(account.email)).rejects.toThrow('ön bilgilendirmeyi');
    await expect(api.acceptCallTerms(account.email, false)).rejects.toThrow('onay metnini');
    let app = await api.acceptCallTerms(account.email, true);
    expect(app.callConsentAt).toBeTruthy();
    expect(app.logs.at(-1)!.who).toBe('u');
    app = await api.startCall(account.email);
    expect(app.stage).toBe('calling');
    // A call that was ended does not ask again.
    app = await api.endCall(account.email);
    expect(app.callConsentAt).toBeTruthy();
    expect((await api.startCall(account.email)).stage).toBe('calling');
  });

  it('sends third-party funding to manual review, and runs payment with 3-D Secure', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await api.uploadDeck(email, { name: 'novalab-deck.pdf', size: 1000 });
    await api.completeScan(email);
    await api.updateReview(email, { funding: 'third-party' }, ['funding']);
    let app = await api.submitReview(email);
    expect(app.stage).toBe('eligibility');
    // The identity check waits for the founder: nothing runs before "Doğrulamayı başlat".
    expect(app.eligibility).toBeUndefined();
    await expect(api.completeIdentity(email)).rejects.toThrow('başlatılmamıştır');
    await expect(api.startEligibility(email, false)).rejects.toThrow('açık rıza');
    app = await api.startEligibility(email, true);
    expect(app.eligibility!.result).toBe('manual');
    expect(app.eligibility!.consentAt).toBe(app.eligibility!.startedAt);
    expect(app.logs.slice(-2).map((l) => l.who)).toEqual(['u', 'u']);
    expect(app.logs.at(-2)!.text).toContain('Açık rıza');
    const startedAt = app.eligibility!.startedAt;
    app = await api.startEligibility(email, true);
    expect(app.eligibility!.startedAt).toBe(startedAt);
    // Three stages, three screens: camera check, then the founder's declaration, then the list search.
    app = await api.completeIdentity(email);
    expect(app.stage).toBe('declaration');
    expect(app.eligibility!.identityDoneAt).toBeTruthy();
    const pdf = { name: 'fatura.pdf', size: 300_000 };
    await expect(api.submitDeclaration(email, { file: null, declared: true })).rejects.toThrow('yükleyiniz');
    await expect(api.submitDeclaration(email, { file: { name: 'fatura.docx', size: 1 }, declared: true })).rejects.toThrow('PDF, JPG veya PNG');
    await expect(api.submitDeclaration(email, { file: { name: 'fatura.pdf', size: 11 * 1024 * 1024 }, declared: true })).rejects.toThrow('10 MB');
    await expect(api.submitDeclaration(email, { file: pdf, declared: false })).rejects.toThrow('beyanı onaylayınız');
    app = await api.submitDeclaration(email, { file: pdf, declared: true });
    expect(app.stage).toBe('screening');
    expect(app.eligibility!.address!.fileName).toBe('fatura.pdf');
    expect(app.eligibility!.declaredAt).toBe(app.eligibility!.screeningStartedAt);
    expect(app.logs.slice(-2).map((l) => l.who)).toEqual(['u', 'u']);
    expect(app.docs.length).toBe(0);
    app = await api.completeScreening(email);
    expect(app.stage).toBe('manual');
    expect(app.docs.length).toBe(3);
    await api.proceedToPayment(email);
    await expect(api.pay(email, { holder: 'AYSE KAYA', number: '4242 4242 4242 4241', expiry: '12/30', cvv: '123' })).rejects.toThrow('geçersiz');
    app = await api.pay(email, { holder: 'Ayse Kaya', number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' });
    expect(app.stage).toBe('threeDs');
    await expect(api.confirm3ds(email, '000000')).rejects.toThrow('hatalı');
    app = await api.confirm3ds(email, inbox.messages()[0].code!);
    expect(app.stage).toBe('signing');
    expect(app.payment!.paidAt).toBeTruthy();
  });

  it('e-Devlet registers a T.C. citizen on first use and signs them in afterwards', async () => {
    await expect(api.edevlet('10000000147')).rejects.toThrow('doğrulanamadı');
    const first = await api.edevlet('10000000146');
    expect(first.created).toBe(true);
    expect(first.account.firstName).toBe('Mehmet');
    expect(first.account.founderType).toBe('resident');
    expect(first.app.stage).toBe('verified');
    const again = await api.edevlet('10000000146');
    expect(again.created).toBe(false);
    expect(again.app.id).toBe(first.app.id);
  });

  it('starts at the deck upload and moves an application saved at the removed profile form there', async () => {
    const email = 'ayse@novalab.io';
    expect((await verifiedFounder(email)).stage).toBe('verified');
    // An application saved before 2026-11-20, waiting on D-1e with a statement and its comparison.
    const db = JSON.parse(localStorage.getItem('dsp.db.v1')!);
    Object.assign(db.apps[email], { stage: 'profile', profile: { brand: 'Novalab' }, crossCheck: [] });
    localStorage.setItem('dsp.db.v1', JSON.stringify(db));
    const { app } = await api.login(email, 'Nova-Lab-2026!');
    expect(app!.stage).toBe('verified');
    expect('profile' in app!).toBe(false);
    expect('crossCheck' in app!).toBe(false);
    await api.uploadDeck(email, { name: 'novalab-deck.pdf', size: 1000 });
    await api.completeScan(email);
    expect((await api.submitReview(email)).stage).toBe('eligibility');
  });

  it('reads the downloadable sample deck exactly as written on its slides', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    const app = await api.uploadDeck(email, { name: 'lumora-analytics-pitch.pptx', size: 57_000 });
    expect(app.company.deckName).toBe('Lumora Analytics');
    expect(app.company.nace).toEqual(['62.01', '63.11', '62.02']);
    expect(app.founder.nationality).toBe('Almanya');
    expect(app.contact.phone).toBe('+49 151 2345 6789');
    expect(app.deck!.pages).toBe(16);
    expect(Object.values(app.marks)).not.toContain('check');
  });

  it('starts the formation only after the founder confirmed the signing', async () => {
    const { account } = await api.seed('signed');
    await expect(api.startSetup(account.email, false)).rejects.toThrow('imzalanmasını onaylayınız');
    const app = await api.startSetup(account.email, true);
    expect(app.stage).toBe('setup');
    expect(app.setup!.signConsentAt).toBe(app.setup!.startedAt);
    expect(app.logs.slice(-2).map((l) => l.text)).toEqual(['Kuruluş belgelerinin e-imza ile imzalanması onaylandı', 'Kuruluş başlatıldı']);
    // T.C. citizens choose their e-signature first and then confirm on the same screen.
    const resident = await api.seed('signing', 'resident');
    expect((await api.signResident(resident.account.email, 'existing')).stage).toBe('signed');
  });

  it('refuses actions that do not belong to the current stage', async () => {
    const email = 'ayse@novalab.io';
    await verifiedFounder(email);
    await expect(api.startSetup(email, true)).rejects.toThrow('adımında');
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
