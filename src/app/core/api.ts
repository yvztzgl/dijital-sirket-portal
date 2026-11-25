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
  // Who is signed in is the server's business (a session cookie in HTTP mode, the mock's own memory
  // in mock mode). The e-mail arguments below are data the founder typed, not identity.

  /** Sends a code to the address. Answers the same whether or not the address already has an account. */
  abstract register(input: { firstName: string; lastName: string; email: string; password: string }): Promise<void>;
  /** e-Devlet sign-in for T.C. citizens; the first visit creates the account. */
  abstract edevlet(tckn: string): Promise<Session>;
  /**
   * Refused with `invalid_credentials`; refused with `email_not_verified` when the address is not
   * confirmed yet (a new code has then been sent).
   */
  abstract login(email: string, password: string): Promise<Session>;
  abstract resendEmailCode(email: string): Promise<void>;
  /** Confirms the address and signs in. */
  abstract verifyEmail(email: string, code: string): Promise<Session>;
  abstract logout(): Promise<void>;
  /** The session the browser already has (after a reload), or null when nobody is signed in. */
  abstract restore(): Promise<Session | null>;
  /** E-mails a link to the set-new-password screen. Answers the same for unknown addresses. */
  abstract requestPasswordReset(email: string): Promise<void>;
  /** The set-new-password screen: the token from the e-mailed link and the new password. Does not sign in. */
  abstract confirmPasswordReset(token: string, password: string): Promise<void>;

  // Everything below acts on the signed-in founder's application. Without a session they reject
  // with an ApiError whose code is `unauthenticated`.

  // step 1 · profile and deck
  /** D-1e: saved while no deck is uploaded (stage `profile` or `verified`); each save replaces the last. */
  abstract submitProfile(input: Omit<Profile, 'at'>): Promise<Application>;
  /** D-1a: refused without a profile or without both consents. The HTTP client sends the file itself. */
  abstract uploadDeck(file: File, consents: DeckConsents): Promise<Application>;
  abstract completeScan(): Promise<Application>;
  abstract updateReview(patch: ReviewPatch, edited: string[]): Promise<Application>;
  abstract submitReview(): Promise<Application>;
  abstract chooseTitle(title: string): Promise<Application>;
  /** D-1c: which value to keep where the profile and the deck differ. */
  abstract resolveCrossCheck(key: CrossKey, choice: 'stated' | 'read'): Promise<Application>;

  // step 2 · eligibility
  abstract startEligibility(consent: boolean): Promise<Application>;
  abstract completeIdentity(): Promise<Application>;
  abstract submitDeclaration(input: { file: { name: string; size: number } | null; declared: boolean }): Promise<Application>;
  abstract completeScreening(): Promise<Application>;
  abstract createPhoneLink(): Promise<Application>;
  abstract backToReview(): Promise<Application>;
  abstract proceedToPayment(): Promise<Application>;

  // step 2 · identity check on the phone; works from the link's token alone, without a session
  abstract phoneLinkStatus(token: string): Promise<PhoneLinkStatus>;
  abstract startEligibilityByPhone(token: string, consent: boolean): Promise<PhoneLinkStatus>;
  abstract completeIdentityByPhone(token: string): Promise<PhoneLinkStatus>;

  // step 3 · payment
  abstract pay(card: { holder: string; number: string; expiry: string; cvv: string }): Promise<Application>;
  abstract resendOtp(): Promise<Application>;
  abstract cancel3ds(): Promise<Application>;
  abstract confirm3ds(code: string): Promise<Application>;

  // step 4 · e-signature
  abstract acceptCallTerms(consent: boolean): Promise<Application>;
  abstract startCall(): Promise<Application>;
  abstract endCall(): Promise<Application>;
  abstract completeCall(): Promise<Application>;
  abstract signResident(method: 'existing' | 'edevlet'): Promise<Application>;

  // step 5 · formation
  abstract startSetup(confirmed: boolean): Promise<Application>;
  abstract completeSetup(): Promise<Application>;

  // Terminal AI
  abstract ask(question: string): Promise<string>;
}

/** The signed-in founder and their application (null only in the mock, for an account seeded before verification). */
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
 */
export interface DemoTools {
  /** The demo founder's sign-in, shown in the demo panel. */
  readonly account: { email: string; password: string };
  /**
   * Creates (or resets) the demo founder, fast-forwards their application to `stage` and signs in
   * as them (except at `registered`, where the e-mail is not confirmed yet).
   */
  seed(stage: Stage, founderType?: FounderType): Promise<Session>;
  /** Deletes all mock data and signs out. */
  reset(): void;
  /** Simulation speed from the demo panel: 1 is real time. */
  speed(): number;
  /** Calls back when another tab changed the mock's data or who is signed in. */
  onExternalChange(callback: () => void): void;
  /**
   * The last e-mail typed on a sign-in screen, kept in this browser to prefill the next one.
   * A demo convenience only: HTTP mode keeps no e-mail in the browser.
   */
  rememberedEmail(): string;
  rememberEmail(email: string): void;
}
