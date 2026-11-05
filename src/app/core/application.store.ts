import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Clock } from './clock';
import { DemoSettings } from './demo-settings';
import { pdfBytes, zipBytes } from './files';
import { dateTime, initials } from './format';
import { ApiError, MockApi, ReviewPatch } from './mock-api';
import { Account, Application, DocItem, FounderType, LogEntry, Stage, stepOf } from './models';
import {
  callView,
  DURATION,
  eligibilityEvents,
  eligibilityView,
  progress,
  scanView,
  setupEvents,
  setupView,
} from './timeline';

const SESSION_KEY = 'dsp.session.v1';

/** Screen each stage lives on. */
export function routeFor(stage: Stage | null, founderType: FounderType = 'foreign'): string {
  switch (stage) {
    case null:
      return '/login';
    case 'registered':
      return '/verify-email';
    case 'verified':
      return '/deck';
    case 'scanning':
      return '/deck/scan';
    case 'review':
      return '/deck/review';
    case 'titleConflict':
      return '/deck/name-rejected';
    case 'eligibility':
      return '/eligibility';
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
 * Single source of truth for the signed-in founder and their application. Screens read signals
 * from here and call its actions; it talks to the (mock) API and keeps long-running steps moving.
 */
@Injectable({ providedIn: 'root' })
export class ApplicationStore {
  private readonly api = inject(MockApi);
  private readonly demo = inject(DemoSettings);
  readonly now = inject(Clock).now;

  readonly account = signal<Account | null>(null);
  readonly app = signal<Application | null>(null);
  /** True while an action is in flight (buttons show a spinner / disable). */
  readonly busy = signal(false);
  /** Last action error, shown next to the action that failed. */
  readonly error = signal<string | null>(null);

  // ------------------------------------------------------------------------------ derived

  readonly signedIn = computed(() => !!this.account());
  readonly stage = computed<Stage | null>(() => this.app()?.stage ?? (this.account() ? (this.account()!.verified ? 'verified' : 'registered') : null));
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

  readonly scan = computed(() => {
    const a = this.app();
    if (!a?.deck) return null;
    const p = a.stage === 'scanning' ? progress(a.deck.startedAt, this.dur(DURATION.scan), this.now()) : 1;
    return scanView(a, p);
  });

  readonly eligibility = computed(() => {
    const a = this.app();
    if (!a?.eligibility) return null;
    const p = a.stage === 'eligibility' ? progress(a.eligibility.startedAt, this.dur(DURATION.eligibility), this.now()) : 1;
    return eligibilityView(p);
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
    this.restore();
    // Finish time-based steps when their simulated duration has elapsed.
    effect(() => {
      const a = this.app();
      if (!a) return;
      const done =
        (a.stage === 'scanning' && this.scan()?.p === 1) ||
        (a.stage === 'eligibility' && this.eligibility()?.p === 1) ||
        (a.stage === 'calling' && this.call()?.p === 1) ||
        (a.stage === 'setup' && this.setup()?.p === 1);
      if (done) untracked(() => this.complete(a.stage));
    });
  }

  // ---------------------------------------------------------------------------- actions

  async register(input: { firstName: string; lastName: string; email: string; password: string }) {
    return this.run(async () => {
      const acc = await this.api.register(input);
      this.setSession(acc, null);
    });
  }

  async login(email: string, password: string) {
    return this.run(async () => {
      const r = await this.api.login(email, password);
      this.setSession(r.account, r.app);
    });
  }

  /** e-Devlet sign-in for T.C. citizens; creates the account on first use. */
  async edevlet(tckn: string) {
    return this.run(async () => {
      const r = await this.api.edevlet(tckn);
      this.setSession(r.account, r.app);
    });
  }

  logout() {
    this.setSession(null, null);
  }

  verifyEmail = (code: string) =>
    this.run(async () => {
      const r = await this.api.verifyEmail(this.email(), code);
      this.setSession(r.account, r.app);
    });

  resendEmailCode = () => this.run(() => this.api.resendEmailCode(this.email()));
  requestPasswordReset = (email: string) => this.run(() => this.api.requestPasswordReset(email));

  uploadDeck = (file: { name: string; size: number }) => this.update(() => this.api.uploadDeck(this.email(), file));
  updateReview = (patch: ReviewPatch, edited: string[]) => this.update(() => this.api.updateReview(this.email(), patch, edited));
  submitReview = () => this.update(() => this.api.submitReview(this.email()));
  chooseTitle = (title: string) => this.update(() => this.api.chooseTitle(this.email(), title));
  backToReview = () => this.update(() => this.api.backToReview(this.email()));
  proceedToPayment = () => this.update(() => this.api.proceedToPayment(this.email()));
  pay = (card: { holder: string; number: string; expiry: string; cvv: string }) => this.update(() => this.api.pay(this.email(), card));
  resendOtp = () => this.update(() => this.api.resendOtp(this.email()));
  cancel3ds = () => this.update(() => this.api.cancel3ds(this.email()));
  confirm3ds = (code: string) => this.update(() => this.api.confirm3ds(this.email(), code));
  startCall = () => this.update(() => this.api.startCall(this.email()));
  endCall = () => this.update(() => this.api.endCall(this.email()));
  signResident = (method: 'existing' | 'edevlet') => this.update(() => this.api.signResident(this.email(), method));
  startSetup = () => this.update(() => this.api.startSetup(this.email()));
  ask = (q: string) => this.api.ask(q);

  /** Demo panel: create the demo founder at a given stage and sign in as them. */
  async seed(stage: Stage, founderType: FounderType = 'foreign') {
    return this.run(async () => {
      const r = await this.api.seed(stage, founderType);
      this.setSession(r.account, r.app);
    });
  }

  resetAll() {
    this.api.reset();
    this.setSession(null, null);
  }

  clearError() {
    this.error.set(null);
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
      'Bu belge Dijital Sirket Platformu prototipinde uretilmis ornek bir dosyadir.',
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
    const email = this.email();
    try {
      const fn = {
        scanning: () => this.api.completeScan(email),
        eligibility: () => this.api.completeEligibility(email),
        calling: () => this.api.completeCall(email),
        setup: () => this.api.completeSetup(email),
      }[stage as 'scanning'];
      if (fn) this.app.set(await fn());
    } catch (e) {
      // Another tab may have advanced the application already: resync.
      this.restore();
      if (!(e instanceof ApiError)) throw e;
    } finally {
      this.completing = null;
    }
  }

  private liveEvents(a: Application): { logs: LogEntry[]; docs: DocItem[] } {
    const now = this.now();
    if (a.stage === 'eligibility' && a.eligibility) {
      const ev = eligibilityEvents(a, this.dur(DURATION.eligibility));
      return { logs: ev.logs.filter((l) => Date.parse(l.at) <= now), docs: [] };
    }
    if (a.stage === 'setup' && a.setup) {
      return setupEvents(a, this.setup()?.p ?? 0, this.dur(DURATION.setup));
    }
    return { logs: [], docs: [] };
  }

  private dur(base: number) {
    return base / this.demo.speed();
  }

  private email() {
    const e = this.account()?.email;
    if (!e) throw new ApiError('Oturum bulunamadı. Lütfen giriş yapın.');
    return e;
  }

  private setSession(account: Account | null, app: Application | null) {
    this.account.set(account);
    this.app.set(app);
    if (account) localStorage.setItem(SESSION_KEY, account.email);
    else localStorage.removeItem(SESSION_KEY);
  }

  private restore() {
    const email = localStorage.getItem(SESSION_KEY);
    if (!email) return;
    try {
      const db = JSON.parse(localStorage.getItem('dsp.db.v1') ?? '{}');
      const acc = (db.users ?? []).find((u: Account) => u.email === email) ?? null;
      this.account.set(acc);
      this.app.set(acc ? (db.apps?.[email] ?? null) : null);
      if (!acc) localStorage.removeItem(SESSION_KEY);
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  private async update(fn: () => Promise<Application>) {
    return this.run(async () => this.app.set(await fn()));
  }

  /** Runs an action with busy/error state. Resolves true on success. */
  private async run(fn: () => Promise<unknown>): Promise<boolean> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
      return true;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.');
      if (!(e instanceof ApiError)) console.error(e);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
