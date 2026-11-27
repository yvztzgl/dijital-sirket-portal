import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Api, ApplicationStatus, ReviewPatch, ServerWork, Session } from './api';
import { ApiError } from './api-error';
import { callStartedAt, toAccount, toApplication, toReviewFields, toStage } from './api-mapper';
import { ApplicationWire, EdevletStartWire, MeWire, PhoneLinkWire, PhoneStatusWire, StageWire } from './api-types';
import { Account, Application, DeckConsents, EvaluationAnswers, EvaluationQuestions, EvaluationReference, PhoneLinkStatus, Profile, QuestionAnswer, WizardReference } from './models';

/**
 * The real platform API over HTTP, used by the `http` build (see docs/api-client.md).
 *
 * Connected so far: sign-in (register, code, login, logout, password reset, e-Devlet), reading
 * the session back after a reload, step 1 (profile, the deck with the CV and the answers for the
 * outside evaluation, review, title, the reference data, and polling the status read while the
 * server works) and step 2 (identity check
 * on the computer or on the phone, declaration, the result, manual review), the second factor
 * ("step-up"), step 3 (payment with 3-D Secure), step 4 (the e-signature: the video call for foreign
 * founders, the method choice for residents) and step 5 (the formation, followed by polling). The session is an
 * HttpOnly cookie the server sets; this class never sees it, and nothing about the founder is kept
 * in the browser's storage (only in this object's memory, until sign-out or reload).
 *
 * Every write answers with an empty body (204 or 202); each write here is followed by a fresh read
 * of the application (`fresh`).
 *
 * What has no route on the API still rejects with "Bu işlem henüz sunucuya bağlanmadı." (code
 * `not_connected`): `backToReview` and Terminal AI's `ask`. TypeScript accepts an implementation that
 * takes fewer parameters, and `Api` (api.ts) shows the full signatures.
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
  /** The evaluation's dictionaries and limits, read once per session. */
  private evaluationData: Promise<EvaluationReference> | null = null;
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
  /**
   * The card holder and the last four digits of the card number typed for this application, so D-3b
   * can show "**** **** **** 4242": the API returns neither. Memory only, for this page's life; the
   * number itself, the expiry and the CVV are never kept anywhere (see `pay`).
   */
  private card: { applicationId: string; holder: string; last4: string } | null = null;
  /**
   * The video call this page reported ended (`call/complete`), by application and call start. The
   * API reports `calling` while the call is open and also while the certificate is being issued; this
   * is how the portal tells them apart (an API gap, docs/api-client.md). Memory only: after a reload
   * the scripted call runs to its end again and `completeCall` learns from the 409 that it was over.
   */
  private callCompleted: { applicationId: string; startedAt: string } | null = null;

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

  /** 202 always (silently nothing within 60 s of the last code); 409 `no_email`. Rate limited like sign-in. */
  async sendStepUpCode(): Promise<void> {
    await this.request('POST', '/api/auth/step-up');
  }

  /** 204: this session may pay, sign and start the formation for 15 minutes. A wrong code: 400 with `errors.code`. */
  async verifyStepUpCode(code: string): Promise<void> {
    await this.request('POST', '/api/auth/step-up/verify', { code });
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
    this.evaluationData = null;
    this.phoneLink = null;
    this.resultSeen.clear();
    this.card = null;
    this.callCompleted = null;
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
    const card = this.card?.applicationId === view.id ? { holder: this.card.holder, last4: this.card.last4 } : undefined;
    const callCompleted = this.callCompleted?.applicationId === view.id ? this.callCompleted.startedAt : undefined;
    const app = toApplication(view, this.account!, { resultSeen: this.resultSeen.has(view.id), card, callCompleted });
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

  /** `GET /api/reference/evaluation`, once per session; read again after a failure. */
  evaluationReference(): Promise<EvaluationReference> {
    this.evaluationData ??= this.request<EvaluationReference>('GET', '/api/reference/evaluation').catch((error: unknown) => {
      this.evaluationData = null;
      throw error;
    });
    return this.evaluationData;
  }

  // step 1 · profile and deck

  /** 204; at the upload step only: before the first upload, or after an evaluation that ended without a result (409 `wrong_stage` otherwise). 400 with `errors.<field>`. */
  async submitProfile(input: Omit<Profile, 'at'>): Promise<Application> {
    const { brand, sector, funding, nationality, phone, country } = input;
    await this.request('PUT', '/api/application/profile', { brand, sector, funding, nationality, phone, country });
    return this.fresh();
  }

  /**
   * 202, then the outside evaluation runs (stage `evaluating`, minutes). Multipart: the deck under
   * `file` (the part name of the first deck upload), the CV under `cv`, the summary and the two
   * single choices as text, each multiple choice as one repeated field per id, and the two ticks
   * exactly as the founder gave them. The browser sets the multipart Content-Type with its
   * boundary; setting it here would break the body. 400 `validation_failed` with `errors.<field>`
   * (deck, cv, summary, activityGroupId, activityId, businessModelIds, revenueModelIds, productTypeIds).
   */
  async uploadDeck(files: { deck: File; cv: File }, answers: EvaluationAnswers, consents: DeckConsents): Promise<Application> {
    const form = new FormData();
    form.append('file', files.deck, files.deck.name);
    form.append('cv', files.cv, files.cv.name);
    form.append('summary', answers.summary);
    if (answers.activityGroupId !== null) form.append('activityGroupId', String(answers.activityGroupId));
    if (answers.activityId !== null) form.append('activityId', String(answers.activityId));
    for (const id of answers.businessModelIds) form.append('businessModelIds', String(id));
    for (const id of answers.revenueModelIds) form.append('revenueModelIds', String(id));
    for (const id of answers.productTypeIds) form.append('productTypeIds', String(id));
    form.append('noticeAcknowledged', String(consents.noticeAcknowledged === true));
    form.append('aiConsent', String(consents.aiConsent === true));
    await this.request('POST', '/api/application/deck', form);
    return this.fresh();
  }

  /** `GET /api/application/evaluation/questions`; 404 `no_questions` when the evaluation does not wait on questions. */
  evaluationQuestions(): Promise<EvaluationQuestions> {
    return this.request<EvaluationQuestions>('GET', '/api/application/evaluation/questions');
  }

  /** 202, then the evaluation goes on (`evaluating`). The explanations are sent trimmed, null when empty. */
  async answerEvaluation(answers: QuestionAnswer[]): Promise<Application> {
    await this.request('POST', '/api/application/evaluation/answers', {
      answers: answers.map((a) => ({ targetFactId: a.targetFactId, optionId: a.optionId, explanation: a.explanation?.trim() || null })),
    });
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

  /** 202, stage `titleChecking`. 400 with one `errors.<field>` per missing field; 400 `nace_codes`. */
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

  /**
   * D-3a: 204, stage `threeDs`. The body is exactly `{ holder, cardToken }`: the card number, its
   * expiry and the CVV are never sent to the API and are kept nowhere here (only the last four
   * digits, in memory, for D-3b). 403 `step_up_required` (the store asks for the e-mailed code and
   * repeats the call); 400 `holder` / `cardToken`; 409 `payment_open`, `wrong_stage`; 422 `card_declined`.
   */
  async pay(card: { holder: string; number: string; expiry: string; cvv: string }): Promise<Application> {
    const holder = card.holder.trim();
    const last4 = card.number.replace(/\D/g, '').slice(-4);
    // DEVELOPMENT STAND-IN. The token must come from the payment provider: with a real provider the
    // card fields are the provider's own hosted fields (its iframe or page), the card data goes from
    // the browser straight to the provider, and the provider hands the portal a token for it. This
    // portal's own card form must NOT be used with a real provider. Here the API's development
    // provider (FakePaymentProvider) accepts `tok_test_` + four digits (`tok_test_0002` is declined),
    // so the token is made from the last four digits typed, and the number itself goes nowhere.
    const cardToken = `tok_test_${last4}`;
    await this.request('POST', '/api/application/payment', { holder, cardToken });
    if (this.view) this.card = { applicationId: this.view.id, holder: holder.toLocaleUpperCase('tr-TR'), last4 };
    return this.fresh();
  }

  /** 204, stage `signing`. A wrong code: 422 with the provider's code (development: `3ds_failed`), the payment stays open. */
  async confirm3ds(code: string): Promise<Application> {
    await this.request('POST', '/api/application/payment/3ds', { code: code.trim() });
    return this.fresh();
  }

  /** 204: the provider is asked to send the 3-D Secure code again. 409 `no_open_payment`. */
  async resendOtp(): Promise<Application> {
    await this.request('POST', '/api/application/payment/3ds/resend');
    return this.fresh();
  }

  /** 204, back to `payment` (the payment is recorded as failed). 409 `no_open_payment`. */
  async cancel3ds(): Promise<Application> {
    await this.request('POST', '/api/application/payment/3ds/cancel');
    return this.fresh();
  }

  // step 4 · e-signature

  /** D-4a's tick: 204, idempotent (the view then has `callConsentAt`). The consent is sent exactly as ticked. */
  async acceptCallTerms(consent: boolean): Promise<Application> {
    await this.request('POST', '/api/application/esign/consent', { consent: consent === true });
    return this.fresh();
  }

  /**
   * "Operatörü ara": 204, stage `calling`. Needs the second factor (403 `step_up_required`: the store
   * asks for the code and repeats the call once). Foreign founders only (409 `wrong_flow`); 409
   * `consent_missing` without D-4a's tick. Idempotent while a call is open.
   */
  async startCall(): Promise<Application> {
    await this.request('POST', '/api/application/esign/call/start');
    return this.fresh();
  }

  /** "Görüşmeyi bitir": 204, the call is cancelled and the stage is `signing` again. 409 `no_open_call`. */
  async endCall(): Promise<Application> {
    await this.request('POST', '/api/application/esign/call/end');
    return this.fresh();
  }

  /**
   * The scripted call reached its end. There is no video or e-signature vendor yet: the call is the
   * portal's own simulation in both modes, and this tells the server it is over; the provider then
   * issues the certificate (the Worker), stage `signed`, which the store polls for. 202.
   * 409 `no_open_call`: the call was already completed (before a reload of this page) or ended
   * elsewhere; the application is read again, and if it is still at `calling` the certificate is
   * being issued.
   */
  async completeCall(): Promise<Application> {
    const startedAt = this.view ? callStartedAt(this.view) : undefined;
    try {
      await this.request('POST', '/api/application/esign/call/complete');
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'no_open_call') throw error;
    }
    if (this.view && startedAt) this.callCompleted = { applicationId: this.view.id, startedAt };
    return this.fresh();
  }

  /**
   * D-4d: a resident signs with an existing e-signature or a new one through e-Devlet. 202; the
   * provider answers through the Worker, and meanwhile the API reports `calling` (an e-signature work
   * item is open; there is no call). Needs the second factor; residents only (409 `wrong_flow`).
   */
  async signResident(method: 'existing' | 'edevlet'): Promise<Application> {
    await this.request('POST', '/api/application/esign/resident', { method });
    return this.fresh();
  }

  // step 5 · formation

  /**
   * D-4c "Kuruluşu başlat": 202, stage `setup`; the Worker then creates the steps (`setup` is null
   * until it has). Needs the second factor and the tick as given (400 `errors.confirmed`); 409
   * `no_valid_signature` when the certificate has expired (the store reads the application again).
   */
  async startSetup(confirmed: boolean): Promise<Application> {
    await this.request('POST', '/api/application/setup', { confirmed: confirmed === true });
    return this.fresh();
  }

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
