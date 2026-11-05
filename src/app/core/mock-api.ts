import { inject, Injectable } from '@angular/core';
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
  Stage,
} from './models';
import { DURATION, eligibilityEvents, setupEvents, signatureDocs, titleDocs } from './timeline';

/**
 * In-browser stand-in for the platform backend. Every method is async and returns fresh copies,
 * so a real HTTP client can replace this class without changing screens or the store.
 * Data lives in localStorage under `dsp.db.v1`.
 */

export class ApiError extends Error {}

export interface ReviewPatch {
  company?: Partial<Application['company']>;
  contact?: Partial<Application['contact']>;
  founder?: Partial<Application['founder']>;
  funding?: FundingSource;
}

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

@Injectable({ providedIn: 'root' })
export class MockApi {
  private readonly demo = inject(DemoSettings);
  private readonly inbox = inject(Inbox);

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
      app.company = { ...app.company, deckName: brand, root, activity: prof.activity, nace: prof.nace, suggestedNace: prof.suggestedNace };
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

  /** Submit the reviewed data: reserve the title in MERSİS, then start eligibility checks. */
  async submitReview(email: string) {
    await this.wait(1_200);
    return this.mutate(email, ['review', 'titleConflict'], (app) => this.reserveAndStart(app));
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
    if (hit || (firstCheck && this.demo.state().forceConflict)) {
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
    const manual = app.funding === 'third-party' || this.demo.state().forceManual;
    app.eligibility = {
      startedAt: nowIso(),
      score: Math.round((manual ? 96.5 + Math.random() : 97.5 + Math.random() * 1.5) * 10) / 10,
      result: manual ? 'manual' : 'eligible',
    };
    app.stage = 'eligibility';
  }

  // -------------------------------------------------------------------- step 2 · uygunluk

  async completeEligibility(email: string) {
    return this.mutate(email, ['eligibility'], (app) => {
      const ev = eligibilityEvents(app, this.dur(DURATION.eligibility));
      app.logs.push(...ev.logs);
      app.docs.push(...ev.docs);
      app.eligibility!.finishedAt = ev.listTimes[4];
      app.stage = app.eligibility!.result === 'manual' ? 'manual' : 'eligible';
    });
  }

  /** From manual review: go back and correct the deck data (eligibility will run again). */
  async backToReview(email: string) {
    await this.wait(300);
    return this.mutate(email, ['manual', 'eligible', 'titleConflict'], (app) => {
      app.docs = app.docs.filter((d) => !d.group.startsWith('1 ·'));
      app.eligibility = undefined;
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

  async startCall(email: string) {
    await this.wait(800);
    return this.mutate(email, ['signing'], (app) => {
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

  async startSetup(email: string) {
    await this.wait(600);
    return this.mutate(email, ['signed'], (app) => {
      app.setup = { startedAt: nowIso() };
      app.stage = 'setup';
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
    const settings = this.demo.state();
    this.demo.set({ forceConflict: false, forceManual: false, speed: 1000 });
    try {
      await fastForward(this, acc.email, stage);
    } finally {
      this.demo.set(settings);
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
      body: `Dijital Şirket Platformu hesabınızı doğrulamak için kodunuz: ${code}. 10 dakika geçerlidir.`,
      code,
    });
  }

  private dur(base: number) {
    return base / this.demo.speed();
  }

  private wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms / this.demo.speed()));
  }

  private db(): Db {
    try {
      const v = JSON.parse(localStorage.getItem(DB_KEY) ?? '');
      if (v && Array.isArray(v.users)) return v;
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
 * (public/assets/samples/lumora-analytics-pitch.pptx) returns exactly what is on its slides;
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
      pages: { title: 1, nace: 5, founder: 6, contact: 7, funding: 8, total: 9 },
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

export function luhn(num: string) {
  const d = num.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return d.length >= 13 && sum % 10 === 0;
}

export function validateCard(c: { holder: string; number: string; expiry: string; cvv: string }, now = new Date()): string | null {
  if (c.holder.trim().length < 3) return 'Kart üzerindeki adı yazın.';
  if (!luhn(c.number)) return 'Kart numarası geçersiz.';
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(c.expiry.trim());
  if (!m || +m[1] < 1 || +m[1] > 12) return 'Son kullanma tarihini AA/YY biçiminde yazın.';
  const end = new Date(2000 + +m[2], +m[1], 1);
  if (end <= now) return 'Kartın son kullanma tarihi geçmiş.';
  if (!/^\d{3,4}$/.test(c.cvv.trim())) return 'Güvenlik kodu (CVV) 3 veya 4 haneli olmalı.';
  return null;
}

export function validTckn(t: string) {
  if (!/^[1-9]\d{10}$/.test(t)) return false;
  const d = t.split('').map(Number);
  const d10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return ((d10 + 10) % 10) === d[9] && d11 === d[10];
}

export function passwordStrength(p: string): { score: 0 | 1 | 2 | 3 | 4; label: string; ok: boolean } {
  let score = 0;
  if (p.length >= 10) score++;
  if (/[a-zçğıöşü]/.test(p) && /[A-ZÇĞİÖŞÜ]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/.test(p)) score++;
  const s = (p.length < 10 ? Math.min(score, 1) : score) as 0 | 1 | 2 | 3 | 4;
  const label = ['Çok zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok güçlü'][s];
  return { score: s, label, ok: p.length >= 10 && s >= 3 };
}

export const FUNDING_OPTIONS: FundingSource[] = ['own-abroad', 'own-turkey', 'investor', 'third-party'];

/** Drives the real API methods in order until the application reaches `want`. */
async function fastForward(api: MockApi, email: string, want: Stage) {
  if (want === 'registered' || want === 'verified') return;
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
  if (want === 'eligibility') return;
  await backdate(email, 'eligibility');
  await api.completeEligibility(email);
  if (want === 'eligible' || want === 'manual') return;
  await api.proceedToPayment(email);
  if (want === 'payment') return;
  await api.pay(email, { holder: 'John Doe', number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' });
  if (want === 'threeDs') return;
  const otp = JSON.parse(localStorage.getItem(DB_KEY)!).apps[email].payment.otp as string;
  await api.confirm3ds(email, otp);
  if (want === 'signing') return;
  const resident = JSON.parse(localStorage.getItem(DB_KEY)!).apps[email].founderType === 'resident';
  if (resident) {
    await api.signResident(email, 'existing');
  } else {
    await api.startCall(email);
    if (want === 'calling') return;
    await api.completeCall(email);
  }
  if (want === 'signed') return;
  await api.startSetup(email);
  if (want === 'setup') return;
  await backdate(email, 'setup');
  await api.completeSetup(email);
}

/** Moves a running process's start into the past so seeded data has realistic, ordered timestamps. */
async function backdate(email: string, which: 'eligibility' | 'setup') {
  const db = JSON.parse(localStorage.getItem(DB_KEY)!) as Db;
  const app = db.apps[email];
  const ms = which === 'eligibility' ? DURATION.eligibility : DURATION.setup;
  if (which === 'eligibility') app.eligibility!.startedAt = new Date(Date.now() - ms).toISOString();
  else app.setup!.startedAt = new Date(Date.now() - ms).toISOString();
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// ------------------------------------------------------------------------------ Terminal AI

const ANSWERS: [RegExp, string][] = [
  [/format|pdf|pptx|keynote|dosya/i, 'PDF, PowerPoint (.pptx) ve Keynote (.key) dosyalarını okuyabilirim; en fazla 50 MB.'],
  [/gizli|kvkk|saklan|veri/i, 'Sunumunuz yalnızca başvurunuz için işlenir, KVKK kapsamında Türkiye’deki sunucularda şifreli saklanır ve kurumlarla yalnızca gerekli alanlar paylaşılır.'],
  [/anonim|neden a\.?ş|şirket türü/i, 'Tek pay sahipli anonim şirket, yabancı kurucuların tamamen çevrimiçi kurabildiği ve yatırımcıların en çok tercih ettiği türdür.'],
  [/nace|faaliyet kodu/i, 'NACE kodları şirketinizin faaliyet alanını tanımlar; vergi ve SGK kayıtları bu kodlara göre açılır. Birden fazla kod seçebilirsiniz.'],
  [/unvan|rezerv/i, 'Unvanınızı MERSİS’te sorgulayıp benzer kayıtlı unvan yoksa 30 gün süreyle rezerve ederim.'],
  [/sermaye|250/i, 'Anonim şirketler için asgari sermaye 250.000 TL’dir; %25’i (62.500 TL) tescil öncesi banka hesabında bloke edilir.'],
  [/mrz/i, 'MRZ, pasaportun alt kısmındaki makine tarafından okunabilir iki satırdır; kimlik bilgilerinizi buradan doğrularım.'],
  [/liste|yaptırım|pep/i, 'BM, AB, OFAC SDN, ulusal malvarlığı dondurma ve PEP listelerinde tarama yapılır.'],
  [/manuel|ne kadar sür/i, 'Manuel inceleme en geç 2 iş günü sürer; sonuç e-posta ile bildirilir.'],
  [/belge.*iste|hangi belge/i, 'Genellikle fon kaynağını gösteren banka dekontu veya transferi yapan tarafın kimlik belgesi istenir.'],
  [/fatura/i, 'Fatura başvuru sahibi adına kesilir; şirket kurulduktan sonra şirket adına yeniden düzenlenebilir.'],
  [/iade/i, 'Kurum harçları ödendikten sonra iade edilemez; kuruluş başlamadan önce iptal ederseniz platform bedeli iade edilir.'],
  [/e-?imza nedir|e-?imza/i, 'Günlük e-imza, ESHS operatörüyle görüntülü görüşmeyle düzenlenen ve 24 saat geçerli nitelikli elektronik imzadır.'],
  [/kayded|kayıt/i, 'Görüşme mevzuat gereği kaydedilir ve yalnızca ESHS tarafından saklanır.'],
  [/kamera/i, 'Kamerasız cihazdan devam edemezsiniz; telefonunuzla bu sayfayı açıp görüşmeyi oradan başlatabilirsiniz.'],
  [/mali mühür/i, 'Mali mühür, e-Fatura ve e-Defter için şirketinizin elektronik mührüdür; TÜBİTAK Kamu SM düzenler.'],
  [/iban|banka/i, 'IBAN, Halkbank hesabınız açılınca bu panelde ve e-postanızda görünür.'],
  [/müşavir/i, 'Kuruluş sonunda Terminal İstanbul Müşavirlik’ten bir SMMM atanır; ilk görüşmeyi buradan planlayabilirsiniz.'],
  [/yatır/i, 'Sermayenin %25’ini Halkbank hesabınıza transfer edin; blokaj tescille birlikte kalkar.'],
];

function answer(q: string) {
  return ANSWERS.find(([re]) => re.test(q))?.[1] ?? 'Bu konuda size yardımcı olayım: sorunuzu başvurunuzla birlikte uyum ekibine iletiyorum, en geç 1 iş günü içinde yanıtlanır.';
}
