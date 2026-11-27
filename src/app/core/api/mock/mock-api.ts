import { inject, Injectable } from '@angular/core';
import type { Api, DemoTools, ReviewPatch, SimulatedWork } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoSettings, EvaluationOutcome } from '@core/api/demo/demo-settings';
import ACTIVITY_GROUPS from './evaluation-activity-groups.json';
import EVALUATION_DICTIONARY from './evaluation-reference.json';
import { titleCase, tl } from '@core/utils/format';
import { Inbox } from '@core/services/inbox';
import {
  Account,
  ANSWER_MAX,
  Application,
  CAPITAL,
  DeckConsents,
  EvaluationAnswers,
  EvaluationQuestions,
  EvaluationReference,
  FEE_TOTAL,
  FUNDING_LABELS,
  FounderType,
  FundingSource,
  LogEntry,
  Profile,
  PhoneLinkStatus,
  QuestionAnswer,
  Sector,
  SECTORS,
  Stage,
  WizardReference,
} from '@core/models/models';
import { NACE } from '@core/reference/nace';
import {
  ADDRESS_DOC_MAX,
  DECK_CONSENT_ERROR,
  evaluationErrors,
  FUNDING_OPTIONS,
  proposedTitle,
  sameStem,
  titleAlternatives,
  validateCard,
  validTckn,
  withoutSuffix,
} from '@core/utils/rules';
import { DURATION, identityEvents, screeningEvents, setupEvents, signatureDocs, titleDocs } from '@core/reference/timeline';

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
export { ApiError } from '@core/api/api-error';
export type { ReviewPatch } from '@core/api/api';
export { ADDRESS_DOC_MAX, FUNDING_OPTIONS, luhn, passwordStrength, sameStem, validateCard, validTckn } from '@core/utils/rules';

/**
 * An account as the mock stores it. The password is kept in plain text in the browser: prototype
 * only (see AGENTS.md). It never leaves this file: every method hands out `Account`, without it.
 */
interface MockAccount extends Account {
  password: string;
  tckn?: string;
  createdAt: string;
}

interface Db {
  users: MockAccount[];
  apps: Record<string, Application>;
  /** Open password-reset links: token → address and expiry. Single use. */
  resets?: Record<string, { email: string; expiresAt: string }>;
  /**
   * How the running evaluation of each founder (by e-mail) will end, fixed at the upload: `rejected`
   * when the deck's page count is outside the limits, else the demo panel's choice. Not on the
   * application, because the API does not tell the founder anything of the kind in advance.
   */
  outcomes?: Record<string, EvaluationOutcome>;
}

const DB_KEY = 'dsp.db.v1';
/** Who is signed in to the mock: the founder's e-mail. Mock mode only; HTTP mode has a server session. */
const SESSION_KEY = 'dsp.session.v1';
/** The last e-mail typed on a sign-in screen (demo convenience, see `DemoTools.rememberEmail`). */
const LAST_EMAIL_KEY = 'dsp.lastEmail';
/** How long a password-reset link works, as on the API. */
const RESET_TTL = 30 * 60_000;

/** Same code and status as the API's answer without a session, so the store treats both alike. */
const notSignedIn = () => new ApiError('Oturumunuz bulunamadı. Lütfen giriş yapınız.', { code: 'unauthenticated', status: 401 });

/** Titles already registered in the simulated MERSİS. */
export const MERSIS_REGISTRY = [
  'Acme Bulut Bilişim Hizmetleri A.Ş.',
  'Galata Bulut Bilişim A.Ş.',
  'Anadolu Yazılım Teknolojileri A.Ş.',
  'Boğaziçi Veri Hizmetleri A.Ş.',
];

export const DEMO_ACCOUNT = { email: 'john.doe@acme.com', password: 'Acme-2026!', firstName: 'John', lastName: 'Doe' };

const clone = <T>(v: T): T => structuredClone(v);

/**
 * The mock's answer to `GET /api/reference/evaluation`: the saved dictionary with each activity's
 * `groupId` from `evaluation-activity-groups.json`, a copy of the API's derived mapping
 * (2026-11-26). That mapping is DERIVED BY US, NOT FROM STB, and still to be confirmed (its `note`).
 */
const EVALUATION_REFERENCE: EvaluationReference = (() => {
  const groupOf = new Map(ACTIVITY_GROUPS.groups.flatMap((g) => g.activityIds.map((id) => [id, g.groupId] as const)));
  return { ...EVALUATION_DICTIONARY, activities: EVALUATION_DICTIONARY.activities.map((a) => ({ ...a, groupId: groupOf.get(a.id) })) };
})();
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
    onExternalChange: (callback) =>
      addEventListener('storage', (e) => {
        if (e.key === DB_KEY || e.key === SESSION_KEY) callback();
      }),
    rememberedEmail: () => localStorage.getItem(LAST_EMAIL_KEY) ?? '',
    rememberEmail: (email) => localStorage.setItem(LAST_EMAIL_KEY, email.trim()),
  };

  /**
   * Nothing runs in the background here: the store finishes each simulated step with timers by
   * calling `complete` (see `Api.work`). HTTP mode polls the server instead.
   */
  readonly work: SimulatedWork = {
    kind: 'simulated',
    complete: (stage) => {
      switch (stage) {
        case 'evaluating':
          return this.completeEvaluation();
        case 'titleChecking':
          return this.completeTitleCheck();
        case 'eligibility':
          return this.completeIdentity();
        case 'screening':
          return this.completeScreening();
        case 'calling':
          return this.completeCall();
        case 'setup':
          return this.completeSetup();
        default:
          return null;
      }
    },
  };

  /** The portal's own constants in the shape of the API's `GET /api/reference/wizard` (NACE: a copy of API migration 0010). */
  async reference(): Promise<WizardReference> {
    return {
      sectors: (Object.keys(SECTORS) as Sector[]).map((key) => ({ key, label: SECTORS[key].label, naceCodes: SECTORS[key].nace })),
      funding: FUNDING_OPTIONS.map((key) => ({ key, label: FUNDING_LABELS[key] })),
      naceCodes: Object.keys(NACE)
        .sort()
        .map((code) => ({ code, title: NACE[code].title, translationKey: NACE[code].translationKey })),
    };
  }

  /** The saved dictionary of the outside evaluation service (2026-11-25) with the derived groups, in the API's shape. */
  async evaluationReference(): Promise<EvaluationReference> {
    return clone(EVALUATION_REFERENCE);
  }

  /**
   * The signed-in founder's e-mail: the mock's stand-in for the API's session cookie. Set by
   * verifyEmail, login, edevlet, seed and restore; cleared by logout and reset. Also written to
   * `dsp.session.v1` so a reload or another tab finds it (see `restore`).
   */
  private current: string | null = null;

  private signIn(email: string | null) {
    this.current = email;
    if (email) localStorage.setItem(SESSION_KEY, email);
    else localStorage.removeItem(SESSION_KEY);
  }

  /** The signed-in founder's e-mail, or the API's 401. */
  private who(): string {
    if (!this.current) throw notSignedIn();
    return this.current;
  }

  // ------------------------------------------------------------------------------------- auth

  /**
   * Unlike the API, the mock still says when the address is taken (the API answers 202 either way
   * and tells the owner by e-mail). Kept as it was; see docs/api-client.md.
   */
  async register(input: { firstName: string; lastName: string; email: string; password: string }): Promise<void> {
    await this.wait(700);
    const email = normEmail(input.email);
    const db = this.db();
    if (db.users.some((u) => u.email === email)) throw new ApiError('Bu e-posta adresiyle bir hesap zaten var. Giriş yapın.');
    const acc: MockAccount = {
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
    this.signIn(acc.email);
    return { account: publicAccount(acc), app: clone(db.apps[acc.email]), created };
  }

  /** Same refusals as the API: one message for every wrong pair, and a new code for an unconfirmed address. */
  async login(emailIn: string, password: string) {
    await this.wait(600);
    const db = this.db();
    const acc = db.users.find((u) => u.email === normEmail(emailIn));
    if (!acc || acc.password !== password || !password) throw new ApiError('E-posta veya şifre hatalı.', { code: 'invalid_credentials', status: 401 });
    if (!acc.verified) {
      this.sendEmailCode(acc.email);
      throw new ApiError('E-posta adresiniz henüz doğrulanmadı. Size yeni bir kod gönderdik.', { code: 'email_not_verified', status: 403 });
    }
    this.signIn(acc.email);
    return { account: publicAccount(acc), app: clone(db.apps[acc.email] ?? null) };
  }

  async logout() {
    this.signIn(null);
  }

  /** The founder this browser was signed in as (`dsp.session.v1`), if the account still exists and is confirmed. */
  async restore() {
    const email = localStorage.getItem(SESSION_KEY);
    const acc = email ? this.db().users.find((u) => u.email === email && u.verified) : undefined;
    if (!acc) {
      this.signIn(null);
      return null;
    }
    this.current = acc.email;
    return { account: publicAccount(acc), app: clone(this.db().apps[acc.email] ?? null) };
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
    this.signIn(email);
    return { account: publicAccount(acc), app: clone(db.apps[email]) };
  }

  /**
   * Always succeeds so the response never reveals whether an account exists. For a known address
   * the Inbox shows the e-mail with a working link to the set-new-password screen, as the API's
   * e-mail does (`/sifre-sifirla?token=…`, 30 minutes, single use).
   */
  async requestPasswordReset(emailIn: string) {
    await this.wait(700);
    const email = normEmail(emailIn);
    const db = this.db();
    if (!db.users.some((u) => u.email === email)) return;
    const token = randomToken();
    db.resets = { ...db.resets, [token]: { email, expiresAt: new Date(Date.now() + RESET_TTL).toISOString() } };
    this.save(db);
    this.inbox.send({
      kind: 'mail',
      from: 'no-reply@dijitalsirket.gov.tr',
      title: 'Şifre sıfırlama bağlantısı',
      body: `${email} için şifre sıfırlama bağlantısı. 30 dakika geçerlidir.`,
      link: { url: `/sifre-sifirla?token=${token}`, label: 'Yeni şifre belirle' },
    });
  }

  /** Same rules as the API: a live single-use link, a password of 10 to 128 characters; signs the founder out. */
  async confirmPasswordReset(token: string, password: string) {
    await this.wait(700);
    const db = this.db();
    const reset = db.resets?.[token];
    const acc = reset && Date.now() <= Date.parse(reset.expiresAt) ? db.users.find((u) => u.email === reset.email) : undefined;
    if (!acc) throw new ApiError('Bağlantı geçersiz veya süresi dolmuş. Yeniden şifre sıfırlama isteyiniz.', { code: 'link_invalid', status: 422 });
    if (password.length < 10) throw new ApiError('Şifre en az 10 karakter olmalıdır.', { code: 'validation_failed', status: 400, fields: { password: ['Şifre en az 10 karakter olmalıdır.'] } });
    if (password.length > 128) throw new ApiError('Şifre en fazla 128 karakter olabilir.', { code: 'validation_failed', status: 400, fields: { password: ['Şifre en fazla 128 karakter olabilir.'] } });
    acc.password = password;
    delete db.resets![token];
    this.save(db);
    // The API ends every session of the account; the mock has one.
    if (this.current === acc.email) this.signIn(null);
  }

  // ------------------------------------------------------------------------- step 1 · sunum

  /**
   * D-1e: what the founder states before the deck. Kept as given; after the evaluation its values
   * are the company form's defaults (see `completeEvaluation`). It may be saved again until a deck is
   * uploaded; each save replaces the last (the API keeps every version with its time).
   * Same rules and messages as the API's SubmitProfileHandler.
   */
  async submitProfile(input: Omit<Profile, 'at'>) {
    await this.wait(400);
    const brand = input.brand.trim().replace(/\s+/g, ' ');
    if (brand.length < 2 || brand.length > 120) throw new ApiError('Şirketinizin veya markanızın adını yazınız.');
    // API step 24: at least one code, all from the list the reference offers.
    const naceCodes = [...new Set(input.naceCodes.map((c) => c.trim()))];
    if (!naceCodes.length || naceCodes.length > 20) throw new ApiError('Faaliyet alanını seçiniz.');
    if (naceCodes.some((c) => !(c in NACE))) throw new ApiError('Faaliyet alanını listeden seçiniz.');
    if (!FUNDING_OPTIONS.includes(input.funding)) throw new ApiError('Sermaye kaynağını seçiniz.');
    if (!input.nationality.trim() || input.nationality.length > 60) throw new ApiError('Uyruğunuzu seçiniz.');
    if (!input.country.trim() || input.country.length > 60) throw new ApiError('Yaşadığınız ülkeyi seçiniz.');
    const digits = input.phone.replace(/\D/g, '').length;
    if (digits < 8 || digits > 15) throw new ApiError('Telefon numaranızı eksiksiz yazınız.');
    return this.mutate(['profile', 'verified'], (app) => {
      const again = !!app.profile;
      app.profile = { brand, naceCodes, funding: input.funding, nationality: input.nationality.trim(), phone: input.phone.trim(), country: input.country.trim(), at: nowIso() };
      app.stage = 'verified';
      log(app, again ? 'Ön bilgiler güncellendi' : 'Ön bilgiler kaydedildi', 'u');
    });
  }

  /**
   * D-1a: the deck, the CV and the five answers, with the founder's two ticks for this upload. The
   * same refusals as the API: without both ticks, without a profile, and `validation_failed` with the
   * fields `rules.evaluationErrors` names. The mock keeps only the files' names and sizes; it counts
   * the deck's pages when it can read them (a PDF it cannot read is not refused here, as the API
   * leaves the page count to the evaluation service).
   */
  async uploadDeck(files: { deck: File; cv: File }, answers: EvaluationAnswers, consents: DeckConsents) {
    await this.wait(500);
    if (!consents.noticeAcknowledged || !consents.aiConsent) throw new ApiError(DECK_CONSENT_ERROR);
    const ref = EVALUATION_REFERENCE;
    const errors = evaluationErrors({ ...answers, deck: files.deck, cv: files.cv }, ref.limits, ref);
    if (Object.keys(errors).length) {
      throw new ApiError('Gönderdiğiniz bilgiler eksik veya hatalıdır.', {
        code: 'validation_failed',
        status: 400,
        fields: Object.fromEntries(Object.entries(errors).map(([k, m]) => [k, [m as string]])),
      });
    }
    const pages = await pdfPageCount(files.deck);
    const outcome: EvaluationOutcome = pages !== null && (pages < ref.limits.deckMinPages || pages > ref.limits.deckMaxPages) ? 'rejected' : this.settings.state().evaluationOutcome;
    const email = this.who();
    const app = await this.mutate(['profile', 'verified'], (app) => {
      if (!app.profile) throw new ApiError('Önce ön bilgileri doldurunuz.');
      const kb = (f: File) => Math.max(1, Math.round(f.size / 1024));
      app.deck = { fileName: files.deck.name, sizeKb: kb(files.deck) };
      app.cv = { fileName: files.cv.name, sizeKb: kb(files.cv) };
      app.evaluation = { status: 'running', attempt: 1, maxAttempts: 3, startedAt: nowIso(), finishedAt: null, reason: null };
      app.titleCheck = undefined;
      app.stage = 'evaluating';
      log(app, 'Aydınlatma metni okundu (sunum)', 'u');
      log(app, 'Sunum, özgeçmiş ve yanıtların değerlendirme hizmetine aktarılmasına onay verildi', 'u');
      log(app, `Sunum ve özgeçmiş yüklendi · ${files.deck.name}, ${files.cv.name}`, 'u');
      log(app, 'Değerlendirme başladı', 's');
    });
    const db = this.db();
    db.outcomes = { ...db.outcomes, [email]: outcome };
    this.save(db);
    return app;
  }

  /**
   * The simulated outside evaluation ends (after `DURATION.evaluation`, or at once when seeding).
   * `done`: the company form opens with defaults from the profile and the account, marked `profile`;
   * the title and the NACE codes are left for the founder. `questions`: a stop state. `failed` and
   * `rejected`: back to the upload, as on the API.
   */
  async completeEvaluation(outcome?: EvaluationOutcome) {
    const email = this.who();
    const end = outcome ?? this.db().outcomes?.[email] ?? 'done';
    const app = await this.mutate(['evaluating'], (app, acc) => {
      const e = app.evaluation!;
      e.finishedAt = end === 'questions' ? null : nowIso();
      if (end === 'questions') {
        e.status = 'questions';
        app.stage = 'evaluationQuestions';
        log(app, 'Değerlendirme için ek bilgi gerekiyor', 's');
        return;
      }
      if (end === 'failed' || end === 'rejected') {
        e.status = end;
        app.stage = 'verified';
        log(app, end === 'rejected' ? 'Sunum değerlendirmeye alınamadı' : 'Değerlendirme tamamlanamadı', 's');
        return;
      }
      e.status = 'done';
      const p = app.profile!;
      // Title and codes are proposed from the profile like the API's defaults: the brand as an
      // anonim şirket title (none when it would not pass the title check); the profile's NACE codes (API step 24).
      const title = proposedTitle(p.brand);
      const [root = '', ...activity] = title ? withoutSuffixWords(title).split(' ') : [];
      const nace = [...p.naceCodes];
      app.company = { ...app.company, brand: p.brand, root, activity: activity.join(' '), nace, suggestedNace: [...p.naceCodes] };
      app.founder = { ...app.founder, firstName: acc.firstName, lastName: acc.lastName, nationality: p.nationality };
      app.contact = { email: acc.email, phone: p.phone, address: '', postalCode: '', country: p.country };
      app.funding = p.funding;
      app.marks = { name: 'profile', email: 'profile', phone: 'profile', address: 'profile', funding: 'profile' };
      if (title) app.marks['title'] = 'profile';
      if (nace.length) app.marks['nace'] = 'profile';
      app.stage = 'review';
      log(app, 'Değerlendirme tamamlandı', 's');
    });
    const db = this.db();
    if (db.outcomes) delete db.outcomes[email];
    this.save(db);
    return app;
  }

  /** D-1g: the questions, in the evaluation service's format (as the API passes them on); 404 at any other stage. */
  async evaluationQuestions(): Promise<EvaluationQuestions> {
    await this.wait(300);
    const app = this.db().apps[normEmail(this.who())];
    if (app?.stage !== 'evaluationQuestions') throw new ApiError('Yanıtlanacak soru yok.', { code: 'no_questions', status: 404 });
    return { answerable: true, receivedAt: app.evaluation?.startedAt ?? nowIso(), cards: structuredClone(MOCK_QUESTIONS) };
  }

  /** D-1g: the same checks as the API (`answers.<card id>`); then the evaluation goes on and is done after `DURATION.evaluation`. */
  async answerEvaluation(answers: QuestionAnswer[]) {
    await this.wait(600);
    const fields: Record<string, string[]> = {};
    if (answers.some((a) => !MOCK_QUESTIONS.some((c) => c.id === a.targetFactId))) fields['answers'] = ['Yanıtlar sorularla eşleşmiyor; sayfayı yenileyip tekrar deneyiniz.'];
    for (const card of MOCK_QUESTIONS) {
      const answer = answers.find((a) => a.targetFactId === card.id);
      const option = card.options.find((o) => o.id === answer?.optionId);
      const explanation = answer?.explanation?.trim() ?? '';
      if (!option) fields[`answers.${card.id}`] = [answer ? 'Seçeneklerden birini seçiniz.' : 'Bu soruyu yanıtlayınız.'];
      else if (explanation.length > ANSWER_MAX) fields[`answers.${card.id}`] = [`Açıklama en fazla ${ANSWER_MAX} karakter olabilir.`];
      else if (option.explanationRequired && !explanation) fields[`answers.${card.id}`] = ['Bu seçenek için açıklama yazınız.'];
    }
    if (Object.keys(fields).length) throw new ApiError('Eksik veya hatalı yanıtları düzeltiniz.', { code: 'validation_failed', status: 400, fields });
    return this.mutate(['evaluationQuestions'], (app) => {
      app.evaluation = { ...app.evaluation!, status: 'running', finishedAt: null };
      app.stage = 'evaluating';
      log(app, 'Ek sorular yanıtlandı; değerlendirme sürüyor', 'u');
    });
  }

  async updateReview(patch: ReviewPatch, edited: string[]) {
    return this.mutate(['review', 'titleConflict'], (app) => {
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

  /**
   * Submit the reviewed data: the title is asked of MERSİS (stage `titleChecking`). The simulated
   * answer comes from `completeTitleCheck` after `DURATION.titleCheck`, as the API's comes from staff.
   */
  async submitReview() {
    await this.wait(1_200);
    return this.mutate(['review', 'titleConflict'], (app) => {
      if (!app.company.root.trim()) throw new ApiError('Şirket unvanını yazınız.');
      if (app.company.nace.length === 0) throw new ApiError('En az bir NACE faaliyet kodu seçiniz.');
      log(app, 'Başvuru bilgileri onaylandı', 'u');
      this.requestTitle(app);
    });
  }

  /** D-1d: another title, only after a refused one (as on the API). */
  async chooseTitle(title: string) {
    await this.wait(1_000);
    if (withoutSuffixWords(title).length < 3) throw new ApiError('Yeni bir unvan yazınız.');
    return this.mutate(['titleConflict'], (app) => {
      const [root, ...rest] = withoutSuffixWords(title).split(/\s+/);
      app.company.root = root;
      app.company.activity = rest.join(' ');
      app.marks['title'] = 'edited';
      log(app, 'Şirket unvanı düzenlendi', 'u');
      this.requestTitle(app);
    });
  }

  private requestTitle(app: Application) {
    const candidate = `${app.company.root} ${app.company.activity}`.trim();
    app.titleCheck = { status: 'checking', candidate, requestedAt: nowIso() };
    app.stage = 'titleChecking';
    log(app, TITLE_ASKED, 's');
  }

  /** The simulated MERSİS answer: a clash with a registered title (or the demo panel's forced conflict on the first check) is refused. */
  async completeTitleCheck() {
    return this.mutate(['titleChecking'], (app) => {
      const candidate = app.titleCheck?.candidate ?? `${app.company.root} ${app.company.activity}`.trim();
      const firstCheck = app.logs.filter((l) => l.text === TITLE_ASKED).length <= 1;
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
      this.reserved(app, candidate);
    });
  }

  private reserved(app: Application, candidate: string) {
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
  async startEligibility(consent: boolean) {
    await this.wait(500);
    return this.mutate(['eligibility'], (app) => {
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
  async completeIdentity() {
    return this.finishIdentity(this.who());
  }

  /** Shared by the computer (signed in) and the phone page (which has only its link). */
  private finishIdentity(email: string) {
    return this.mutateFor(email, ['eligibility'], (app) => {
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
  async submitDeclaration(input: { file: Pick<File, 'name' | 'size'> | null; declared: boolean }) {
    await this.wait(700);
    return this.mutate(['declaration'], (app) => {
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
  async completeScreening() {
    return this.mutate(['screening'], (app) => {
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
  async createPhoneLink() {
    await this.wait(400);
    return this.mutate(['eligibility'], (app) => {
      if (app.eligibility) throw new ApiError('Kimlik doğrulaması zaten başlatılmıştır.');
      const now = Date.now();
      app.phoneLink = { token: randomToken(), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + PHONE_LINK_TTL).toISOString() };
      log(app, 'Telefonla doğrulama için QR kod oluşturuldu', 'u');
    });
  }

  /** The mock's link lives in its data (the demo navigator reuses it), so leaving the QR view changes nothing here. */
  forgetPhoneLink(): Application | null {
    return null;
  }

  /** The phone page asks where its link stands. Needs no session and reveals nothing about the founder. */
  async phoneLinkStatus(token: string): Promise<PhoneLinkStatus> {
    await this.wait(300);
    const app = this.appByToken(token)?.[1];
    if (!app) return { state: 'invalid' };
    if (app.stage !== 'eligibility') return app.eligibility?.via === 'phone' ? { state: 'done' } : { state: 'invalid' };
    if (app.eligibility) return app.eligibility.via === 'phone' ? { state: 'running', startedAt: app.eligibility.startedAt! } : { state: 'invalid' };
    return Date.now() > Date.parse(app.phoneLink!.expiresAt) ? { state: 'expired' } : { state: 'ready', expiresAt: app.phoneLink!.expiresAt };
  }

  /** The phone page's "Doğrulamayı başlat": same rules as on the computer, plus the link must be alive. */
  async startEligibilityByPhone(token: string, consent: boolean) {
    await this.wait(500);
    const email = this.appByToken(token)?.[0];
    if (!email) throw new ApiError('Bağlantı geçersizdir. Bilgisayarınızdaki sayfadan yeni bir QR kod oluşturunuz.');
    await this.mutateFor(email, ['eligibility'], (app) => {
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
    if (email) await this.finishIdentity(email);
    return this.phoneLinkStatus(token);
  }

  private appByToken(token: string): [string, Application] | undefined {
    if (!token) return undefined;
    return Object.entries(this.db().apps).find(([, a]) => a.phoneLink?.token === token);
  }

  /** From manual review: go back and correct the deck data (eligibility will run again). */
  async backToReview() {
    await this.wait(300);
    return this.mutate(['manual', 'eligible', 'titleConflict'], (app) => {
      app.docs = app.docs.filter((d) => !d.group.startsWith('1 ·'));
      app.eligibility = undefined;
      app.phoneLink = undefined;
      app.titleCheck = undefined;
      app.stage = 'review';
      log(app, 'Sunum bilgileri düzeltme için yeniden açıldı', 'u');
    });
  }

  async proceedToPayment() {
    await this.wait(300);
    return this.mutate(['eligible', 'manual'], (app) => {
      if (app.stage === 'manual') {
        app.eligibility!.manualAccepted = true;
        log(app, 'Manuel inceleme kaydıyla devam edildi', 'u');
      }
      app.stage = 'payment';
    });
  }

  // ------------------------------------------------------------------------ step 3 · ödeme

  async pay(card: { holder: string; number: string; expiry: string; cvv: string }) {
    await this.wait(1_100);
    const err = validateCard(card);
    if (err) throw new ApiError(err);
    return this.mutate(['payment', 'threeDs'], (app) => {
      app.payment = { holder: card.holder.trim().toLocaleUpperCase('tr-TR'), last4: card.number.replace(/\D/g, '').slice(-4), amount: FEE_TOTAL };
      this.sendOtp(app);
      app.stage = 'threeDs';
    });
  }

  async resendOtp() {
    await this.wait(400);
    return this.mutate(['threeDs'], (app) => this.sendOtp(app));
  }

  async cancel3ds() {
    return this.mutate(['threeDs'], (app) => {
      app.payment = undefined;
      app.stage = 'payment';
    });
  }

  async confirm3ds(code: string) {
    await this.wait(1_000);
    return this.mutate(['threeDs'], (app) => {
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
  async acceptCallTerms(consent: boolean) {
    await this.wait(300);
    return this.mutate(['signing'], (app) => {
      if (app.callConsentAt) return;
      if (!consent) throw new ApiError('Devam etmek için onay metnini işaretleyiniz.');
      app.callConsentAt = nowIso();
      log(app, 'Görüşme kaydı ve e-imza düzenlenmesi onaylandı', 'u');
    });
  }

  async startCall() {
    await this.wait(800);
    return this.mutate(['signing'], (app) => {
      if (!app.callConsentAt) throw new ApiError('Görüşme başlamadan önce ön bilgilendirmeyi onaylayınız.');
      app.call = { startedAt: nowIso() };
      app.stage = 'calling';
      log(app, 'ESHS görüntülü görüşmesi başladı', 'k');
    });
  }

  async endCall() {
    return this.mutate(['calling'], (app) => {
      app.call = undefined;
      app.stage = 'signing';
      log(app, 'Görüşme tamamlanmadan sonlandırıldı', 'u');
    });
  }

  async completeCall() {
    return this.mutate(['calling'], (app) => this.issue(app, 'eshs'));
  }

  /** T.C. citizens: sign with an existing e-signature or a new one via e-Devlet. */
  async signResident(method: 'existing' | 'edevlet') {
    await this.wait(1_200);
    return this.mutate(['signing'], (app) => this.issue(app, method));
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
  async startSetup(confirmed: boolean) {
    await this.wait(600);
    return this.mutate(['signed'], (app) => {
      if (!confirmed) throw new ApiError('Devam etmek için belgelerinizin imzalanmasını onaylayınız.');
      const at = nowIso();
      app.setup = { startedAt: at, signConsentAt: at };
      app.stage = 'setup';
      log(app, 'Kuruluş belgelerinin e-imza ile imzalanması onaylandı', 'u');
      log(app, 'Kuruluş başlatıldı', 'u');
    });
  }

  async completeSetup() {
    return this.mutate(['setup'], (app) => {
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
    const acc: MockAccount = {
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
    // Seeding signs in as the demo founder, except before the e-mail is confirmed (no session yet).
    this.signIn(stage === 'registered' ? null : acc.email);
    const settings = this.settings.state();
    this.settings.set({ forceConflict: false, forceManual: false, speed: 1000 });
    try {
      await fastForward(this, acc.email, stage);
    } finally {
      this.settings.set(settings);
    }
    return { account: publicAccount(acc), app: clone(this.db().apps[acc.email] ?? null) };
  }

  reset() {
    localStorage.removeItem(DB_KEY);
    this.signIn(null);
  }

  // ------------------------------------------------------------- second factor (demo only)
  // The mock demands no second factor: none of its actions refuses with `step_up_required`. Which
  // actions need one is still the owner's decision, and the mock is what the product is shown with.
  // These two exist only so the dialog can be opened from the `/screens` index; the code goes to
  // the Inbox like the mock's other e-mails.

  private stepUpCode: string | null = null;

  async sendStepUpCode() {
    await this.wait(400);
    this.stepUpCode = String(Math.floor(100000 + Math.random() * 900000));
    this.inbox.send({
      kind: 'mail',
      from: 'no-reply@dijitalsirket.gov.tr',
      title: 'İşlem doğrulama kodunuz',
      body: `İşleminizi onaylamak için kodunuz: ${this.stepUpCode}. 10 dakika geçerlidir.`,
      code: this.stepUpCode,
    });
  }

  async verifyStepUpCode(code: string) {
    await this.wait(500);
    if (!this.stepUpCode || code !== this.stepUpCode) throw new ApiError('Kod hatalı veya süresi dolmuş.', { code: 'code_invalid' });
    this.stepUpCode = null;
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

  /** Changes the signed-in founder's application; refused without a session or at the wrong stage. */
  private async mutate(allowed: Stage[], fn: (app: Application, acc: MockAccount) => void): Promise<Application> {
    return this.mutateFor(this.who(), allowed, fn);
  }

  private async mutateFor(emailIn: string, allowed: Stage[], fn: (app: Application, acc: MockAccount) => void): Promise<Application> {
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

/** The mock's question: the one card the evaluation service sent on 2026-11-26, its long prompt shortened. */
const MOCK_QUESTIONS: EvaluationQuestions['cards'] = [
  {
    id: 'B1',
    prompt: 'Müşteriye sunulan nihai teknik çözüm dışarıdan ne ölçüde hazır geliyor?',
    options: [
      {
        id: 'NOT_SUBSTANTIALLY_EXTERNALLY_SUPPLIED_AS_OFFERED',
        label: 'Nihai teknik çözüm hazır gelmiyor',
        description: 'Dışarıdan parçalar veya altyapı alınsa da nihai çalışma biçimi şirkete özgü maddi teknik çalışmayla oluşturulur.',
        explanationRequired: true,
        explanationPrompt: 'Ürününüzün tanımlayıcı teknik davranışını oluşturmak için sizin veya ekibinizin yaptığı teknik çalışmayı açıklayınız: hangi algoritma, mimari karar veya işlev, hazır bileşenlerin ötesinde size özgü olarak geliştirildi?',
      },
      {
        id: 'SUBSTANTIALLY_EXTERNALLY_SUPPLIED_AS_OFFERED',
        label: 'Nihai teknik çözüm hazır veya anahtar teslim geliyor',
        description: 'Çalışan teknik çözümün tamamı veya büyük bölümü dışarıdan hazır sağlanır.',
        explanationRequired: false,
        explanationPrompt: null,
      },
      { id: 'UNABLE_TO_VERIFY', label: 'Bilmiyorum veya doğrulayamıyorum', description: null, explanationRequired: false, explanationPrompt: null },
    ],
  },
];

function newApplication(acc: MockAccount): Application {
  const app: Application = {
    id: `DS-${String(new Date().getFullYear()).slice(2)}-${String(Math.floor(1000 + Math.random() * 9000))}`,
    createdAt: nowIso(),
    stage: 'profile',
    founderType: acc.founderType,
    founder: { firstName: acc.firstName, lastName: acc.lastName, nationality: '', passportNo: String(Math.floor(10_000_000 + Math.random() * 89_999_999)), tckn: acc.tckn },
    contact: { email: acc.email, phone: '', address: '', postalCode: '', country: '' },
    company: { brand: '', root: '', activity: '', nace: [], suggestedNace: [], capital: CAPITAL },
    funding: 'own-abroad',
    marks: {},
    docs: [],
    logs: [],
  };
  log(app, 'Başvuru oluşturuldu', 's');
  return app;
}

/**
 * Applications saved before 2026-11-25 by older versions of the portal:
 * - made without the profile form: one waiting at the deck upload without a profile goes back to it;
 * - read by the old AI deck reader: one still being read goes back to the upload (the deck, the CV
 *   and the answers are asked for now), and the reader's leftovers (the comparison, the deck's
 *   fields, `ai` / `check` marks, `deckName`) are dropped. Later stages keep their values.
 */
function upgrade(db: Db): Db {
  for (const app of Object.values(db.apps) as (Application & { crossCheck?: unknown; company: { deckName?: string } })[]) {
    if (app.stage === 'verified' && !app.profile) app.stage = 'profile';
    if ((app.stage as string) === 'scanning') {
      app.stage = 'verified';
      delete app.deck;
    }
    delete app.crossCheck;
    if (app.deck) app.deck = { fileName: app.deck.fileName, sizeKb: app.deck.sizeKb };
    if (app.company.brand === undefined) app.company.brand = app.company.deckName ?? app.profile?.brand ?? '';
    delete app.company.deckName;
    for (const [k, m] of Object.entries(app.marks)) if (m !== 'profile' && m !== 'edited') delete app.marks[k];
  }
  return db;
}

function log(app: Application, text: string, who: LogEntry['who']) {
  app.logs.push({ at: nowIso(), text, who });
}

const normEmail = (e: string) => e.trim().toLocaleLowerCase('en-US');

/** What the mock hands out: the account without its password, T.C. kimlik no and creation time. */
function publicAccount(acc: MockAccount): Account {
  return { email: acc.email, firstName: acc.firstName, lastName: acc.lastName, founderType: acc.founderType, verified: acc.verified };
}

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

/** A real `File` that reports a given size without holding the bytes; the mock reads only name and size. */
export function demoFile(name: string, size: number): File {
  const file = new File([], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/**
 * The deck's page count, when the mock can read it: the page objects of an uncompressed PDF (the
 * sample deck's kind). Null when it cannot tell (no bytes, as with `demoFile`, or pages hidden in
 * compressed object streams); the mock then does not refuse, as the API leaves it to the service.
 */
export async function pdfPageCount(file: File): Promise<number | null> {
  try {
    // FileReader rather than `File.arrayBuffer`, which the test environment's File lacks.
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
    const bytes = new Uint8Array(buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const n = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Two titles clash when one (ignoring the type suffix) is a word-prefix of the other,
 * e.g. "Acme Bulut Bilişim" vs registered "Acme Bulut Bilişim Hizmetleri A.Ş.".
 */
/** Suggestions after a refused title, leaving out what the simulated MERSİS already has (rules.ts). */
export function alternativesFor(root: string, candidate: string): string[] {
  return titleAlternatives(root, candidate, MERSIS_REGISTRY);
}

/** The log line of a title request; the simulated check counts them to force a conflict only on the first one. */
const TITLE_ASKED = 'Unvan MERSİS’e soruldu';

const withoutSuffixWords = (title: string) => withoutSuffix(title).replace(/\s+/g, ' ');

/** The demo founder's answers on D-1a (seeding stands in for the founder's form). */
export const DEMO_ANSWERS: EvaluationAnswers = {
  summary: 'Acme Cloud, küçük ve orta ölçekli işletmelere bulut tabanlı muhasebe ve stok yönetimi yazılımı sunar. Abonelikle satılır.',
  activityGroupId: 1,
  activityId: 3,
  businessModelIds: [1],
  revenueModelIds: [7],
  productTypeIds: [2],
};

/** Drives the real API methods in order until the application reaches `want`. */
async function fastForward(api: MockApi, email: string, want: Stage) {
  if (want === 'registered' || want === 'profile') return;
  const resident = JSON.parse(localStorage.getItem(DB_KEY)!).apps[email].founderType === 'resident';
  await api.submitProfile({
    brand: 'Acme Cloud',
    naceCodes: ['62.10.00', '62.20.00', '63.10.00'],
    funding: 'own-abroad',
    nationality: resident ? 'Türkiye' : 'Birleşik Krallık',
    phone: resident ? '+90 532 410 2699' : '+44 7700 900456',
    country: resident ? 'Türkiye' : 'Birleşik Krallık',
  });
  if (want === 'verified') return;
  // Seeding stands in for the founder's form and ticks on D-1a, so that later stages have a deck to show.
  await api.uploadDeck(
    { deck: demoFile('acme-cloud-pitch.pdf', 4_812_000), cv: demoFile('ozgecmis.pdf', 212_000) },
    DEMO_ANSWERS,
    { noticeAcknowledged: true, aiConsent: true },
  );
  if (want === 'evaluating') return;
  await api.completeEvaluation(want === 'evaluationQuestions' ? 'questions' : 'done');
  if (want === 'evaluationQuestions' || want === 'review') return;
  // The founder corrects the proposed title and codes and adds the address. "Acme Bulut Bilişim" clashes in MERSİS.
  const conflict = want === 'titleChecking' || want === 'titleConflict';
  await api.updateReview(
    {
      company: { root: 'Acme', activity: conflict ? 'Bulut Bilişim' : 'Bulut Yazılım', nace: ['62.10.00', '63.10.00'] },
      contact: resident
        ? { address: 'Bağdat Cad. No:212, Kadıköy / İstanbul', postalCode: '34728' }
        : { address: '14 Baker Street, London', postalCode: 'NW1 6XE' },
      funding: want === 'manual' ? 'third-party' : 'own-abroad',
    },
    ['title', 'nace', 'address', 'funding'],
  );
  await api.submitReview();
  if (want === 'titleChecking') return;
  await api.completeTitleCheck();
  if (want === 'titleConflict') return;
  if (want === 'eligibility') return; // D-2a opens on its pre-information view
  await api.startEligibility(true);
  await backdate(email, 'identity');
  await api.completeIdentity();
  if (want === 'declaration') return;
  await api.submitDeclaration({ file: { name: 'adres-belgesi.pdf', size: 412_000 }, declared: true });
  if (want === 'screening') return;
  await backdate(email, 'screening');
  await api.completeScreening();
  if (want === 'eligible' || want === 'manual') return;
  await api.proceedToPayment();
  if (want === 'payment') return;
  await api.pay({ holder: 'John Doe', number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' });
  if (want === 'threeDs') return;
  const otp = JSON.parse(localStorage.getItem(DB_KEY)!).apps[email].payment.otp as string;
  await api.confirm3ds(otp);
  if (want === 'signing') return;
  if (resident) {
    await api.signResident('existing');
  } else {
    await api.acceptCallTerms(true);
    await api.startCall();
    if (want === 'calling') return;
    await api.completeCall();
  }
  if (want === 'signed') return;
  await api.startSetup(true);
  if (want === 'setup') return;
  await backdate(email, 'setup');
  await api.completeSetup();
}

/** Moves a running process's start into the past so seeded data has realistic, ordered timestamps. */
async function backdate(email: string, which: 'identity' | 'screening' | 'setup') {
  const db = JSON.parse(localStorage.getItem(DB_KEY)!) as Db;
  const app = db.apps[email];
  const past = (ms: number) => new Date(Date.now() - ms).toISOString();
  if (which === 'identity') {
    // Far enough back that the declaration and the list search that follow still come after it.
    app.eligibility!.startedAt = app.eligibility!.consentAt = past(DURATION.identity + DURATION.screening + 4_000);
    app.logs.slice(-2).forEach((l) => (l.at = app.eligibility!.startedAt!));
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
  [/değerlendirme ne kadar/i, 'Değerlendirme genellikle birkaç dakika sürer. Bu sırada sayfayı kapatabilirsiniz; yeniden giriş yaptığınızda başvurunuz kaldığı yerden devam eder.'],
  [/değerlendir/i, 'Sunumunuz, özgeçmişiniz ve sunum ekranındaki yanıtlarınız dış bir değerlendirme hizmetine gönderilir. Değerlendirme tamamlandığında şirket formunu doldurursunuz; ek bilgi gerekirse sizinle iletişime geçilir.'],
  [/nereden geliyor|formdaki/i, 'Şirket formundaki bazı değerler ön bilgilerinizden ve hesabınızdan alınır ve “Ön bilgilerinizden” olarak işaretlenir; hepsini düzeltebilirsiniz. Şirket unvanı marka adınızdan, faaliyet kodları faaliyet alanınızdan önerilir; kontrol edip gerekirse düzeltiniz.'],
  [/[öÖ]n bilgi/, 'Ön bilgileriniz şirket formunda varsayılan değer olarak kullanılır; formu doldururken düzeltebilirsiniz.'],
  [/format|pdf|pptx|dosya/i, 'Sunum ve özgeçmiş PDF biçiminde olmalıdır. Sunum 3 ile 40 sayfa arasında ve en fazla 25 MB, özgeçmiş en fazla 5 MB olabilir.'],
  [/gizli|kvkk|saklan|veri/i, 'Sunumunuz ve özgeçmişiniz yalnızca başvurunuz kapsamında işlenir. Değerlendirme için dış bir değerlendirme hizmetine gönderilir; bu aktarım için sunum ekranında onayınız alınır.'],
  [/adres belgesi/i, 'Son üç ay içinde düzenlenmiş fatura, banka hesap özeti veya yerleşim yeri belgesi kabul edilir. Belge üzerinde adınız ve beyan ettiğiniz adres okunmalıdır.'],
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
