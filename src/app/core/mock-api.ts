import { inject, Injectable } from '@angular/core';
import type { Api, DemoTools, ReviewPatch } from './api';
import { ApiError } from './api-error';
import { DemoSettings } from './demo-settings';
import { titleCase, tl } from './format';
import { Inbox } from './inbox';
import {
  Account,
  Application,
  CAPITAL,
  FEE_TOTAL,
  FieldMark,
  FUNDING_LABELS,
  FounderType,
  FundingSource,
  LogEntry,
  ScanField,
  PhoneLinkStatus,
  Stage,
} from './models';
import { ADDRESS_DOC_MAX, validateCard, validTckn } from './rules';
import { DURATION, identityEvents, screeningEvents, setupEvents, signatureDocs, titleDocs } from './timeline';

/**
 * In-browser stand-in for the platform backend. Every method is async and returns fresh copies,
 * so a real HTTP client can replace this class without changing screens or the store.
 * Data lives in localStorage under `dsp.db.v1`.
 *
 * It implements `Api` (api.ts) and is the one the default build injects. `implements` rather than
 * `extends` keeps the import of api.ts type-only: api.ts imports the environment, which imports
 * this file, and a runtime import back would be a cycle.
 */

// Moved to their own files; re-exported so existing imports keep working.
export { ApiError } from './api-error';
export type { ReviewPatch } from './api';
export { ADDRESS_DOC_MAX, FUNDING_OPTIONS, luhn, passwordStrength, validateCard, validTckn } from './rules';

interface Db {
  users: Account[];
  apps: Record<string, Application>;
}

const DB_KEY = 'dsp.db.v1';

/** Titles already registered in the simulated MERSİS. */
export const MERSIS_REGISTRY = [
  'Acme Bulut Bilişim Hizmetleri A.Ş.',
  'Galata Bulut Bilişim A.Ş.',
  'Anadolu Yazılım Teknolojileri A.Ş.',
  'Boğaziçi Veri Hizmetleri A.Ş.',
];

export const DEMO_ACCOUNT = { email: 'john.doe@acme.com', password: 'Acme-2026!', firstName: 'John', lastName: 'Doe' };

const clone = <T>(v: T): T => structuredClone(v);
const nowIso = () => new Date().toISOString();

/** How long the QR code of the identity step's phone link stays valid. */
export const PHONE_LINK_TTL = 10 * 60_000;

/** 128 random bits, URL-safe. */
function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

@Injectable({ providedIn: 'root' })
export class MockApi implements Api {
  private readonly settings = inject(DemoSettings);
  private readonly inbox = inject(Inbox);

  /** The demo panel's tools; only the mock has them (see `Api.demo`). */
  readonly demo: DemoTools = {
    account: { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password },
    seed: (stage, founderType) => this.seed(stage, founderType),
    reset: () => this.reset(),
    speed: () => this.settings.speed(),
    readSession: (email) => {
      const db = JSON.parse(localStorage.getItem(DB_KEY) ?? '{}');
      const account: Account | null = (db.users ?? []).find((u: Account) => u.email === email) ?? null;
      return { account, app: account ? (db.apps?.[email] ?? null) : null };
    },
    onExternalChange: (callback) =>
      addEventListener('storage', (e) => {
        if (e.key === DB_KEY) callback();
      }),
  };

  // ------------------------------------------------------------------------------------- auth

  async register(input: { firstName: string; lastName: string; email: string; password: string }): Promise<Account> {
    await this.wait(700);
    const email = normEmail(input.email);
    const db = this.db();
    if (db.users.some((u) => u.email === email)) throw new ApiError('Bu e-posta adresiyle bir hesap zaten var. Giriş yapın.');
    const acc: Account = {
      email,
      password: input.password,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      founderType: 'foreign',
      verified: false,
      createdAt: nowIso(),
    };
    db.users.push(acc);
    this.save(db);
    this.sendEmailCode(email);
    return clone(acc);
  }

  /**
   * T.C. citizens sign in *and* sign up through (simulated) e-Devlet Kapısı: the T.C. kimlik no is
   * verified and name, e-mail and address come from e-Devlet, so the first visit creates the
   * account (no form, no e-mail code) and later visits simply sign in.
   */
  async edevlet(tckn: string) {
    await this.wait(900);
    if (!validTckn(tckn)) throw new ApiError('T.C. kimlik numarası e-Devlet’te doğrulanamadı.');
    const db = this.db();
    let acc = db.users.find((u) => u.tckn === tckn);
    const created = !acc;
    if (!acc) {
      const id = edevletIdentity(tckn);
      acc = { email: id.email, password: '', firstName: id.firstName, lastName: id.lastName, founderType: 'resident', tckn, verified: true, createdAt: nowIso() };
      db.users = db.users.filter((u) => u.email !== acc!.email);
      db.users.push(acc);
    }
    db.apps[acc.email] ??= newApplication(acc);
    this.save(db);
    return { account: clone(acc), app: clone(db.apps[acc.email]), created };
  }

  async login(emailIn: string, password: string) {
    await this.wait(600);
    const db = this.db();
    const acc = db.users.find((u) => u.email === normEmail(emailIn));
    if (!acc || acc.password !== password || !password) throw new ApiError('E-posta veya şifre hatalı.');
    return { account: clone(acc), app: clone(db.apps[acc.email] ?? null) };
  }

  async resendEmailCode(email: string) {
    await this.wait(400);
    this.sendEmailCode(normEmail(email));
  }

  async verifyEmail(emailIn: string, code: string) {
    await this.wait(700);
    const email = normEmail(emailIn);
    const db = this.db();
    const acc = db.users.find((u) => u.email === email);
    if (!acc) throw new ApiError('Hesap bulunamadı.');
    if (this.codes.get(email) !== code) throw new ApiError('Kod hatalı veya süresi dolmuş. Yeni kod isteyin.');
    acc.verified = true;
    db.apps[email] ??= newApplication(acc);
    this.save(db);
    this.codes.delete(email);
    return { account: clone(acc), app: clone(db.apps[email]) };
  }

  /** Always succeeds so the response never reveals whether an account exists. */
  async requestPasswordReset(emailIn: string) {
    await this.wait(700);
    const email = normEmail(emailIn);
    if (this.db().users.some((u) => u.email === email)) {
      this.inbox.send({
        kind: 'mail',
        from: 'no-reply@dijitalsirket.gov.tr',
        title: 'Şifre sıfırlama bağlantısı',
        body: `${email} için şifre sıfırlama bağlantısı. 30 dakika geçerlidir.`,
      });
    }
  }

  // ------------------------------------------------------------------------- step 1 · sunum

  async uploadDeck(email: string, file: { name: string; size: number }) {
    await this.wait(500);
    return this.mutate(email, ['verified', 'review', 'titleConflict', 'scanning'], (app, acc) => {
      const brand = brandFromFile(file.name);
      const root = brand.split(' ')[0];
      const prof = deckProfile(file.name, acc.founderType);
      app.company = { ...app.company, deckName: brand, logo: deckLogo(brand), root, activity: prof.activity, nace: prof.nace, suggestedNace: prof.suggestedNace };
      app.founder.nationality = prof.nationality;
      app.contact = { email: acc.email, ...prof.contact };
      app.funding = prof.funding;
      app.marks = { title: 'ai', nace: 'ai', phone: 'ai', funding: 'ai', address: 'ai', email: 'ai', ...prof.marks };
      const name = `${acc.firstName} ${acc.lastName}`;
      const pg = prof.pages;
      const fields: ScanField[] = [
        { key: 'title', label: 'Şirket unvanı', value: brand, page: pg.title },
        { key: 'nace', label: 'NACE kodları', value: prof.nace.join(' · '), page: pg.nace },
        { key: 'share', label: 'Pay sahipliği', value: `%100 · ${name}`, page: pg.founder },
        { key: 'name', label: 'Ad / Soyad', value: name, page: pg.founder },
        { key: 'nationality', label: 'Uyruk', value: app.founder.nationality, page: pg.founder },
        { key: 'email', label: 'E-posta', value: acc.email, page: pg.contact },
        { key: 'phone', label: 'Telefon', value: app.contact.phone, page: pg.contact },
        { key: 'address', label: 'Adres', value: app.contact.address, page: pg.contact },
        { key: 'funding', label: 'Fon kaynağı', value: FUNDING_LABELS[prof.funding], page: pg.funding },
        { key: 'postal', label: 'Posta kodu · Ülke', value: `${app.contact.postalCode} · ${app.contact.country}`, page: pg.contact },
      ];
      app.deck = { fileName: file.name, sizeKb: Math.max(1, Math.round(file.size / 1024)), pages: pg.total ?? 10 + (file.name.length % 5), startedAt: nowIso(), fields };
      app.titleCheck = undefined;
      app.stage = 'scanning';
      log(app, `Sunum yüklendi · ${file.name}`, 'u');
    });
  }

  async completeScan(email: string) {
    return this.mutate(email, ['scanning'], (app) => {
      app.stage = 'review';
      log(app, `AI Reviewer ${(app.deck?.fields.length ?? 10) + 3} alan çıkardı`, 'a');
    });
  }

  async updateReview(email: string, patch: ReviewPatch, edited: string[]) {
    return this.mutate(email, ['review', 'titleConflict'], (app) => {
      const defined = <T extends object>(o?: T) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
      Object.assign(app, {
        company: { ...app.company, ...defined(patch.company) },
        contact: { ...app.contact, ...defined(patch.contact) },
        founder: { ...app.founder, ...defined(patch.founder) },
        funding: patch.funding ?? app.funding,
      });
      edited.forEach((k) => (app.marks[k] = 'edited'));
    });
  }

  /** Submit the reviewed data: reserve the title in MERSİS, then open the identity step (see startEligibility). */
  async submitReview(email: string) {
    await this.wait(1_200);
    return this.mutate(email, ['review', 'titleConflict'], (app) => {
      this.reserveAndStart(app);
    });
  }

  async chooseTitle(email: string, title: string) {
    await this.wait(1_000);
    return this.mutate(email, ['titleConflict', 'review'], (app) => {
      const [root, ...rest] = title.replace(/\s+(A\.Ş\.|Anonim Şirketi)$/i, '').trim().split(/\s+/);
      app.company.root = root;
      app.company.activity = rest.join(' ');
      app.marks['title'] = 'edited';
      log(app, 'Şirket unvanı düzenlendi', 'u');
      this.reserveAndStart(app);
    });
  }

  private reserveAndStart(app: Application) {
    const candidate = `${app.company.root} ${app.company.activity}`.trim();
    if (app.company.nace.length === 0) throw new ApiError('En az bir NACE faaliyet kodu seçin.');
    const firstCheck = !app.titleCheck;
    const hit = MERSIS_REGISTRY.find((t) => sameStem(t, candidate));
    if (hit || (firstCheck && this.settings.state().forceConflict)) {
      app.titleCheck = {
        status: 'conflict',
        candidate,
        conflictWith: hit ?? `${candidate} Hizmetleri A.Ş.`,
        alternatives: alternativesFor(app.company.root, candidate),
      };
      app.stage = 'titleConflict';
      log(app, 'Unvan MERSİS’te rezerve edilemedi', 'k');
      return;
    }
    app.titleCheck = { status: 'ok', candidate };
    log(app, 'Unvan MERSİS’te rezerve edildi', 'k');
    // The identity step opens on its pre-information view; nothing runs until the founder starts it.
    app.eligibility = undefined;
    app.stage = 'eligibility';
  }

  // -------------------------------------------------------------------- step 2 · uygunluk

  /**
   * The founder has read the pre-information on D-2a, ticked the consent and pressed "Doğrulamayı
   * başlat": the camera check and the screening start now. Refused without the consent. The
   * consent and the start are logged as the founder's own actions and the consent's time is kept
   * on the application. Calling it again while the check runs changes nothing. Starting on the
   * computer cancels a phone link that was not used.
   */
  async startEligibility(email: string, consent: boolean) {
    await this.wait(500);
    return this.mutate(email, ['eligibility'], (app) => {
      if (app.eligibility) return;
      this.begin(app, consent);
      app.phoneLink = undefined;
    });
  }

  private begin(app: Application, consent: boolean, via?: 'phone') {
    if (!consent) throw new ApiError('Devam etmek için açık rıza metnini onaylayınız.');
    const manual = app.funding === 'third-party' || this.settings.state().forceManual;
    const at = nowIso();
    log(app, 'Açık rıza metni onaylandı (yüz görüntüsü ile kimlik doğrulama)', 'u');
    log(app, via === 'phone' ? 'Kimlik doğrulama telefondan başlatıldı' : 'Kimlik doğrulama başlatıldı', 'u');
    app.eligibility = {
      startedAt: at,
      consentAt: at,
      ...(via ? { via } : {}),
      score: Math.round((manual ? 96.5 + Math.random() : 97.5 + Math.random() * 1.5) * 10) / 10,
      result: manual ? 'manual' : 'eligible',
    };
  }

  /** The camera check ended: the founder goes on to the declaration screen. */
  async completeIdentity(email: string) {
    return this.mutate(email, ['eligibility'], (app) => {
      if (!app.eligibility) throw new ApiError('Kimlik doğrulaması henüz başlatılmamıştır.');
      const logs = identityEvents(app, this.dur(DURATION.identity));
      app.logs.push(...logs);
      app.eligibility.identityDoneAt = logs[logs.length - 1].at;
      app.stage = 'declaration';
    });
  }

  /**
   * Declaration screen (D-2d): the founder uploads a document showing the declared address and
   * confirms that the application's information is true; the list search starts.
   * The mock keeps only the file's name and size. A real API must store the file encrypted, scan
   * it, and record who confirmed which declaration text.
   */
  async submitDeclaration(email: string, input: { file: { name: string; size: number } | null; declared: boolean }) {
    await this.wait(700);
    return this.mutate(email, ['declaration'], (app) => {
      const f = input.file;
      if (!f) throw new ApiError('Adres belgenizi yükleyiniz.');
      if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) throw new ApiError('Adres belgesi PDF, JPG veya PNG biçiminde olmalıdır.');
      if (f.size > ADDRESS_DOC_MAX) throw new ApiError('Dosya 10 MB’tan büyüktür. Daha küçük bir dosya yükleyiniz.');
      if (!input.declared) throw new ApiError('Devam etmek için beyanı onaylayınız.');
      const at = nowIso();
      log(app, `Adres belgesi yüklendi · ${f.name}`, 'u');
      log(app, 'Bilgilerin doğruluğu beyan edildi', 'u');
      Object.assign(app.eligibility!, { address: { fileName: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)), at }, declaredAt: at, screeningStartedAt: at });
      app.stage = 'screening';
    });
  }

  /** The list search ended: the result, its log lines and the three documents. */
  async completeScreening(email: string) {
    return this.mutate(email, ['screening'], (app) => {
      const ev = screeningEvents(app, this.dur(DURATION.screening));
      app.logs.push(...ev.logs);
      app.docs.push(...ev.docs);
      app.eligibility!.finishedAt = ev.listTimes[4];
      app.stage = app.eligibility!.result === 'manual' ? 'manual' : 'eligible';
    });
  }

  // ------------------------------------------------ step 2 · identity check on the phone (QR)

  /**
   * D-2a "Telefonla devam et": makes the link the QR code carries. It is valid for ten minutes,
   * only while the check has not started, and replaces any earlier link. Logged.
   *
   * For a real API: the token must be at least 128 random bits and stored hashed; the link must
   * grant this one step of this one application and no session; creation and every use must be
   * audited with the device they came from; attempts must be rate-limited.
   */
  async createPhoneLink(email: string) {
    await this.wait(400);
    return this.mutate(email, ['eligibility'], (app) => {
      if (app.eligibility) throw new ApiError('Kimlik doğrulaması zaten başlatılmıştır.');
      const now = Date.now();
      app.phoneLink = { token: randomToken(), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + PHONE_LINK_TTL).toISOString() };
      log(app, 'Telefonla doğrulama için QR kod oluşturuldu', 'u');
    });
  }

  /** The phone page asks where its link stands. Needs no session and reveals nothing about the founder. */
  async phoneLinkStatus(token: string): Promise<PhoneLinkStatus> {
    await this.wait(300);
    const app = this.appByToken(token)?.[1];
    if (!app) return { state: 'invalid' };
    if (app.stage !== 'eligibility') return app.eligibility?.via === 'phone' ? { state: 'done' } : { state: 'invalid' };
    if (app.eligibility) return app.eligibility.via === 'phone' ? { state: 'running', startedAt: app.eligibility.startedAt } : { state: 'invalid' };
    return Date.now() > Date.parse(app.phoneLink!.expiresAt) ? { state: 'expired' } : { state: 'ready', expiresAt: app.phoneLink!.expiresAt };
  }

  /** The phone page's "Doğrulamayı başlat": same rules as on the computer, plus the link must be alive. */
  async startEligibilityByPhone(token: string, consent: boolean) {
    await this.wait(500);
    const email = this.appByToken(token)?.[0];
    if (!email) throw new ApiError('Bağlantı geçersizdir. Bilgisayarınızdaki sayfadan yeni bir QR kod oluşturunuz.');
    await this.mutate(email, ['eligibility'], (app) => {
      if (app.eligibility) return;
      if (Date.now() > Date.parse(app.phoneLink!.expiresAt)) throw new ApiError('Bağlantının süresi dolmuştur. Bilgisayarınızdaki sayfadan yeni bir QR kod oluşturunuz.');
      this.begin(app, consent, 'phone');
      app.phoneLink!.usedAt = app.eligibility!.startedAt;
    });
    return this.phoneLinkStatus(token);
  }

  /** The phone page saw the camera check through (in the mock the client's clock finishes time-based steps). */
  async completeIdentityByPhone(token: string) {
    const email = this.appByToken(token)?.[0];
    if (email) await this.completeIdentity(email);
    return this.phoneLinkStatus(token);
  }

  private appByToken(token: string): [string, Application] | undefined {
    if (!token) return undefined;
    return Object.entries(this.db().apps).find(([, a]) => a.phoneLink?.token === token);
  }

  /** From manual review: go back and correct the deck data (eligibility will run again). */
  async backToReview(email: string) {
    await this.wait(300);
    return this.mutate(email, ['manual', 'eligible', 'titleConflict'], (app) => {
      app.docs = app.docs.filter((d) => !d.group.startsWith('1 ·'));
      app.eligibility = undefined;
      app.phoneLink = undefined;
      app.titleCheck = undefined;
      app.stage = 'review';
      log(app, 'Sunum bilgileri düzeltme için yeniden açıldı', 'u');
    });
  }

  async proceedToPayment(email: string) {
    await this.wait(300);
    return this.mutate(email, ['eligible', 'manual'], (app) => {
      if (app.stage === 'manual') {
        app.eligibility!.manualAccepted = true;
        log(app, 'Manuel inceleme kaydıyla devam edildi', 'u');
      }
      app.stage = 'payment';
    });
  }

  // ------------------------------------------------------------------------ step 3 · ödeme

  async pay(email: string, card: { holder: string; number: string; expiry: string; cvv: string }) {
    await this.wait(1_100);
    const err = validateCard(card);
    if (err) throw new ApiError(err);
    return this.mutate(email, ['payment', 'threeDs'], (app) => {
      app.payment = { holder: card.holder.trim().toLocaleUpperCase('tr-TR'), last4: card.number.replace(/\D/g, '').slice(-4), amount: FEE_TOTAL };
      this.sendOtp(app);
      app.stage = 'threeDs';
    });
  }

  async resendOtp(email: string) {
    await this.wait(400);
    return this.mutate(email, ['threeDs'], (app) => this.sendOtp(app));
  }

  async cancel3ds(email: string) {
    return this.mutate(email, ['threeDs'], (app) => {
      app.payment = undefined;
      app.stage = 'payment';
    });
  }

  async confirm3ds(email: string, code: string) {
    await this.wait(1_000);
    return this.mutate(email, ['threeDs'], (app) => {
      const p = app.payment!;
      if (Date.now() - Date.parse(p.otpSentAt!) > 180_000) throw new ApiError('Kodun süresi doldu. Yeni kod isteyin.');
      if (code !== p.otp) throw new ApiError('Doğrulama kodu hatalı.');
      p.paidAt = nowIso();
      p.otp = undefined;
      log(app, `Ödeme alındı · ${tl(p.amount)}`, 'k');
      app.docs.push(...titleDocs(p.paidAt));
      app.stage = 'signing';
    });
  }

  private sendOtp(app: Application) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    app.payment!.otp = code;
    app.payment!.otpSentAt = nowIso();
    this.inbox.send({
      kind: 'sms',
      from: 'KARTBANK',
      title: 'KARTBANK',
      body: `${tl(app.payment!.amount)} tutarlı işleminiz için doğrulama kodunuz: ${code}. Kodu kimseyle paylaşmayın.`,
      code,
    });
  }

  // ------------------------------------------------------------------ step 4 · e-imza

  /**
   * D-4a pre-information: the founder has read what the call needs and ticked the consent (the
   * call is recorded; an e-signature is issued in their name). Kept on the application, so a
   * reload or a call that was ended does not ask again. Refused without the tick.
   */
  async acceptCallTerms(email: string, consent: boolean) {
    await this.wait(300);
    return this.mutate(email, ['signing'], (app) => {
      if (app.callConsentAt) return;
      if (!consent) throw new ApiError('Devam etmek için onay metnini işaretleyiniz.');
      app.callConsentAt = nowIso();
      log(app, 'Görüşme kaydı ve e-imza düzenlenmesi onaylandı', 'u');
    });
  }

  async startCall(email: string) {
    await this.wait(800);
    return this.mutate(email, ['signing'], (app) => {
      if (!app.callConsentAt) throw new ApiError('Görüşme başlamadan önce ön bilgilendirmeyi onaylayınız.');
      app.call = { startedAt: nowIso() };
      app.stage = 'calling';
      log(app, 'ESHS görüntülü görüşmesi başladı', 'k');
    });
  }

  async endCall(email: string) {
    return this.mutate(email, ['calling'], (app) => {
      app.call = undefined;
      app.stage = 'signing';
      log(app, 'Görüşme tamamlanmadan sonlandırıldı', 'u');
    });
  }

  async completeCall(email: string) {
    return this.mutate(email, ['calling'], (app) => this.issue(app, 'eshs'));
  }

  /** T.C. citizens: sign with an existing e-signature or a new one via e-Devlet. */
  async signResident(email: string, method: 'existing' | 'edevlet') {
    await this.wait(1_200);
    return this.mutate(email, ['signing'], (app) => this.issue(app, method));
  }

  private issue(app: Application, method: 'eshs' | 'existing' | 'edevlet') {
    const issuedAt = nowIso();
    const hex = () => Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
    const d = new Date();
    app.signature = {
      method,
      serial: `ESHS-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${hex()}-${hex()}-${hex()}`,
      holder: `${app.founder.firstName} ${app.founder.lastName}`,
      issuedAt,
      validUntil: new Date(Date.now() + 24 * 3600_000).toISOString(),
    };
    app.call = undefined;
    app.stage = 'signed';
    log(app, method === 'eshs' ? 'Günlük e-imza düzenlendi' : 'e-İmza doğrulandı', 'k');
    app.docs.push(...signatureDocs(issuedAt));
  }

  // ---------------------------------------------------------------- step 5 · kuruluş

  /**
   * D-4c "Kuruluşu başlat": the formation documents are signed with the founder's e-signature and
   * sent to the agencies. Refused unless the founder has confirmed exactly that on the screen;
   * the confirmation is logged as the founder's action and its time kept.
   */
  async startSetup(email: string, confirmed: boolean) {
    await this.wait(600);
    return this.mutate(email, ['signed'], (app) => {
      if (!confirmed) throw new ApiError('Devam etmek için belgelerinizin imzalanmasını onaylayınız.');
      const at = nowIso();
      app.setup = { startedAt: at, signConsentAt: at };
      app.stage = 'setup';
      log(app, 'Kuruluş belgelerinin e-imza ile imzalanması onaylandı', 'u');
      log(app, 'Kuruluş başlatıldı', 'u');
    });
  }

  async completeSetup(email: string) {
    return this.mutate(email, ['setup'], (app) => {
      const ev = setupEvents(app, 1, this.dur(DURATION.setup));
      app.logs.push(...ev.logs);
      app.docs.push(...ev.docs);
      app.setup!.finishedAt = ev.logs.at(-1)!.at;
      const rnd = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
      const vkn = rnd(10);
      app.results = {
        vkn: `${vkn.slice(0, 3)} ${vkn.slice(3, 6)} ${vkn.slice(6)}`,
        mersis: `0${rnd(3)} ${rnd(4)} ${rnd(4)} 0001`,
        iban: `TR${rnd(2)} 0001 2009 ${rnd(4)} ${rnd(4)} ${rnd(4)} ${rnd(2)}`,
        advisor: 'SMMM Ayşe Demir',
        advisorFirm: 'Terminal İstanbul Müşavirlik',
        taxOffice: 'Gebze Vergi Dairesi',
      };
      app.stage = 'done';
    });
  }

  // ------------------------------------------------------------------------- Terminal AI

  async ask(question: string): Promise<string> {
    await this.wait(1700);
    return answer(question);
  }

  // ------------------------------------------------------------------------------ demo

  /** Creates (or resets) the demo founder and fast-forwards their application to `stage`. */
  async seed(stage: Stage, founderType: FounderType = 'foreign') {
    const db = this.db();
    const resident = founderType === 'resident';
    const acc: Account = {
      email: resident ? 'mehmet.yilmaz@ornek.com.tr' : DEMO_ACCOUNT.email,
      password: resident ? '' : DEMO_ACCOUNT.password,
      firstName: resident ? 'Mehmet' : DEMO_ACCOUNT.firstName,
      lastName: resident ? 'Yılmaz' : DEMO_ACCOUNT.lastName,
      founderType,
      tckn: resident ? '10000000146' : undefined,
      verified: stage !== 'registered',
      createdAt: nowIso(),
    };
    db.users = db.users.filter((u) => u.email !== acc.email && (!acc.tckn || u.tckn !== acc.tckn));
    db.users.push(acc);
    delete db.apps[acc.email];
    if (stage !== 'registered') db.apps[acc.email] = newApplication(acc);
    this.save(db);
    if (stage === 'registered') this.sendEmailCode(acc.email);
    const settings = this.settings.state();
    this.settings.set({ forceConflict: false, forceManual: false, speed: 1000 });
    try {
      await fastForward(this, acc.email, stage);
    } finally {
      this.settings.set(settings);
    }
    return { account: clone(acc), app: clone(this.db().apps[acc.email] ?? null) };
  }

  reset() {
    localStorage.removeItem(DB_KEY);
  }

  // ---------------------------------------------------------------------------- internals

  private codes = new Map<string, string>();

  private sendEmailCode(email: string) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.codes.set(email, code);
    this.inbox.send({
      kind: 'mail',
      from: 'no-reply@dijitalsirket.gov.tr',
      title: 'E-posta doğrulama kodunuz',
      body: `Terminal Şirket hesabınızı doğrulamak için kodunuz: ${code}. 10 dakika geçerlidir.`,
      code,
    });
  }

  private dur(base: number) {
    return base / this.settings.speed();
  }

  private wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms / this.settings.speed()));
  }

  private db(): Db {
    try {
      const v = JSON.parse(localStorage.getItem(DB_KEY) ?? '');
      if (v && Array.isArray(v.users)) return upgrade(v);
    } catch {
      /* empty or corrupt store: start fresh */
    }
    return { users: [], apps: {} };
  }

  private save(db: Db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  private async mutate(emailIn: string, allowed: Stage[], fn: (app: Application, acc: Account) => void): Promise<Application> {
    const email = normEmail(emailIn);
    const db = this.db();
    const app = db.apps[email];
    const acc = db.users.find((u) => u.email === email);
    if (!app || !acc) throw new ApiError('Başvuru bulunamadı.');
    if (!allowed.includes(app.stage)) throw new ApiError('Bu işlem başvurunuzun şu anki adımında yapılamaz.');
    fn(app, acc);
    this.save(db);
    return clone(app);
  }
}

// ------------------------------------------------------------------------------- helpers

function newApplication(acc: Account): Application {
  const app: Application = {
    id: `DS-${String(new Date().getFullYear()).slice(2)}-${String(Math.floor(1000 + Math.random() * 9000))}`,
    createdAt: nowIso(),
    stage: 'verified',
    founderType: acc.founderType,
    founder: { firstName: acc.firstName, lastName: acc.lastName, nationality: '', passportNo: String(Math.floor(10_000_000 + Math.random() * 89_999_999)), tckn: acc.tckn },
    contact: { email: acc.email, phone: '', address: '', postalCode: '', country: '' },
    company: { deckName: '', root: '', activity: '', nace: [], suggestedNace: [], capital: CAPITAL },
    funding: 'own-abroad',
    marks: {},
    docs: [],
    logs: [],
  };
  log(app, 'Başvuru oluşturuldu', 's');
  return app;
}

/**
 * Applications saved before 2026-11-20 may sit at the removed `profile` stage (D-1e) or carry its
 * statement and comparison; they continue at the deck upload with those dropped.
 */
function upgrade(db: Db): Db {
  for (const app of Object.values(db.apps) as unknown as Record<string, unknown>[]) {
    if (app['stage'] === 'profile') app['stage'] = 'verified';
    delete app['profile'];
    delete app['crossCheck'];
  }
  return db;
}

function log(app: Application, text: string, who: LogEntry['who']) {
  app.logs.push({ at: nowIso(), text, who });
}

const normEmail = (e: string) => e.trim().toLocaleLowerCase('en-US');

const FIRST = ['Mehmet', 'Zeynep', 'Ahmet', 'Elif', 'Mustafa', 'Ayşe', 'Emre', 'Selin', 'Burak', 'Deniz'];
const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan'];
const asciiLower = (s: string) =>
  s.toLocaleLowerCase('tr-TR').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');

/** What (simulated) e-Devlet returns for a T.C. kimlik no — stable per number. */
export function edevletIdentity(tckn: string) {
  const d = tckn.split('').map(Number);
  const firstName = FIRST[(d[1] + d[3] + d[5]) % FIRST.length];
  const lastName = LAST[(d[2] + d[4] + d[6] + d[7]) % LAST.length];
  return { firstName, lastName, email: `${asciiLower(firstName)}.${asciiLower(lastName)}@ornek.com.tr` };
}

/** "acme-cloud-pitch_v3.pdf" → "Acme Cloud" */
/**
 * Stand-in for the logo a real scan would lift from the deck's first page: the brand's initials
 * on a tile whose colour is picked from the name. Returned as an SVG data URL so it needs no file.
 */
export function deckLogo(brand: string): string {
  const words = brand.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toLocaleUpperCase('tr-TR');
  const tiles = ['#0C217E', '#0F766E', '#7C2D92', '#B45309', '#1D4ED8', '#9F1239'];
  let h = 0;
  for (const ch of brand) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${tiles[h % tiles.length]}"/>` +
    `<text x="32" y="41" text-anchor="middle" font-family="IBM Plex Sans, Arial, sans-serif" font-size="25" font-weight="600" fill="#fff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function brandFromFile(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  const words = base
    .split(/[-_.\s]+/)
    .filter((w) => w && !/^(pitch|deck|sunum|investor|yatirimci|yatırımcı|ornek|örnek|sample|final|son|v\d+|\d+)$/i.test(w));
  return words.length ? titleCase(words.slice(0, 3).join(' ')) : 'Yeni Girişim';
}

/**
 * Two titles clash when one (ignoring the type suffix) is a word-prefix of the other,
 * e.g. "Acme Bulut Bilişim" vs registered "Acme Bulut Bilişim Hizmetleri A.Ş.".
 */
export function sameStem(a: string, b: string) {
  const words = (s: string) =>
    s.replace(/\s+(A\.Ş\.|Anonim Şirketi)$/i, '').toLocaleLowerCase('tr-TR').split(/\s+/).filter(Boolean);
  const [x, y] = [words(a), words(b)].sort((p, q) => p.length - q.length);
  return x.length >= 2 && x.every((w, i) => w === y[i]);
}

export function alternativesFor(root: string, candidate: string): string[] {
  return [`${root} Bulut Yazılım`, `${root}nova Bilişim`, `${root} Cloudline Teknoloji`, `${root} Dijital Çözümler`]
    .filter((t) => t !== candidate && !MERSIS_REGISTRY.some((r) => sameStem(r, t)))
    .slice(0, 3);
}

/**
 * What the simulated AI Reviewer "reads" from a deck. The downloadable sample deck
 * (public/assets/samples/lumora-analytics-pitch.pptx, built by tools/sample-deck in the deck format of
 * src/app/core/deck-format.json) returns exactly what is on its slides;
 * any other file gets a generic profile with two fields flagged for checking.
 * The founder's name and e-mail always come from the signed-in account (the applicant).
 */
interface DeckProfile {
  activity: string;
  nace: string[];
  suggestedNace: string[];
  nationality: string;
  contact: Omit<Application['contact'], 'email'>;
  funding: FundingSource;
  marks: Record<string, FieldMark>;
  pages: { title: number; nace: number; founder: number; contact: number; funding: number; total?: number };
}

export function deckProfile(fileName: string, founderType: FounderType): DeckProfile {
  if (/lumora/i.test(fileName)) {
    return {
      activity: 'Veri Analitiği',
      nace: ['62.01', '63.11', '62.02'],
      suggestedNace: [],
      nationality: 'Almanya',
      contact: { phone: '+49 151 2345 6789', address: 'Torstraße 45, Berlin', postalCode: '10119', country: 'Almanya' },
      funding: 'own-abroad',
      marks: {},
      pages: { title: 13, nace: 13, founder: 14, contact: 15, funding: 16, total: 16 },
    };
  }
  const foreign = founderType === 'foreign';
  return {
    activity: 'Bulut Bilişim',
    nace: ['62.01', '63.11'],
    suggestedNace: ['62.02'],
    nationality: foreign ? 'Birleşik Krallık' : 'Türkiye',
    contact: foreign
      ? { phone: '+44 7700 900123', address: '14 Baker Street, London', postalCode: 'NW1 6XE', country: 'Birleşik Krallık' }
      : { phone: '+90 532 410 2611', address: 'Bağdat Cad. No:212, Kadıköy / İstanbul', postalCode: '34728', country: 'Türkiye' },
    funding: 'own-abroad',
    marks: { phone: 'check', funding: 'check' },
    pages: { title: 1, nace: 7, founder: 11, contact: 12, funding: 10 },
  };
}

/** Drives the real API methods in order until the application reaches `want`. */
async function fastForward(api: MockApi, email: string, want: Stage) {
  if (want === 'registered' || want === 'verified') return;
  const resident = JSON.parse(localStorage.getItem(DB_KEY)!).apps[email].founderType === 'resident';
  await api.uploadDeck(email, { name: 'acme-cloud-pitch.pdf', size: 4_812_000 });
  if (want === 'scanning') return;
  await api.completeScan(email);
  if (want === 'review') return;
  // The demo deck's first title clashes in MERSİS; pick a free alternative unless we want the conflict.
  if (want === 'titleConflict') {
    await api.submitReview(email);
    return;
  }
  await api.updateReview(email, { company: { activity: 'Bulut Yazılım' }, funding: want === 'manual' ? 'third-party' : 'own-abroad' }, ['title']);
  await api.submitReview(email);
  if (want === 'eligibility') return; // D-2a opens on its pre-information view
  await api.startEligibility(email, true);
  await backdate(email, 'identity');
  await api.completeIdentity(email);
  if (want === 'declaration') return;
  await api.submitDeclaration(email, { file: { name: 'adres-belgesi.pdf', size: 412_000 }, declared: true });
  if (want === 'screening') return;
  await backdate(email, 'screening');
  await api.completeScreening(email);
  if (want === 'eligible' || want === 'manual') return;
  await api.proceedToPayment(email);
  if (want === 'payment') return;
  await api.pay(email, { holder: 'John Doe', number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' });
  if (want === 'threeDs') return;
  const otp = JSON.parse(localStorage.getItem(DB_KEY)!).apps[email].payment.otp as string;
  await api.confirm3ds(email, otp);
  if (want === 'signing') return;
  if (resident) {
    await api.signResident(email, 'existing');
  } else {
    await api.acceptCallTerms(email, true);
    await api.startCall(email);
    if (want === 'calling') return;
    await api.completeCall(email);
  }
  if (want === 'signed') return;
  await api.startSetup(email, true);
  if (want === 'setup') return;
  await backdate(email, 'setup');
  await api.completeSetup(email);
}

/** Moves a running process's start into the past so seeded data has realistic, ordered timestamps. */
async function backdate(email: string, which: 'identity' | 'screening' | 'setup') {
  const db = JSON.parse(localStorage.getItem(DB_KEY)!) as Db;
  const app = db.apps[email];
  const past = (ms: number) => new Date(Date.now() - ms).toISOString();
  if (which === 'identity') {
    // Far enough back that the declaration and the list search that follow still come after it.
    app.eligibility!.startedAt = app.eligibility!.consentAt = past(DURATION.identity + DURATION.screening + 4_000);
    app.logs.slice(-2).forEach((l) => (l.at = app.eligibility!.startedAt));
  } else if (which === 'screening') {
    const at = past(DURATION.screening);
    Object.assign(app.eligibility!, { declaredAt: at, screeningStartedAt: at, address: { ...app.eligibility!.address!, at } });
    app.logs.slice(-2).forEach((l) => (l.at = at));
  } else app.setup!.startedAt = past(DURATION.setup);
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// ------------------------------------------------------------------------------ Terminal AI

/**
 * Canned answers, matched by pattern. Written in the formal, impersonal register the owner asked
 * for on 2026-11-17 (no first person, no "siz" imperatives); the facts are the ones the earlier
 * wording stated. The side panel's suggested questions must each match one of these patterns.
 */
const ANSWERS: [RegExp, string][] = [
  [/sermaye kaynağı/i, 'Sermaye kaynağı, şirkete konacak paranın nereden geldiğini gösterir: kendi hesabınız, bir yatırımcı veya üçüncü bir taraf. Üçüncü taraf transferleri uyum ekibince incelenir.'],
  [/format|pdf|pptx|keynote|dosya/i, 'PDF, PowerPoint (.pptx) ve Keynote (.key) dosyaları kabul edilir; dosya boyutu en fazla 50 MB olabilir.'],
  [/gizli|kvkk|saklan|veri/i, 'Sunumunuz yalnızca başvurunuz kapsamında işlenir, KVKK uyarınca Türkiye’deki sunucularda şifreli olarak saklanır ve kurumlarla yalnızca gerekli alanlar paylaşılır.'],
  [/adres belgesi/i, 'Son üç ay içinde düzenlenmiş fatura, banka hesap özeti veya yerleşim yeri belgesi kabul edilir. Belge üzerinde adınız ve beyan ettiğiniz adres okunmalıdır.'],
  [/okun/i, 'Şirket adı, faaliyet alanı, kurucu, iletişim ve sermaye bilgileri okunur. Okunan her bilgi bir sonraki ekranda düzeltilebilir.'],
  [/anonim|neden a\.?ş|şirket türü/i, 'Tek pay sahipli anonim şirket, yabancı kurucuların tamamen çevrim içi kurabildiği ve yatırımcıların en çok tercih ettiği şirket türüdür.'],
  [/nace|faaliyet kodu/i, 'NACE kodları şirketinizin faaliyet alanını tanımlar; vergi ve SGK kayıtları bu kodlara göre açılır. Birden fazla kod seçilebilir.'],
  [/unvan|rezerv/i, 'Unvan MERSİS’te sorgulanır; benzer kayıtlı bir unvan bulunmuyorsa 30 gün süreyle rezerve edilir.'],
  [/sermaye|250/i, 'Anonim şirketler için asgari sermaye 250.000 TL’dir; %25’i (62.500 TL) tescil öncesinde banka hesabında bloke edilir.'],
  [/mrz/i, 'MRZ, pasaportun alt kısmında yer alan ve makine tarafından okunabilen iki satırdır; kimlik bilgileriniz bu satırlardan doğrulanır.'],
  [/liste|yaptırım|pep/i, 'BM, AB, OFAC SDN, ulusal malvarlığı dondurma ve PEP listelerinde tarama yapılır.'],
  [/manuel|ne kadar sür/i, 'Manuel inceleme en geç 2 iş günü içinde sonuçlanır; sonuç e-posta ile bildirilir.'],
  [/belge.*iste|hangi belge/i, 'Genellikle fon kaynağını gösteren banka dekontu veya transferi yapan tarafın kimlik belgesi istenir.'],
  [/fatura/i, 'Fatura başvuru sahibi adına kesilir; şirket kurulduktan sonra şirket adına yeniden düzenlenebilir.'],
  [/iade/i, 'Kurum harçları ödendikten sonra iade edilemez; kuruluş başlamadan önce başvuru iptal edilirse platform hizmet bedeli iade edilir.'],
  [/e-?imza nedir|e-?imza/i, 'Günlük e-imza, lisanslı e-imza sağlayıcısının (ESHS) operatörüyle yapılan görüntülü görüşmede düzenlenen ve 24 saat geçerli olan nitelikli elektronik imzadır.'],
  [/kayded|kayıt/i, 'Görüşme mevzuat gereği kaydedilir ve yalnızca e-imza sağlayıcısı tarafından saklanır.'],
  [/kamera/i, 'Kamerası bulunmayan bir cihazla devam edilemez. Kimlik adımındaki “Telefonla devam et” seçeneğiyle açılan QR kodu telefonunuzla okutarak doğrulamayı telefonunuzdan yapabilirsiniz.'],
  [/mali mühür/i, 'Mali mühür, e-Fatura ve e-Defter işlemlerinde kullanılan şirket elektronik mührüdür; TÜBİTAK Kamu SM tarafından düzenlenir.'],
  [/iban|banka/i, 'IBAN, Halkbank hesabınız açıldığında bu ekranda ve e-posta adresinizde bildirilir.'],
  [/müşavir/i, 'Kuruluşun sonunda Terminal İstanbul Müşavirlik tarafından bir SMMM atanır; ilk görüşme kuruluş ekranından talep edilebilir.'],
  [/yatır/i, 'Sermayenin %25’i Halkbank hesabınıza transfer edilmelidir; blokaj tescille birlikte kalkar.'],
];

function answer(q: string) {
  return ANSWERS.find(([re]) => re.test(q))?.[1] ?? 'Sorunuz başvurunuzla birlikte uyum ekibine iletilmiştir; en geç 1 iş günü içinde yanıtlanacaktır.';
}
