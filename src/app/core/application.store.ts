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
      // A resident at `calling` (HTTP mode) is waiting for the provider to verify their e-signature: no call.
      return founderType === 'resident' ? '/e-signature/turkish-citizen' : '/e-signature/call';
    case 'signed':
      return '/e-signature/ready';
    case 'setup':
      return '/setup';
    case 'done':
      return '/setup/complete';
    case 'closed':
      return '/application-closed';
  }
}

/**
 * Stages in which the server (or its staff) works and the founder waits; in HTTP mode the store
 * polls the status read while the application is in one of them (`waitsForServer`). `manual` and
 * `setup` are done by people (staff and institutions) and can take days; the poll settles at its
 * slowest pace (`pollDelay`). `done` is not one: nothing is polled once the company is founded.
 */
export const SERVER_WAITING_STAGES: Stage[] = ['scanning', 'titleChecking', 'screening', 'manual', 'setup'];

/**
 * True while the portal should poll for the server in HTTP mode: a waiting stage; the identity step
 * while a check is open on the server (camera not finished, or the Worker deciding) or while the QR
 * code is shown on this computer (so it notices the phone starting and finishing the check); and
 * `calling` once the certificate is being issued: after the scripted call was reported ended, for a
 * resident (no call: the provider verifies their e-signature), or when the portal cannot tell (no
 * call start in the timeline). Not while the founder's own scripted call runs.
 */
export function waitsForServer(app: Application | null): boolean {
  if (!app) return false;
  if (SERVER_WAITING_STAGES.includes(app.stage)) return true;
  if (app.stage === 'calling') return app.founderType === 'resident' || !app.call || !!app.call.completed;
  return app.stage === 'eligibility' && (!!app.eligibility?.running || !!app.phoneLink);
}

/**
 * How often the phone page asks for its link's state. The phone routes share the API's sign-in rate
 * limit (20 requests a minute per address, which a phone on the same network as the computer
 * shares), so never faster than every 5 s; the page stops asking once the state is final.
 */
export const PHONE_POLL_MS = 6_000;

/** The API sends no new second-factor code within 60 s of the last one, so the dialog's resend waits as long. */
export const STEP_UP_RESEND_MS = 60_000;

/** The original action's message when the founder closes the second-factor dialog without a code. */
export const STEP_UP_CANCELLED = 'İşlem yapılmadı. Devam etmek için e-posta adresinize gönderilen kodu girmeniz gerekir.';

/** What the second-factor dialog shows; `ApplicationStore.stepUp` is null while it is closed. */
export interface StepUpState {
  /** When the last code was sent (ms since epoch), for the resend cooldown; null until the first send answered. */
  sentAt: number | null;
  /** A code is being sent or checked. */
  working: boolean;
  /** The last refusal, worded as the server worded it (a wrong code, no e-mail address, too many tries). */
  error: string | null;
}

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
  /**
   * HTTP mode: the signed-in founder's application was closed by staff (the API's read answers 404
   * `no_application` while the portal held it, or right after a reload). The stage is then `closed`.
   * Nothing creates a new application in this state; signing out and in again does (an API gap).
   */
  readonly closed = signal(false);
  /**
   * The second-factor dialog (`StepUpDialog`, rendered once by the app shell); null while closed.
   * Opened by `run()` when the API refuses an action with `step_up_required`; see `withSecondFactor`.
   */
  readonly stepUp = signal<StepUpState | null>(null);

  // ------------------------------------------------------------------------------ derived

  readonly signedIn = computed(() => !!this.account());
  readonly stage = computed<Stage | null>(() =>
    this.closed() && this.account() ? 'closed' : (this.app()?.stage ?? (this.account() ? 'profile' : this.pendingEmail() ? 'registered' : null)),
  );
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
   * HTTP mode: results come from the server, not from the portal's simulation. Screens use it to
   * leave out what only the mock can say (a liveness score, per-list results, review reasons).
   */
  readonly serverDecides = !!this.serverWork;

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

  /**
   * Step 2's camera check; null until the founder has started it, and in HTTP mode whenever no check
   * is open on the server (before the first start, after a failed one). The camera is the portal's
   * own animation in both modes (there is no identity vendor yet).
   */
  readonly identity = computed(() => {
    const a = this.app();
    const e = a?.eligibility;
    if (!a || !e?.startedAt || (this.serverWork && a.stage === 'eligibility' && !e.running)) return null;
    const p = a.stage === 'eligibility' ? progress(e.startedAt, this.dur(DURATION.identity), this.now()) : 1;
    return identityView(p);
  });

  /**
   * Step 2's list search; null before the declaration is confirmed. With the server, only the
   * server's next stage ends it, so the bar slows down and never reaches the end by itself.
   */
  readonly screening = computed(() => {
    const a = this.app();
    if (!a?.eligibility?.screeningStartedAt) return null;
    const at = a.eligibility.screeningStartedAt;
    const p =
      a.stage !== 'screening'
        ? 1
        : this.serverWork
          ? openEndedProgress(at, this.dur(DURATION.screening), this.now())
          : progress(at, this.dur(DURATION.screening), this.now());
    return screeningView(p);
  });

  readonly call = computed(() => {
    const a = this.app();
    if (a?.stage !== 'calling' || !a.call) return null;
    const p = progress(a.call.startedAt, this.dur(DURATION.call), this.now());
    return { ...callView(p, a.founder.firstName), elapsedMs: this.now() - Date.parse(a.call.startedAt) };
  });

  /**
   * The mock's scripted set-up (D-5a), from its start time. Null in HTTP mode: there the screen shows
   * only the server's steps and tasks (`Application.setup.steps`), with no progress made up by time.
   */
  readonly setup = computed(() => {
    const a = this.app();
    if (!a?.setup || this.serverWork) return null;
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
    // The same for a check that runs on the phone page: its animation ended, tell the server once.
    effect(() => {
      if (this.phoneCheck()?.p !== 1 || this.phoneFinishSent === this.phoneToken) return;
      this.phoneFinishSent = this.phoneToken;
      untracked(() => void this.finishByPhone());
    });
    this.followPhoneLink();
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
      const waiting = this.signedIn() && waitsForServer(this.app());
      untracked(() => (waiting ? poller.start() : poller.stop()));
    });
    inject(DestroyRef).onDestroy(() => poller.stop());
    // The camera check on this computer: when the portal's animation ends, tell the server once per
    // check (keyed by its start time) and wait for the Worker's decision (polled). A check started on
    // the phone is finished by the phone page; this computer only follows it.
    let sentFor: string | undefined;
    effect(() => {
      const a = this.app();
      const e = a?.eligibility;
      if (a?.stage !== 'eligibility' || !e?.running || e.via === 'phone' || this.identity()?.p !== 1 || sentFor === e.startedAt) return;
      sentFor = e.startedAt;
      untracked(() => void this.completeIdentity());
    });
    // The video call: the same, once per call (keyed by its start). The call is the portal's scripted
    // simulation (no video or e-signature vendor yet); when it ends the server is told, and the
    // certificate is polled for. Hanging up before (`endCall`) cancels it instead.
    let callSentFor: string | undefined;
    effect(() => {
      const a = this.app();
      const call = a?.call;
      if (a?.stage !== 'calling' || !call || call.completed || this.call()?.p !== 1 || callSentFor === call.startedAt) return;
      callSentFor = call.startedAt;
      untracked(() => void this.completeCall());
    });
    // The certificate expires (a daily one after 24 hours): the API then reports `signing` again and
    // refuses the set-up. Read the application once when the time is up, so D-4c gives way by itself.
    let expiryReadFor: string | undefined;
    effect(() => {
      const a = this.app();
      const until = a?.signature?.validUntil;
      if (a?.stage !== 'signed' || !until || Date.parse(until) > this.now() || expiryReadFor === until) return;
      expiryReadFor = until;
      untracked(() => void this.refresh());
    });
  }

  /** HTTP mode: see `followServer`. A refusal re-reads the application. */
  private async completeCall() {
    this.writes++;
    try {
      this.app.set(await this.api.completeCall());
    } catch (e) {
      if (this.sessionLost(e) || this.applicationClosed(e)) return;
      console.warn('call complete failed', e instanceof ApiError ? (e.code ?? e.status) : e);
      void this.refresh();
    }
  }

  /** HTTP mode: see `followServer`. A refusal (the check was finished elsewhere) only re-reads the application. */
  private async completeIdentity() {
    this.writes++;
    try {
      this.app.set(await this.api.completeIdentity());
    } catch (e) {
      if (this.sessionLost(e) || this.applicationClosed(e)) return;
      console.warn('identity complete failed', e instanceof ApiError ? (e.code ?? e.status) : e);
      void this.refresh();
    }
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
      if (this.sessionLost(e) || this.applicationClosed(e)) return;
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
  submitDeclaration = (input: { file: File | null; declared: boolean }) => this.update(() => this.api.submitDeclaration(input));
  /** D-2a "Telefonla devam et": make (or renew) the link the QR code carries. */
  createPhoneLink = () => this.update(() => this.api.createPhoneLink());
  /** D-2a "Bu bilgisayarla devam et": the QR view closes; HTTP mode forgets the link's token. */
  leavePhoneLink() {
    const app = this.api.forgetPhoneLink();
    if (app && this.signedIn() && !this.closed()) this.app.set(app);
  }
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
  /**
   * D-3a. The card lives only in this call (and in a repeat after the second-factor dialog); it is
   * not kept in any signal. HTTP mode sends only the holder and a token (`HttpApi.pay`).
   */
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

  /** The phone page's link token, from the URL fragment; memory only (see d2m). */
  private phoneToken = '';
  /** The token whose check this page has already reported finished (`completeIdentityByPhone`), so it is sent once. */
  private phoneFinishSent = '';
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
    this.phoneOpened.set(true);
    try {
      this.phone.set(await this.api.phoneLinkStatus(token));
    } catch (e) {
      // The status read never refuses a token; this is the network or the rate limit. The poll tries again.
      console.warn('phone link status failed', e instanceof ApiError ? (e.code ?? e.status) : e);
    }
  }

  startByPhone = (consent: boolean) => this.run(async () => this.phone.set(await this.api.startEligibilityByPhone(this.phoneToken, consent)));

  /**
   * Asks for the phone link's state every `PHONE_POLL_MS` while it can still change (being looked
   * up, `ready`, `running`), so the page shows a check started or ended on the computer and the
   * server's decision after the camera; no timers while the tab is hidden; stops at `invalid`,
   * `expired` and `done`.
   */
  private followPhoneLink() {
    const poller = new StatusPoller(() => this.pollPhone(), undefined, undefined, () => PHONE_POLL_MS);
    effect(() => {
      const s = this.phone();
      const open = !!this.phoneToken && (s === null || s.state === 'ready' || s.state === 'running');
      untracked(() => (this.phoneOpened() && open ? poller.start() : poller.stop()));
    });
    inject(DestroyRef).onDestroy(() => poller.stop());
  }

  /** Set once the phone page has read its token (`openPhoneLink`); the phone poll runs only on that page. */
  private readonly phoneOpened = signal(false);

  private async pollPhone() {
    const token = this.phoneToken;
    try {
      const status = await this.api.phoneLinkStatus(token);
      if (token === this.phoneToken) this.phone.set(status);
    } catch (e) {
      console.warn('phone link status failed', e instanceof ApiError ? (e.code ?? e.status) : e);
    }
  }

  private async finishByPhone() {
    const token = this.phoneToken;
    try {
      this.phone.set(await this.api.completeIdentityByPhone(token));
    } catch (e) {
      // The computer's page may have finished it first, or the request was refused (rate limit): read the state.
      if (!(e instanceof ApiError)) throw e;
      await this.pollPhone();
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

  /**
   * Placeholder PDF for a generated document. Mock only: against the real API the portal never makes
   * a document up (the API has no route to download one yet), so this refuses in HTTP mode.
   */
  documentPdf(d: DocItem) {
    if (this.serverWork) throw new Error('No placeholder documents against the real API.');
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
    // The simulated lines below ("Pasaport MRZ doğrulandı", the list results) are the mock's. With the
    // server, the timeline and documents are the API's own.
    if (this.serverWork) return { logs: [], docs: [] };
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
    this.closed.set(!!session?.closed);
    // A code asked for belongs to the session that was refused.
    if (this.stepUp()) this.closeStepUp(false);
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
    this.closed.set(!!session?.closed);
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

  /**
   * HTTP mode: the API answered 404 `no_application` while the portal held the founder's
   * application. Staff closed it (manual review rejected); the only route out of manual review that
   * ends this way. The application is forgotten and the stage becomes `closed`; nothing creates a
   * new one. True when that was the case.
   */
  private applicationClosed(e: unknown): boolean {
    if (!(e instanceof ApiError) || e.code !== 'no_application' || !this.app()) return false;
    this.writes++;
    this.app.set(null);
    this.closed.set(true);
    return true;
  }

  private async update(fn: () => Promise<Application>) {
    return this.run(async () => {
      this.writes++;
      try {
        this.app.set(await fn());
      } catch (e) {
        // 409 wrong_stage: this screen was out of date (another tab, or the server moved on). Show
        // where the application really is; the refusal's sentence stays on screen. The same for the
        // payment's 409s: a payment was opened, or closed, in another tab; a call that is no longer open;
        // a certificate that expired (the API is back at `signing`).
        if (e instanceof ApiError && OUT_OF_DATE.includes(e.code ?? '')) void this.refresh();
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
      if (!this.applicationClosed(e)) this.sessionLost(e);
    }
  }

  /**
   * Runs an action with busy/error state. Resolves true on success. A refusal for want of a second
   * factor is answered here, once for every action (`withSecondFactor`).
   */
  private async run(fn: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    this.fieldErrors.set({});
    try {
      await this.withSecondFactor(fn);
      return true;
    } catch (e) {
      // Closed: the closed screen says it all, no error under a button.
      if (this.applicationClosed(e)) return false;
      this.sessionLost(e);
      this.error.set(e instanceof ApiError ? shownMessage(e) : e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.');
      if (e instanceof ApiError && e.fields) this.fieldErrors.set(e.fields);
      if (!(e instanceof ApiError)) console.error(e);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  // ---------------------------------------------------------------- second factor ("step-up")

  /**
   * Runs `fn`. When the API refuses it with `step_up_required` (403: this session has not passed an
   * e-mailed code in the last 15 minutes), the dialog asks for the code; once the code is accepted,
   * `fn` runs once more, by itself. Only once: a second refusal of any kind, `step_up_required`
   * included, is thrown like any other refusal, so this can never loop. When the founder closes the
   * dialog the action ends with `STEP_UP_CANCELLED` and nothing else is sent.
   */
  private async withSecondFactor(fn: () => Promise<unknown>) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'step_up_required') throw e;
      if (!(await this.askSecondFactor())) throw new ApiError(STEP_UP_CANCELLED, { code: 'step_up_cancelled' });
      return await fn();
    }
  }

  /** The open dialog's answer: true once a code was accepted, false when it was closed. */
  private stepUpAnswer: Promise<boolean> | null = null;
  private resolveStepUp: ((passed: boolean) => void) | null = null;

  /**
   * Opens the dialog and sends the first code. An action refused while the dialog is already open
   * waits for the same answer instead of opening a second one.
   */
  private askSecondFactor(): Promise<boolean> {
    if (this.stepUpAnswer) return this.stepUpAnswer;
    this.stepUp.set({ sentAt: null, working: false, error: null });
    this.stepUpAnswer = new Promise<boolean>((resolve) => (this.resolveStepUp = resolve));
    void this.sendStepUpCode();
    return this.stepUpAnswer;
  }

  /**
   * The dialog's first code and its "Kodu yeniden gönder". Not again within `STEP_UP_RESEND_MS` of the
   * last code: the server would silently send nothing, and the founder would wait for a code that never comes.
   */
  async sendStepUpCode() {
    const s = this.stepUp();
    if (!s || s.working || (s.sentAt !== null && Date.now() - s.sentAt < STEP_UP_RESEND_MS)) return;
    this.stepUp.set({ ...s, working: true, error: null });
    try {
      await this.api.sendStepUpCode();
      this.patchStepUp({ sentAt: Date.now(), working: false });
    } catch (e) {
      if (this.sessionLost(e)) return;
      // 409 no_email and 429 are shown as the API (or toApiError) words them.
      this.patchStepUp({ working: false, error: e instanceof ApiError ? shownMessage(e) : 'Kod gönderilemedi. Lütfen yeniden deneyiniz.' });
      if (!(e instanceof ApiError)) console.error(e);
    }
  }

  /** The dialog's six digits. On success the dialog closes and the refused action runs again (`withSecondFactor`). */
  async verifyStepUpCode(code: string) {
    const s = this.stepUp();
    if (!s || s.working) return;
    if (!/^\d{6}$/.test(code)) return this.stepUp.set({ ...s, error: 'Altı haneli kodu yazınız.' });
    this.stepUp.set({ ...s, working: true, error: null });
    try {
      await this.api.verifyStepUpCode(code);
      this.closeStepUp(true);
    } catch (e) {
      if (this.sessionLost(e)) return;
      // A wrong code: the API's general title, and the useful sentence under `code` (shownMessage).
      this.patchStepUp({ working: false, error: e instanceof ApiError ? shownMessage(e) : 'Kod doğrulanamadı. Lütfen yeniden deneyiniz.' });
      if (!(e instanceof ApiError)) console.error(e);
    }
  }

  /** The founder closed the dialog: the refused action ends without being sent again. */
  cancelStepUp() {
    this.closeStepUp(false);
  }

  /** Demo index only (mock mode): opens the dialog with no action behind it. The mock never asks for it by itself. */
  previewStepUp() {
    this.demoTools();
    void this.askSecondFactor();
  }

  private patchStepUp(change: Partial<StepUpState>) {
    const s = this.stepUp();
    if (s) this.stepUp.set({ ...s, ...change });
  }

  private closeStepUp(passed: boolean) {
    const resolve = this.resolveStepUp;
    this.resolveStepUp = null;
    this.stepUpAnswer = null;
    this.stepUp.set(null);
    resolve?.(passed);
  }
}

/** Refusals that mean the screen was out of date; the store reads the application again (`update`). */
const OUT_OF_DATE = ['wrong_stage', 'payment_open', 'no_open_payment', 'no_open_call', 'no_valid_signature'];

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
