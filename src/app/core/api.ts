import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Account, Application, CrossKey, DeckConsents, FounderType, FundingSource, PhoneLinkStatus, Profile, Stage } from './models';

/**
 * What the portal needs from the platform backend. The store and Terminal AI inject `Api` and
 * never name an implementation. Two exist:
 * - `MockApi` (mock-api.ts): the in-browser stand-in, data in localStorage. Default build.
 * - `HttpApi` (http-api.ts): the real API over HTTP. `ng build --configuration http`.
 *
 * Which one `inject(Api)` returns is decided by the build: `src/environments/environment.ts` names
 * the class, and the `http` configuration in angular.json swaps that file for
 * `environment.http.ts`. Each build therefore contains only its own implementation.
 *
 * Every method is async. On a refusal it rejects with `ApiError` (api-error.ts), whose message is
 * shown to the founder as is. See docs/api-client.md.
 */
@Injectable({ providedIn: 'root', useFactory: () => inject(environment.api) })
export abstract class Api {
  /**
   * Demo-only tools (seeded founders, reset, simulation speed). Set by the mock, null in HTTP mode;
   * the demo panel, the screen navigator and `/screens` are shown only when it is set.
   */
  abstract readonly demo: DemoTools | null;

  // auth
  abstract register(input: { firstName: string; lastName: string; email: string; password: string }): Promise<Account>;
  abstract edevlet(tckn: string): Promise<Session & { created: boolean }>;
  abstract login(email: string, password: string): Promise<Session>;
  abstract resendEmailCode(email: string): Promise<void>;
  abstract verifyEmail(email: string, code: string): Promise<Session>;
  abstract requestPasswordReset(email: string): Promise<void>;

  // step 1 · profile and deck
  /** D-1e: saved while no deck is uploaded (stage `profile` or `verified`); each save replaces the last. */
  abstract submitProfile(email: string, input: Omit<Profile, 'at'>): Promise<Application>;
  /** D-1a: refused without a profile or without both consents. The HTTP client sends the file itself. */
  abstract uploadDeck(email: string, file: File, consents: DeckConsents): Promise<Application>;
  abstract completeScan(email: string): Promise<Application>;
  abstract updateReview(email: string, patch: ReviewPatch, edited: string[]): Promise<Application>;
  abstract submitReview(email: string): Promise<Application>;
  abstract chooseTitle(email: string, title: string): Promise<Application>;
  /** D-1c: which value to keep where the profile and the deck differ. */
  abstract resolveCrossCheck(email: string, key: CrossKey, choice: 'stated' | 'read'): Promise<Application>;

  // step 2 · eligibility
  abstract startEligibility(email: string, consent: boolean): Promise<Application>;
  abstract completeIdentity(email: string): Promise<Application>;
  abstract submitDeclaration(email: string, input: { file: { name: string; size: number } | null; declared: boolean }): Promise<Application>;
  abstract completeScreening(email: string): Promise<Application>;
  abstract createPhoneLink(email: string): Promise<Application>;
  abstract backToReview(email: string): Promise<Application>;
  abstract proceedToPayment(email: string): Promise<Application>;

  // step 2 · identity check on the phone; works from the link's token alone, without a session
  abstract phoneLinkStatus(token: string): Promise<PhoneLinkStatus>;
  abstract startEligibilityByPhone(token: string, consent: boolean): Promise<PhoneLinkStatus>;
  abstract completeIdentityByPhone(token: string): Promise<PhoneLinkStatus>;

  // step 3 · payment
  abstract pay(email: string, card: { holder: string; number: string; expiry: string; cvv: string }): Promise<Application>;
  abstract resendOtp(email: string): Promise<Application>;
  abstract cancel3ds(email: string): Promise<Application>;
  abstract confirm3ds(email: string, code: string): Promise<Application>;

  // step 4 · e-signature
  abstract acceptCallTerms(email: string, consent: boolean): Promise<Application>;
  abstract startCall(email: string): Promise<Application>;
  abstract endCall(email: string): Promise<Application>;
  abstract completeCall(email: string): Promise<Application>;
  abstract signResident(email: string, method: 'existing' | 'edevlet'): Promise<Application>;

  // step 5 · formation
  abstract startSetup(email: string, confirmed: boolean): Promise<Application>;
  abstract completeSetup(email: string): Promise<Application>;

  // Terminal AI
  abstract ask(question: string): Promise<string>;
}

/** The signed-in founder and their application (null before the e-mail is verified). */
export interface Session {
  account: Account;
  app: Application | null;
}

/** The fields the review screen (D-1c) can change. */
export interface ReviewPatch {
  company?: Partial<Application['company']>;
  contact?: Partial<Application['contact']>;
  founder?: Partial<Application['founder']>;
  funding?: FundingSource;
}

/**
 * Tools that exist only for demos on the mock. HTTP mode has none of them: its `Api.demo` is null.
 * The last two are how the mock keeps a founder signed in across reloads and tabs; with the real
 * API the session comes from the server instead.
 */
export interface DemoTools {
  /** The demo founder's sign-in, shown in the demo panel. */
  readonly account: { email: string; password: string };
  /** Creates (or resets) the demo founder and fast-forwards their application to `stage`. */
  seed(stage: Stage, founderType?: FounderType): Promise<Session>;
  /** Deletes all mock data. */
  reset(): void;
  /** Simulation speed from the demo panel: 1 is real time. */
  speed(): number;
  /** Reads a founder's account and application from the mock's storage. Throws if it is unreadable. */
  readSession(email: string): { account: Account | null; app: Application | null };
  /** Calls back when another tab changed the mock's storage. */
  onExternalChange(callback: () => void): void;
}
