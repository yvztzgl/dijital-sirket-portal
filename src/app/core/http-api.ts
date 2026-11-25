import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Api, ApplicationStatus, ReviewPatch, ServerWork, Session } from './api';
import { ApiError } from './api-error';
import { toAccount, toApplication, toReviewFields, toStage } from './api-mapper';
import { ApplicationWire, EdevletStartWire, MeWire, PhoneLinkWire, PhoneStatusWire, StageWire } from './api-types';
import { Account, Application, CrossKey, DeckConsents, PhoneLinkStatus, Profile, WizardReference } from './models';

/**
 * The real platform API over HTTP, used by the `http` build (see docs/api-client.md).
 *
 * Connected so far: sign-in (register, code, login, logout, password reset, e-Devlet), reading
 * the session back after a reload, step 1 (profile, deck, review, cross-checks, title, the
 * reference data, and polling the status read while the server works) and step 2 (identity check
 * on the computer or on the phone, declaration, the result, manual review). The session is an
 * HttpOnly cookie the server sets; this class never sees it, and nothing about the founder is kept
 * in the browser's storage (only in this object's memory, until sign-out or reload).
 *
 * Every write answers with an empty body (204 or 202); each write here is followed by a fresh read
 * of the application (`fresh`).
 *
 * Everything else still rejects with "Bu işlem henüz sunucuya bağlanmadı." (code `not_connected`).
 * Parameters are left off until a method is connected; TypeScript accepts an implementation that
 * takes fewer of them, and `Api` (api.ts) shows the full signatures.
 *
 * `implements` rather than `extends` for the same reason as MockApi: api.ts imports the
 * environment, which imports this file.
 */
@Injectable({ providedIn: 'root' })
export class HttpApi implements Api {
  private readonly http = inject(HttpClient);

  /** No demo tools against a real server. */
  readonly demo = null;

  /** The server does the background work; the store polls (see `Api.work`). */
  readonly work: ServerWork = {
    kind: 'server',
    status: () => this.status(),
    application: () => this.fresh(),
    seen: () => this.seenStatus,
  };

  /** Who is signed in (the mapper takes the name from it until the review has one). */
  private account: Account | null = null;
  /** The last application as the API sent it: `updateReview` sends only what differs from it. */
  private view: ApplicationWire | null = null;
  /** The status read made just before the last full read (see `ServerWork.seen`). */
  private seenStatus: ApplicationStatus | null = null;
  /** The reference data, read once per session. */
  private referenceData: Promise<WizardReference> | null = null;
  /**
   * The phone link's token, which the API gives only in the answer to `POST /phone-link`. Kept in
   * this object's memory while the QR code is shown (never in storage), put on the mapped
   * application as `phoneLink`, and dropped when the founder leaves the QR view, when the check has
   * started (on either device), when the stage moves on, and on sign-out.
   */
  private phoneLink: NonNullable<Application['phoneLink']> | null = null;
  /**
   * The applications (by the API's id) whose result screen the founder has left with "Ödemeye geç".
   * Memory only, so nothing is written to the browser's storage; after a reload the result screen
   * shows once more, which asks nothing of the server (see `proceedToPayment`).
   */
  private readonly resultSeen = new Set<string>();

  // auth

  /** 202 and nothing else, also when the address already has an account (the API does not say which). */
  async register(input: { firstName: string; lastName: string; email: string; password: string }): Promise<void> {
    await this.request('POST', '/api/auth/register', input);
  }

  /** 202 always; within 60 seconds of the last code the server silently sends nothing. */
  async resendEmailCode(email: string): Promise<void> {
    await this.request('POST', '/api/auth/resend-code', { email });
  }

  /** 204 and the session cookie: confirming the address signs in. */
  async verifyEmail(email: string, code: string): Promise<Session> {
    await this.request('POST', '/api/auth/verify-email', { email, code });
    return this.session();
  }

  /** 401 `invalid_credentials`; 403 `email_not_verified` (the server has sent a new code). */
  async login(email: string, password: string): Promise<Session> {
    await this.request('POST', '/api/auth/login', { email, password });
    return this.session();
  }

  async logout(): Promise<void> {
    this.forget();
    await this.request('POST', '/api/auth/logout');
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.request('POST', '/api/auth/password-reset', { email });
  }

  /** 204; does not sign in, and ends every session of the account. 422 `link_invalid`. */
  async confirmPasswordReset(token: string, password: string): Promise<void> {
    await this.request('POST', '/api/auth/password-reset/confirm', { token, password });
  }

  /**
   * Development stand-in for the e-Devlet redirect. The real flow sends the browser to
   * `redirectUrl` (e-Devlet Kapısı), which comes back to the portal with `code` and `state`. In
   * development the API's fake e-Devlet answers a relative `/edevlet-test?state=…` and accepts any
   * T.C. kimlik no with valid check digits as the `code`, so the dialog (EdevletDialog) takes the
   * number and this method plays the return trip. `start` also sets the state cookie the second
   * call is checked against. To be replaced when the real integration exists.
   */
  async edevlet(tckn: string): Promise<Session> {
    const { redirectUrl } = await this.request<EdevletStartWire>('GET', '/api/auth/edevlet/start');
    // Any base will do: only the query string is read.
    const state = new URL(redirectUrl, 'http://portal.invalid').searchParams.get('state') ?? '';
    await this.request('POST', '/api/auth/edevlet', { code: tckn, state });
    return this.session();
  }

  /**
   * After a reload: the session the browser's cookie still holds, or null (401) when there is none.
   * A founder without an open application is not given a new one here (see `session`).
   */
  async restore(): Promise<Session | null> {
    try {
      return await this.session(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }

  /**
   * What every sign-in ends with: who is signed in, then their application. Signing in does not
   * create one on the API, so after an explicit sign-in (`create`) a 404 `no_application` is
   * answered by creating it (idempotent) and reading again. Nowhere else: not after a reload and
   * never while the portal holds an application. The API cannot tell "never had one" from "closed by
   * staff", so a reload after a rejection shows the closed state (`closed`) rather than silently
   * starting again; the next sign-in does create a new application (an API gap, docs/api-client.md).
   */
  private async session(create = true): Promise<Session> {
    this.forget();
    const account = toAccount(await this.request<MeWire>('GET', '/api/me'));
    this.account = account;
    let app: Application;
    try {
      app = await this.fresh();
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'no_application') throw error;
      if (!create) return { account, app: null, closed: true };
      await this.request('POST', '/api/application');
      app = await this.fresh();
    }
    return { account, app };
  }

  /** Drops what this object remembers of the founder (sign-out, a new sign-in). */
  private forget() {
    this.account = null;
    this.view = null;
    this.seenStatus = null;
    this.referenceData = null;
    this.phoneLink = null;
    this.resultSeen.clear();
  }

  /** The light read: stage and change time, nothing decrypted on the server. */
  private async status(): Promise<ApplicationStatus> {
    const s = await this.request<{ stage: StageWire; changedAt: string }>('GET', '/api/application/status');
    return { stage: toStage(s.stage), changedAt: s.changedAt };
  }

  /**
   * The full read, mapped to the portal's model. The status read goes first, so that the status
   * remembered as seen is never newer than the application read after it: anything that changes in
   * between shows up as a different `changedAt` at the next poll.
   */
  private async fresh(): Promise<Application> {
    const status = await this.status();
    const view = await this.request<ApplicationWire>('GET', '/api/application');
    const account = this.account ?? (this.account = toAccount(await this.request<MeWire>('GET', '/api/me')));
    this.view = view;
    this.seenStatus = status;
    return this.mapped();
  }

  /** The last view, mapped, with what only this object knows: the phone link and whether the result was seen. */
  private mapped(): Application {
    const view = this.view!;
    // The QR code is no longer shown once a check is open or the identity step is over.
    if (view.stage !== 'eligibility' || view.eligibility?.running || view.eligibility?.identityDone) this.phoneLink = null;
    const app = toApplication(view, this.account!, { resultSeen: this.resultSeen.has(view.id) });
    return this.phoneLink ? { ...app, phoneLink: this.phoneLink } : app;
  }

  /** `GET /api/reference/wizard`, once per session; read again after a failure. */
  reference(): Promise<WizardReference> {
    this.referenceData ??= this.request<WizardReference>('GET', '/api/reference/wizard').catch((error: unknown) => {
      this.referenceData = null;
      throw error;
    });
    return this.referenceData;
  }

  // step 1 · profile and deck

  /** 204; only before a deck is uploaded (409 `wrong_stage` after). 400 with `errors.<field>`. */
  async submitProfile(input: Omit<Profile, 'at'>): Promise<Application> {
    const { brand, sector, funding, nationality, phone, country } = input;
    await this.request('PUT', '/api/application/profile', { brand, sector, funding, nationality, phone, country });
    return this.fresh();
  }

  /**
   * 202, then the Worker reads the deck (stage `scanning`). Multipart: the file itself and the two
   * ticks exactly as the founder gave them. The browser sets the multipart Content-Type with its
   * boundary; setting it here would break the body.
   */
  async uploadDeck(file: File, consents: DeckConsents): Promise<Application> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('noticeAcknowledged', String(consents.noticeAcknowledged === true));
    form.append('aiConsent', String(consents.aiConsent === true));
    await this.request('POST', '/api/application/deck', form);
    return this.fresh();
  }

  /** 204; 422 `no_choice_needed` on an item that matches. */
  async resolveCrossCheck(key: CrossKey, choice: 'stated' | 'read'): Promise<Application> {
    await this.request('POST', `/api/application/cross-checks/${encodeURIComponent(key)}`, { choice });
    return this.fresh();
  }

  /**
   * 204. Only the fields that differ from the review as last read are sent (the API refuses an empty
   * change and records each value sent as a new claim). `edited` is the mock's: the API sets the marks.
   */
  async updateReview(patch: ReviewPatch, _edited: string[] = []): Promise<Application> {
    if (!this.view) await this.fresh();
    const fields = toReviewFields(patch, this.view!);
    if (Object.keys(fields).length > 0) await this.request('PATCH', '/api/application/review', { fields });
    return this.fresh();
  }

  /** 202, stage `titleChecking`. 422 `crosscheck_open`; 400 with one `errors.<field>` per missing field; 400 `nace_codes`. */
  async submitReview(): Promise<Application> {
    await this.request('POST', '/api/application/review/submit');
    return this.fresh();
  }

  /** 202, back to `titleChecking`; only after a refused title. The server adds " A.Ş.". */
  async chooseTitle(title: string): Promise<Application> {
    await this.request('POST', '/api/application/title', { title: title.trim() });
    return this.fresh();
  }

  // step 2 · eligibility

  /**
   * 204; idempotent while a check is open, and cancels an unused phone link (so the token is dropped
   * here too). The consent is sent exactly as ticked; the API refuses `false` (400 `errors.consent`).
   * 409 `already_verified`; 409 `identity_review` after too many failed checks.
   */
  async startEligibility(consent: boolean): Promise<Application> {
    await this.request('POST', '/api/application/identity/start', { consent: consent === true });
    this.phoneLink = null;
    return this.fresh();
  }

  /**
   * 202: the camera check on this computer ended. There is no identity vendor yet, so the camera is
   * the portal's own animation (as in the mock); when it ends the store calls this, and the API's
   * Worker decides (dev: always a pass). The store then polls until the stage is `declaration`, or
   * `eligibility` with `identityError`, or `manual` after the second failure.
   * 409 `identity_not_started` when no check is waiting (finished elsewhere, or already sent).
   */
  async completeIdentity(): Promise<Application> {
    await this.request('POST', '/api/application/identity/complete');
    return this.fresh();
  }

  /**
   * 202, stage `screening`. Multipart: the file itself (PDF, JPG or PNG; 10 MB; the API checks the
   * bytes) and the tick as given. As with the deck, the browser sets the multipart Content-Type.
   */
  async submitDeclaration(input: { file: File | null; declared: boolean }): Promise<Application> {
    const form = new FormData();
    if (input.file) form.append('file', input.file, input.file.name);
    form.append('declared', String(input.declared === true));
    await this.request('POST', '/api/application/declaration', form);
    return this.fresh();
  }

  /**
   * 200 `{token, expiresInSeconds}` (ten minutes); a new link revokes an unused one. The token is
   * in this answer only: it is kept in memory (`phoneLink`) and never written anywhere.
   * 409 `identity_started` while a check is open.
   */
  async createPhoneLink(): Promise<Application> {
    const { token, expiresInSeconds } = await this.request<PhoneLinkWire>('POST', '/api/application/phone-link');
    const now = Date.now();
    const link = { token, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + expiresInSeconds * 1000).toISOString() };
    const app = await this.fresh();
    // Read after the link was made: unless the read says the step is over, show it.
    if (app.stage !== 'eligibility' || app.eligibility?.running) return app;
    this.phoneLink = link;
    return { ...app, phoneLink: link };
  }

  /** The founder left the QR view: the token is forgotten. The link itself expires on the server (or a new one revokes it). */
  forgetPhoneLink(): Application | null {
    this.phoneLink = null;
    return this.view && this.account ? this.mapped() : null;
  }

  /** Not offered in HTTP mode: the API has no route back from manual review (open decision 12). */
  backToReview(): Promise<Application> { return notConnected(); }

  /**
   * "Ödemeye geç" on the result screen. The API is already at `payment`; leaving the screen is the
   * founder's acknowledgement only, so nothing is sent: the result is marked seen in memory and the
   * last view mapped again. Anywhere else (manual review) it is refused like an unconnected call.
   */
  async proceedToPayment(): Promise<Application> {
    if (!this.view || !this.account || this.mapped().stage !== 'eligible') return notConnected();
    this.resultSeen.add(this.view.id);
    return this.mapped();
  }

  // step 2 · the phone page. No session: the token goes in the X-DSP-Phone-Token header only, never
  // in a URL. These routes share the sign-in rate limit (20 a minute per address), so the phone page
  // polls slowly (ApplicationStore.PHONE_POLL_MS).

  /** Never an error for a bad token: `invalid`. */
  async phoneLinkStatus(token: string): Promise<PhoneLinkStatus> {
    const s = await this.request<PhoneStatusWire>('GET', '/api/phone/status', undefined, phoneHeaders(token));
    switch (s.state) {
      case 'ready':
        return s.expiresAt ? { state: 'ready', expiresAt: s.expiresAt } : { state: 'invalid' };
      case 'running':
        // The API always sends `startedAt` with `running` (when the link was used); the fallback only starts the animation now.
        return { state: 'running', startedAt: s.startedAt ?? new Date().toISOString() };
      case 'expired':
      case 'done':
        return { state: s.state };
      default:
        return { state: 'invalid' };
    }
  }

  /** 204, then the status. The consent exactly as ticked. 409 `link_expired`; 401 `link_invalid`. */
  async startEligibilityByPhone(token: string, consent: boolean): Promise<PhoneLinkStatus> {
    await this.request('POST', '/api/phone/start', { consent: consent === true }, phoneHeaders(token));
    return this.phoneLinkStatus(token);
  }

  /** 202 when the phone's camera animation ended (see `completeIdentity`), then the status (`running` until the Worker decides). */
  async completeIdentityByPhone(token: string): Promise<PhoneLinkStatus> {
    await this.request('POST', '/api/phone/complete', undefined, phoneHeaders(token));
    return this.phoneLinkStatus(token);
  }

  // step 3 · payment
  pay(): Promise<Application> { return notConnected(); }
  resendOtp(): Promise<Application> { return notConnected(); }
  cancel3ds(): Promise<Application> { return notConnected(); }
  confirm3ds(): Promise<Application> { return notConnected(); }

  // step 4 · e-signature
  acceptCallTerms(): Promise<Application> { return notConnected(); }
  startCall(): Promise<Application> { return notConnected(); }
  endCall(): Promise<Application> { return notConnected(); }
  completeCall(): Promise<Application> { return notConnected(); }
  signResident(): Promise<Application> { return notConnected(); }

  // step 5 · formation
  startSetup(): Promise<Application> { return notConnected(); }

  // Terminal AI
  ask(): Promise<string> { return notConnected(); }

  /**
   * Every call to the API goes through here: it sends the request and turns an error response
   * into an `ApiError`, so the store can show the server's own sentence. http-api.spec.ts tests it.
   */
  private async request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    try {
      return await firstValueFrom(this.http.request<T>(method, url, { body, headers }));
    } catch (error) {
      throw toApiError(error);
    }
  }
}

/** The phone link's header. The API's PhoneLinkResolver reads the token from here and nowhere else. */
function phoneHeaders(token: string): Record<string, string> {
  return { 'X-DSP-Phone-Token': token };
}

function notConnected(): Promise<never> {
  return Promise.reject(new ApiError('Bu işlem henüz sunucuya bağlanmadı.', { code: 'not_connected' }));
}

/** Shown when the response says nothing we can show: the network failed or the body is not a problem. */
const FALLBACK_MESSAGE = 'Beklenmeyen bir hata oluştu.';
/** The API's rate limiter answers 429 with the title "İstek karşılanamadı.", which does not tell the founder what to do. */
const TOO_MANY_MESSAGE = 'Çok fazla deneme yapıldı. Lütfen bir dakika sonra yeniden deneyiniz.';

/**
 * The API's error body (`application/problem+json`). `title` is a Turkish sentence for the founder,
 * `code` the stable machine code, `errors` (only with `validation_failed`) the messages per field.
 */
interface Problem {
  type?: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
  errors?: Record<string, string[]>;
}

/** Turns what HttpClient throws into an ApiError. Anything that is not an HTTP error passes through unchanged. */
export function toApiError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse)) return error;
  const problem = isProblem(error.error) ? error.error : null;
  if (error.status === 429) return new ApiError(TOO_MANY_MESSAGE, { code: problem?.code ?? 'http_429', status: 429 });
  return new ApiError(problem?.title ?? FALLBACK_MESSAGE, {
    code: problem?.code,
    // Status 0 means the request never got an answer (network down, proxy target not running).
    status: error.status || undefined,
    fields: problem?.errors,
  });
}

function isProblem(body: unknown): body is Problem {
  return typeof body === 'object' && body !== null && typeof (body as Problem).title === 'string';
}

/**
 * Adds `X-DSP-Request: 1` to every write sent to the API. The API refuses a POST/PUT/PATCH/DELETE
 * without it: a plain HTML form on another site cannot set a custom header, so this blocks
 * cross-site request forgery. Reads (GET/HEAD/OPTIONS) do not need it.
 */
export const markApiWrites: HttpInterceptorFn = (request, next) => {
  const isRead = ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (isRead || !request.url.startsWith('/api/')) return next(request);
  return next(request.clone({ setHeaders: { 'X-DSP-Request': '1' } }));
};
