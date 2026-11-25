import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Api, ReviewPatch, ServerWork, Session } from './api';
import { ApiError } from './api-error';
import { Clock } from './clock';
import { pdfBytes, zipBytes } from './files';
import { dateTime, initials } from './format';
import { Account, Application, CrossKey, DeckConsents, DocItem, FounderType, LogEntry, PhoneLinkStatus, Profile, Stage, stepOf, WizardReference } from './models';
import { StatusPoller } from './status-poller';
import {
  callView,
  DURATION,
  identityEvents,
  identityView,
  openEndedProgress,
  progress,
  scanView,
  screeningEvents,
  screeningView,
  setupEvents,
  setupView,
} from './timeline';

/** Screen each stage lives on. */
export function routeFor(stage: Stage | null, founderType: FounderType = 'foreign'): string {
  switch (stage) {
    case null:
      return '/login';
    case 'registered':
      return '/verify-email';
    case 'profile':
      return '/details';
    case 'verified':
      return '/deck';
    case 'scanning':
      return '/deck/scan';
    case 'review':
      return '/deck/review';
    case 'titleChecking':
      return '/deck/name-check';
    case 'titleConflict':
      return '/deck/name-rejected';
    case 'eligibility':
      return '/eligibility';
    case 'declaration':
      return '/eligibility/declaration';
    case 'screening':
      return '/eligibility/screening';
    case 'eligible':
      return '/eligibility/result';
    case 'manual':
      return '/eligibility/manual-review';
    case 'payment':
      return '/payment';
    case 'threeDs':
      return '/payment/3d-secure';
    case 'signing':
      return founderType === 'resident' ? '/e-signature/turkish-citizen' : '/e-signature';
    case 'calling':
      return '/e-signature/call';
    case 'signed':
      return '/e-signature/ready';
    case 'setup':
      return '/setup';
    case 'done':
      return '/setup/complete';
  }
}

/**
 * Stages in which the server (or its staff) works and the founder waits; in HTTP mode the store
 * polls the status read while the application is in one of them. Later pieces add step 2's and
 * step 5's waiting stages.
 */
export const SERVER_WAITING_STAGES: Stage[] = ['scanning', 'titleChecking'];

/**
 * Single source of truth for the signed-in founder and their application. Screens read signals
 * from here and call its actions; it talks to the API (`Api`: the mock or the HTTP client,
 * chosen by the build) and keeps long-running steps moving.
 */
@Injectable({ providedIn: 'root' })
export class ApplicationStore {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly now = inject(Clock).now;

  readonly account = signal<Account | null>(null);
  readonly app = signal<Application | null>(null);
  /**
   * The address that registered (or tried to sign in) but has not confirmed its code yet. Kept in
   * memory only: the verify screen (D-0c) needs it, and nothing about the founder is written to
   * the browser's storage. A reload forgets it; signing in again sends a new code.
   */
  readonly pendingEmail = signal<string | null>(null);
  /**
   * Resolves once the session the browser already had has been looked up (`Api.restore`). The
   * flow guard waits for it, so a reload does not bounce a signed-in founder to the login page.
   */
  readonly restored: Promise<void>;
  /** A short message for the next sign-in screen ("your password was changed"); read once with `takeNotice`. */
  private notice: string | null = null;
  /** True while an action is in flight (buttons show a spinner / disable). */
  readonly busy = signal(false);
  /** Last action error, shown next to the action that failed. */
  readonly error = signal<string | null>(null);
  /**
   * The last refusal's messages per field, under the API's field names (`brand`, `given_name`, …);
   * empty when the refusal named no field (always, in the mock). Screens show them at the field.
   */
  readonly fieldErrors = signal<Record<string, string[]>>({});
  /** What the profile form and the review screen may offer (`Api.reference`); null until loaded. */
  readonly reference = signal<WizardReference | null>(null);

  // ------------------------------------------------------------------------------ derived

  readonly signedIn = computed(() => !!this.account());
  readonly stage = computed<Stage | null>(() => this.app()?.stage ?? (this.account() ? 'profile' : this.pendingEmail() ? 'registered' : null));
  readonly step = computed(() => {
    const s = this.stage();
    return s ? stepOf(s) : 1;
  });
  readonly founderType = computed<FounderType>(() => this.account()?.founderType ?? 'foreign');
  readonly fullName = computed(() => {
    const a = this.app()?.founder ?? this.account();
    return a ? `${a.firstName} ${a.lastName}` : '';
  });
  readonly initials = computed(() => {
    const a = this.app()?.founder ?? this.account();
    return a ? initials(a.firstName, a.lastName) : '';
  });
  readonly appId = computed(() => this.app()?.id ?? '—');
  /** "Acme Bulut Bilişim" */
  readonly title = computed(() => {
    const c = this.app()?.company;
    return c ? `${c.root} ${c.activity}`.trim() : '';
  });
  /** "Acme Bulut Bilişim Anonim Şirketi" */
  readonly fullTitle = computed(() => (this.title() ? `${this.title()} Anonim Şirketi` : ''));
  readonly resumeRoute = computed(() => routeFor(this.stage(), this.founderType()));

  /** True when the server does the background work and the store polls for it (HTTP mode). */
  private readonly serverWork: ServerWork | null = this.api.work.kind === 'server' ? this.api.work : null;

  /**
   * The deck being read. In the mock the reading ends when its simulated time is up. With the
   * server the animation still moves with time but stops short of 100%: only the server's next
   * stage ends it.
   */
  readonly scan = computed(() => {
    const a = this.app();
    if (!a?.deck) return null;
    const p =
      a.stage !== 'scanning'
        ? 1
        : this.serverWork
          ? openEndedProgress(a.deck.startedAt, this.dur(DURATION.scan), this.now())
          : progress(a.deck.startedAt, this.dur(DURATION.scan), this.now());
    return scanView(a, p);
  });

  /** Step 2's camera check; null until the founder has started it. */
  readonly identity = computed(() => {
    const a = this.app();
    if (!a?.eligibility) return null;
    const p = a.stage === 'eligibility' ? progress(a.eligibility.startedAt, this.dur(DURATION.identity), this.now()) : 1;
    return identityView(p);
  });

  /** Step 2's list search; null before the declaration is confirmed. */
  readonly screening = computed(() => {
    const a = this.app();
    if (!a?.eligibility?.screeningStartedAt) return null;
    const p = a.stage === 'screening' ? progress(a.eligibility.screeningStartedAt, this.dur(DURATION.screening), this.now()) : 1;
    return screeningView(p);
  });

  readonly call = computed(() => {
    const a = this.app();
    if (a?.stage !== 'calling' || !a.call) return null;
    const p = progress(a.call.startedAt, this.dur(DURATION.call), this.now());
    return { ...callView(p, a.founder.firstName), elapsedMs: this.now() - Date.parse(a.call.startedAt) };
  });

  readonly setup = computed(() => {
    const a = this.app();
    if (!a?.setup) return null;
    const p = a.stage === 'setup' ? progress(a.setup.startedAt, this.dur(DURATION.setup), this.now()) : 1;
    return setupView(p);
  });

  /** Audit log including events of a process that is still running (newest first). */
  readonly logs = computed<LogEntry[]>(() => {
    const a = this.app();
    if (!a) return [];
    return [...a.logs, ...this.liveEvents(a).logs].sort((x, y) => y.at.localeCompare(x.at));
  });

  /** Documents including ones produced so far by a running process (in creation order). */
  readonly docs = computed<DocItem[]>(() => {
    const a = this.app();
    if (!a) return [];
    return [...a.docs, ...this.liveEvents(a).docs];
  });

  constructor() {
    this.restored = this.restore();
    if (this.serverWork) this.followServer(this.serverWork);
    else this.finishSimulatedSteps();
    // The same for a check that runs on the phone page.
    let finishing = false;
    effect(() => {
      if (this.phoneCheck()?.p !== 1 || finishing) return;
      finishing = true;
      untracked(() => void this.finishByPhone().finally(() => (finishing = false)));
    });
    // Another tab or device moved the application on (the phone page starts the identity check): pick it up.
    this.api.demo?.onExternalChange(() => void this.restore());
  }

  /** Mock: finish time-based steps when their simulated duration has elapsed. */
  private finishSimulatedSteps() {
    effect(() => {
      const a = this.app();
      if (!a) return;
      const done =
        (a.stage === 'scanning' && this.scan()?.p === 1) ||
        (a.stage === 'titleChecking' && progress(a.titleCheck?.requestedAt, this.dur(DURATION.titleCheck), this.now()) === 1) ||
        (a.stage === 'eligibility' && this.identity()?.p === 1) ||
        (a.stage === 'screening' && this.screening()?.p === 1) ||
        (a.stage === 'calling' && this.call()?.p === 1) ||
        (a.stage === 'setup' && this.setup()?.p === 1);
      if (done) untracked(() => this.complete(a.stage));
    });
  }

  /**
   * HTTP mode: while the application waits for the server (`SERVER_WAITING_STAGES`), poll the light
   * status read; stop when the stage moves on, on sign-out and on a 401 (which signs out).
   */
  private followServer(work: ServerWork) {
    const poller = new StatusPoller(() => this.poll(work));
    effect(() => {
      const waiting = this.signedIn() && SERVER_WAITING_STAGES.includes(this.app()?.stage as Stage);
      untracked(() => (waiting ? poller.start() : poller.stop()));
    });
    inject(DestroyRef).onDestroy(() => poller.stop());
  }

  /** Counts changes made by the founder's own actions, so that a poll answer that started before one cannot overwrite it. */
  private writes = 0;

  /**
   * One poll: the status read, and the full read only when the stage or `changedAt` differs from
   * the status seen just before the last full read. The full read decrypts the founder's data and
   * leaves access-log rows on the server, so it is not repeated while nothing changed.
   */
  private async poll(work: ServerWork) {
    const writes = this.writes;
    try {
      const status = await work.status();
      const seen = work.seen();
      if (seen && status.stage === seen.stage && status.changedAt === seen.changedAt) return;
      const app = await work.application();
      if (writes === this.writes && this.signedIn()) this.app.set(app);
    } catch (e) {
      if (this.sessionLost(e)) return;
      // A network hiccup or a restarting server: the next poll tries again.
      console.warn('status poll failed', e instanceof ApiError ? (e.code ?? e.status) : e);
    }
  }

  // ---------------------------------------------------------------------------- actions

  /** Sends the code; the verify screen (D-0c) then asks for it. Does not sign in. */
  async register(input: { firstName: string; lastName: string; email: string; password: string }) {
    return this.run(async () => {
      await this.api.register(input);
      this.setSession(null);
      this.pendingEmail.set(input.email.trim());
    });
  }

  /**
   * When the address is not confirmed yet the server sends a new code and refuses with
   * `email_not_verified`: the founder is then taken to the verify screen, which shows the
   * server's sentence (`takeNotice`). Resolves true only when signed in.
   */
  async login(email: string, password: string) {
    this.pendingEmail.set(null);
    return this.run(async () => {
      try {
        this.setSession(await this.api.login(email, password));
      } catch (e) {
        if (e instanceof ApiError && e.code === 'email_not_verified') {
          this.pendingEmail.set(email.trim());
          this.notice = e.message;
        }
        throw e;
      }
    });
  }

  /** e-Devlet sign-in for T.C. citizens; creates the account on first use. */
  async edevlet(tckn: string) {
    return this.run(async () => this.setSession(await this.api.edevlet(tckn)));
  }

  /** Ends the session on the server, then forgets the founder here. A failed call still signs out locally. */
  async logout() {
    if (this.signedIn()) await this.api.logout().catch((e: unknown) => console.warn('logout failed', e instanceof ApiError ? e.code : e));
    this.setSession(null);
    this.pendingEmail.set(null);
  }

  verifyEmail = (code: string) => this.run(async () => this.setSession(await this.api.verifyEmail(this.unconfirmedEmail(), code)));
  resendEmailCode = () => this.run(() => this.api.resendEmailCode(this.unconfirmedEmail()));
  requestPasswordReset = (email: string) => this.run(() => this.api.requestPasswordReset(email));

  /** The set-new-password screen. On success the login screen says so (`takeNotice`). */
  confirmPasswordReset = (token: string, password: string) =>
    this.run(async () => {
      await this.api.confirmPasswordReset(token, password);
      // The server has ended every session of this account; this tab may have had one.
      this.setSession(null);
      this.notice = 'Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.';
    });

  /** The message left for the next sign-in screen, once. */
  takeNotice() {
    const notice = this.notice;
    this.notice = null;
    return notice;
  }

  /** Demo convenience: the last e-mail typed on a sign-in screen. Nothing is kept outside mock mode. */
  rememberedEmail = () => this.api.demo?.rememberedEmail() ?? '';
  rememberEmail = (email: string) => this.api.demo?.rememberEmail(email);

  /** D-1e: the founder's statement before the deck; may be saved again until a deck is uploaded. */
  submitProfile = (input: Omit<Profile, 'at'>) => this.update(() => this.api.submitProfile(input));
  /** D-1a: the deck with the founder's two ticks for this upload. */
  uploadDeck = (file: File, consents: DeckConsents) => this.update(() => this.api.uploadDeck(file, consents));
  updateReview = (patch: ReviewPatch, edited: string[]) => this.update(() => this.api.updateReview(patch, edited));
  submitReview = () => this.update(() => this.api.submitReview());
  chooseTitle = (title: string) => this.update(() => this.api.chooseTitle(title));
  /** D-1c: which value to keep where the profile and the deck differ. */
  resolveCrossCheck = (key: CrossKey, choice: 'stated' | 'read') => this.update(() => this.api.resolveCrossCheck(key, choice));
  /** D-2a: the founder read the pre-information, ticked the consent and starts the identity check. */
  startEligibility = (consent: boolean) => this.update(() => this.api.startEligibility(consent));
  /** D-2d: the address document and the confirmed declaration; the list search starts. */
  submitDeclaration = (input: { file: { name: string; size: number } | null; declared: boolean }) =>
    this.update(() => this.api.submitDeclaration(input));
  /** D-2a "Telefonla devam et": make (or renew) the link the QR code carries. */
  createPhoneLink = () => this.update(() => this.api.createPhoneLink());
  /** From manual review (step 2): reopen the deck data. Step 1's "Diğer bilgilere dön" only navigates (D-1d). */
  backToReview = () => this.update(() => this.api.backToReview());

  /** Loads `reference` once; the profile form and the review screen call it. A failure is shown as the screen's error. */
  async loadReference() {
    if (this.reference()) return;
    try {
      this.reference.set(await this.api.reference());
    } catch (e) {
      if (this.sessionLost(e)) return;
      this.error.set(e instanceof ApiError ? e.message : 'Seçenekler yüklenemedi. Lütfen sayfayı yenileyiniz.');
    }
  }
  proceedToPayment = () => this.update(() => this.api.proceedToPayment());
  pay = (card: { holder: string; number: string; expiry: string; cvv: string }) => this.update(() => this.api.pay(card));
  resendOtp = () => this.update(() => this.api.resendOtp());
  cancel3ds = () => this.update(() => this.api.cancel3ds());
  confirm3ds = (code: string) => this.update(() => this.api.confirm3ds(code));
  /** D-4a pre-information: the consent tick and "Devam et". */
  acceptCallTerms = (consent: boolean) => this.update(() => this.api.acceptCallTerms(consent));
  startCall = () => this.update(() => this.api.startCall());
  endCall = () => this.update(() => this.api.endCall());
  signResident = (method: 'existing' | 'edevlet') => this.update(() => this.api.signResident(method));
  /** D-4c: the founder confirmed that the documents are signed with their e-signature, and starts the formation. */
  startSetup = (confirmed: boolean) => this.update(() => this.api.startSetup(confirmed));
  ask = (q: string) => this.api.ask(q);

  // ------------------------------------------------- identity check on the phone (D-2a-m)
  // The phone page works from its link alone: it has no session and none of the signals above.

  private phoneToken = '';
  /** Where the phone page's link stands; null while it is being looked up. */
  readonly phone = signal<PhoneLinkStatus | null>(null);
  /** The running check as the phone page shows it. */
  readonly phoneCheck = computed(() => {
    const s = this.phone();
    return s?.state === 'running' ? identityView(progress(s.startedAt, this.dur(DURATION.identity), this.now())) : null;
  });

  async openPhoneLink(token: string) {
    this.phoneToken = token;
    this.phone.set(null);
    this.phone.set(await this.api.phoneLinkStatus(token));
  }

  startByPhone = (consent: boolean) => this.run(async () => this.phone.set(await this.api.startEligibilityByPhone(this.phoneToken, consent)));

  private async finishByPhone() {
    const token = this.phoneToken;
    try {
      this.phone.set(await this.api.completeIdentityByPhone(token));
    } catch (e) {
      // The computer's page may have finished it first.
      if (!(e instanceof ApiError)) throw e;
      this.phone.set(await this.api.phoneLinkStatus(token));
    }
  }

  /** Demo panel: create the demo founder at a given stage and sign in as them. Mock mode only. */
  async seed(stage: Stage, founderType: FounderType = 'foreign') {
    return this.run(async () => {
      const r = await this.demoTools().seed(stage, founderType);
      // Seeded before the e-mail is confirmed: no session, only the address waiting for its code.
      this.setSession(r.account.verified ? r : null);
      if (!r.account.verified) this.pendingEmail.set(r.account.email);
    });
  }

  /** Demo panel: delete all mock data. Mock mode only. */
  resetAll() {
    this.demoTools().reset();
    this.setSession(null);
  }

  /** Simulation speed of the time-based steps: the demo panel's setting, real time without demo tools. */
  speed() {
    return this.api.demo?.speed() ?? 1;
  }

  clearError() {
    this.error.set(null);
    this.fieldErrors.set({});
  }

  /** Placeholder PDF for a generated document. */
  documentPdf(d: DocItem) {
    return pdfBytes(d.name, [
      `Basvuru no: ${this.appId()}`,
      `Sirket: ${this.fullTitle() || '-'}`,
      `Kurucu: ${this.fullName()}`,
      `Belge grubu: ${d.group}`,
      `Olusturulma: ${dateTime(d.at)}`,
      '',
      'Bu belge Terminal Sirket prototipinde uretilmis ornek bir dosyadir.',
    ]);
  }

  /** All documents as one ZIP, grouped in folders. */
  documentsZip() {
    return zipBytes(this.docs().map((d) => ({ name: `${d.group.replace(/\s*·\s*/, ' - ')}/${d.name}.pdf`, data: this.documentPdf(d) })));
  }

  // ------------------------------------------------------------------------- internals

  private completing: Stage | null = null;

  private async complete(stage: Stage) {
    if (this.completing === stage) return;
    this.completing = stage;
    try {
      if (this.api.work.kind !== 'simulated') return;
      const finished = this.api.work.complete(stage);
      if (finished) this.app.set(await finished);
    } catch (e) {
      if (this.sessionLost(e)) return;
      // Another tab may have advanced the application already: resync.
      void this.restore();
      if (!(e instanceof ApiError)) throw e;
    } finally {
      this.completing = null;
    }
  }

  private liveEvents(a: Application): { logs: LogEntry[]; docs: DocItem[] } {
    const now = this.now();
    if (a.stage === 'eligibility' && a.eligibility) {
      return { logs: identityEvents(a, this.dur(DURATION.identity)).filter((l) => Date.parse(l.at) <= now), docs: [] };
    }
    if (a.stage === 'screening' && a.eligibility) {
      return { logs: screeningEvents(a, this.dur(DURATION.screening)).logs.filter((l) => Date.parse(l.at) <= now), docs: [] };
    }
    if (a.stage === 'setup' && a.setup) {
      return setupEvents(a, this.setup()?.p ?? 0, this.dur(DURATION.setup));
    }
    return { logs: [], docs: [] };
  }

  private dur(base: number) {
    return base / this.speed();
  }

  private demoTools() {
    if (!this.api.demo) throw new ApiError('Demo araçları yalnızca demo modunda kullanılabilir.');
    return this.api.demo;
  }

  /** The address waiting for its code (see `pendingEmail`). */
  private unconfirmedEmail() {
    const email = this.pendingEmail();
    if (!email) throw new ApiError('E-posta adresiniz bulunamadı. Lütfen yeniden giriş yapınız.');
    return email;
  }

  /** Counts sign-ins and sign-outs, so a slow `restore` cannot overwrite a newer session. */
  private sessionVersion = 0;

  /** Signs in (a session from the API) or out (null). Nothing is written to the browser's storage here. */
  private setSession(session: Session | null) {
    this.sessionVersion++;
    this.account.set(session?.account ?? null);
    this.app.set(session?.app ?? null);
    // Read again for the next session (HTTP mode reads it once per session).
    this.reference.set(null);
    if (session) {
      this.pendingEmail.set(null);
      this.notice = null;
    }
  }

  /**
   * Asks the API who is signed in: after a reload, and in mock mode when another tab changed the
   * data. Leaves the founder signed out when there is no session or the answer fails.
   */
  private async restore() {
    const version = this.sessionVersion;
    let session: Session | null = null;
    try {
      session = await this.api.restore();
    } catch (e) {
      console.warn('session restore failed', e instanceof ApiError ? (e.code ?? e.status) : e);
    }
    // A sign-in or sign-out happened while we waited: that one wins.
    if (version !== this.sessionVersion) return;
    this.account.set(session?.account ?? null);
    this.app.set(session?.app ?? null);
  }

  /**
   * The server no longer knows the session (expired, ended in another tab, password reset):
   * forget the founder and go to the login page. True when that was the case.
   */
  private sessionLost(e: unknown): boolean {
    if (!(e instanceof ApiError) || e.code !== 'unauthenticated') return false;
    this.setSession(null);
    void this.router.navigateByUrl('/login').catch(() => undefined);
    return true;
  }

  private async update(fn: () => Promise<Application>) {
    return this.run(async () => {
      this.writes++;
      try {
        this.app.set(await fn());
      } catch (e) {
        // 409 wrong_stage: this screen was out of date (another tab, or the server moved on). Show
        // where the application really is; the refusal's sentence stays on screen.
        if (e instanceof ApiError && e.code === 'wrong_stage') void this.refresh();
        throw e;
      }
    });
  }

  /** Reads the application again (after a `wrong_stage` refusal). */
  private async refresh() {
    try {
      const app = this.serverWork ? await this.serverWork.application() : (await this.api.restore())?.app;
      if (app && this.signedIn()) this.app.set(app);
    } catch (e) {
      this.sessionLost(e);
    }
  }

  /** Runs an action with busy/error state. Resolves true on success. */
  private async run(fn: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    this.fieldErrors.set({});
    try {
      await fn();
      return true;
    } catch (e) {
      this.sessionLost(e);
      this.error.set(e instanceof ApiError ? shownMessage(e) : e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.');
      if (e instanceof ApiError && e.fields) this.fieldErrors.set(e.fields);
      if (!(e instanceof ApiError)) console.error(e);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * What the founder reads for a refusal. A `validation_failed` answer from the API carries a
 * general title ("Gönderdiğiniz bilgiler eksik veya hatalıdır.") and the useful sentence under its
 * field (a wrong code: `errors.code`), so the field's sentence is shown when there is exactly one.
 * With several (the review's "Eksik bilgileri tamamlayınız." and one line per missing field) the
 * title is shown here and the screen shows each line at its field (`fieldErrors`).
 */
function shownMessage(e: ApiError): string {
  const messages = Object.values(e.fields ?? {}).flat();
  return messages.length === 1 ? messages[0] : e.message;
}
