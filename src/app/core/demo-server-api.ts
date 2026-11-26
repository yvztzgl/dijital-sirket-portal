import type { HttpClient } from '@angular/common/http';
import { computed, inject, InjectionToken, Injectable, Injector, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { isDemo } from '../../environments/demo-flag';
import { Api } from './api';

/**
 * The build's demo switch (`src/environments/demo-flag.ts`, on only in the `http-demo` build). A token
 * so the specs can turn it on without a second build.
 */
export const DEMO_FLAG = new InjectionToken<boolean>('DEMO_FLAG', { providedIn: 'root', factory: () => isDemo });

/** `GET /api/demo` when the API runs with `Demo:Enabled`. */
export interface DemoInfo {
  enabled: boolean;
  /** The stand-in bank's 3-D Secure code (fixed). */
  threeDsCode: string | null;
}

/** `GET /api/demo/codes?email=`: the newest development e-mail to that address. */
export interface DemoCodes {
  code: string | null;
  link: string | null;
  sentAt: string | null;
}

/** `POST /api/demo/setup/next`: which institution task was completed and how many are still open. */
export interface DemoSetupStep {
  completed: string;
  remaining: number;
}

export type DemoEvaluationOutcome = 'done' | 'questions' | 'failed' | 'rejected';

/**
 * Demo controls against the real API (docs/api-client.md, "Demo mode against the API"). Wraps the
 * API's `/api/demo/*` routes, which exist only when the API runs with `Demo:Enabled` on a developer's
 * machine. Kept out of the `Api` contract on purpose: the real client stays clean, and the mock has
 * its own demo panel (`Api.demo`).
 *
 * `available` is true only when all three hold:
 * 1. this build has the demo flag (`http-demo`),
 * 2. the portal runs in HTTP mode (`Api.demo` is null),
 * 3. the API answered `GET /api/demo` with `enabled: true` (a 404 or any error means no).
 * The question is asked once, when the service is first used.
 *
 * The HTTP client is loaded with a dynamic import, so the mock build (which provides no HttpClient)
 * does not carry it in its main bundle. Writes go through the app's HttpClient and therefore through
 * `markApiWrites`, like every other write. Errors arrive as `ApiError` (`toApiError`), so a 409
 * `demo_wrong_stage` carries the API's own sentence.
 */
@Injectable({ providedIn: 'root' })
export class DemoServerApi {
  private readonly injector = inject(Injector);
  private readonly wanted = inject(DEMO_FLAG) && inject(Api).demo === null;
  private readonly info = signal<DemoInfo | null>(null);
  private http: Promise<{ client: HttpClient; toApiError: (e: unknown) => unknown } | null> | null = null;

  /** Demo controls may be shown (see the class comment). */
  readonly available = computed(() => this.info()?.enabled === true);
  /** The stand-in 3-D Secure code to show on D-3b; null when not available. */
  readonly threeDsCode = computed(() => (this.available() ? (this.info()?.threeDsCode ?? null) : null));
  /** Resolves once the API has been asked (at once when there is nothing to ask). */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.wanted ? this.detect() : Promise.resolve();
  }

  private async detect() {
    try {
      const info = await this.call<DemoInfo>('GET', '/api/demo');
      this.info.set(info && info.enabled === true ? { enabled: true, threeDsCode: info.threeDsCode ?? null } : null);
    } catch {
      // 404: the API runs without Demo:Enabled. Anything else: no demo either.
      this.info.set(null);
    }
  }

  /** D-1b (`evaluating`, any outcome) and D-1g (`evaluationQuestions`, `done` only). */
  evaluation(outcome: DemoEvaluationOutcome): Promise<void> {
    return this.call('POST', '/api/demo/evaluation', { outcome });
  }

  /** D-1f (`titleChecking`). */
  title(result: 'reserved' | 'rejected'): Promise<void> {
    return this.call('POST', '/api/demo/title', { result });
  }

  /** D-2c (`manual`). */
  review(decision: 'approve' | 'reject'): Promise<void> {
    return this.call('POST', '/api/demo/review', { decision });
  }

  /** D-5a (`setup`): completes the next open institution task. 409 `demo_nothing_open` before the Worker opened one. */
  setupNext(): Promise<DemoSetupStep> {
    return this.call('POST', '/api/demo/setup/next');
  }

  /** The newest development e-mail to the address (code or link). Needs no sign-in. */
  codes(email: string): Promise<DemoCodes> {
    return this.call('GET', `/api/demo/codes?email=${encodeURIComponent(email.trim())}`);
  }

  private async call<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
    const http = await this.client();
    if (!http) throw new Error('Demo modu kullanılamıyor.');
    try {
      return await firstValueFrom(http.client.request<T>(method, url, { body }));
    } catch (error) {
      throw http.toApiError(error);
    }
  }

  private client() {
    if (!this.wanted) return Promise.resolve(null);
    this.http ??= Promise.all([import('@angular/common/http'), import('./http-api')]).then(([common, httpApi]) => {
      const client = this.injector.get(common.HttpClient, null);
      return client ? { client, toApiError: httpApi.toApiError } : null;
    });
    return this.http;
  }
}
