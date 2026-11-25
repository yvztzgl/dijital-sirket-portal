import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Api, Session } from './api';
import { ApiError } from './api-error';
import { Account, Application, PhoneLinkStatus } from './models';

/**
 * The real platform API over HTTP, used by the `http` build (see docs/api-client.md).
 *
 * Not connected yet: every method rejects with "Bu işlem henüz sunucuya bağlanmadı." (code
 * `not_connected`). Later pieces connect one flow at a time through `request()`.
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
  register(): Promise<Account> { return notConnected(); }
  edevlet(): Promise<Session & { created: boolean }> { return notConnected(); }
  login(): Promise<Session> { return notConnected(); }
  resendEmailCode(): Promise<void> { return notConnected(); }
  verifyEmail(): Promise<Session> { return notConnected(); }
  requestPasswordReset(): Promise<void> { return notConnected(); }

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
   * into an `ApiError`, so the store can show the server's own sentence. Unused until the first
   * method is connected; http-api.spec.ts tests it.
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
