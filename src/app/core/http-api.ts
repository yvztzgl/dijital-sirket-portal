import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Api, Session } from './api';
import { ApiError } from './api-error';
import { toAccount, toApplication } from './api-mapper';
import { ApplicationWire, EdevletStartWire, MeWire } from './api-types';
import { Application, PhoneLinkStatus } from './models';

/**
 * The real platform API over HTTP, used by the `http` build (see docs/api-client.md).
 *
 * Connected so far: sign-in (register, code, login, logout, password reset, e-Devlet) and reading
 * the session back after a reload. The session is an HttpOnly cookie the server sets; this class
 * never sees it, and nothing about the founder is kept in the browser's storage.
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

  /** After a reload: the session the browser's cookie still holds, or null (401) when there is none. */
  async restore(): Promise<Session | null> {
    try {
      return await this.session();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }

  /**
   * What every sign-in ends with: who is signed in, then their application. Signing in does not
   * create one on the API, so a 404 `no_application` is answered by creating it (idempotent) and
   * reading again.
   */
  private async session(): Promise<Session> {
    const account = toAccount(await this.request<MeWire>('GET', '/api/me'));
    let view: ApplicationWire;
    try {
      view = await this.request<ApplicationWire>('GET', '/api/application');
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'no_application') throw error;
      await this.request('POST', '/api/application');
      view = await this.request<ApplicationWire>('GET', '/api/application');
    }
    return { account, app: toApplication(view, account) };
  }

  // step 1 · profile and deck
  submitProfile(): Promise<Application> { return notConnected(); }
  uploadDeck(): Promise<Application> { return notConnected(); }
  completeScan(): Promise<Application> { return notConnected(); }
  updateReview(): Promise<Application> { return notConnected(); }
  submitReview(): Promise<Application> { return notConnected(); }
  chooseTitle(): Promise<Application> { return notConnected(); }
  resolveCrossCheck(): Promise<Application> { return notConnected(); }

  // step 2 · eligibility
  startEligibility(): Promise<Application> { return notConnected(); }
  completeIdentity(): Promise<Application> { return notConnected(); }
  submitDeclaration(): Promise<Application> { return notConnected(); }
  completeScreening(): Promise<Application> { return notConnected(); }
  createPhoneLink(): Promise<Application> { return notConnected(); }
  backToReview(): Promise<Application> { return notConnected(); }
  proceedToPayment(): Promise<Application> { return notConnected(); }
  phoneLinkStatus(): Promise<PhoneLinkStatus> { return notConnected(); }
  startEligibilityByPhone(): Promise<PhoneLinkStatus> { return notConnected(); }
  completeIdentityByPhone(): Promise<PhoneLinkStatus> { return notConnected(); }

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
  completeSetup(): Promise<Application> { return notConnected(); }

  // Terminal AI
  ask(): Promise<string> { return notConnected(); }

  /**
   * Every call to the API goes through here: it sends the request and turns an error response
   * into an `ApiError`, so the store can show the server's own sentence. http-api.spec.ts tests it.
   */
  private async request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<T> {
    try {
      return await firstValueFrom(this.http.request<T>(method, url, { body }));
    } catch (error) {
      throw toApiError(error);
    }
  }
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
