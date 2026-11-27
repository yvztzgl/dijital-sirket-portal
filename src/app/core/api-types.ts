/**
 * The API's JSON as it arrives (camelCase), before api-mapper.ts turns it into the portal's model.
 * Written from the API's records in `dijital-sirket-api/src/DijitalSirket.Api/Models/` (2026-11-25).
 * The deck step (deck, CV, evaluation) follows the contract agreed for the outside evaluation (STB) on
 * 2026-11-25, checked against the API as built the same day; see docs/api-client.md.
 * Times are ISO 8601 strings with an offset. Values the API documents as a fixed set are typed as
 * that set; the mapper still checks them, because a newer API may send a value this file does not know.
 */

/** `GET /api/me` (MeView). `email` is null only if the server could not read it. */
export interface MeWire {
  firstName: string;
  lastName: string;
  email: string | null;
  founderType: 'resident' | 'foreign';
  verified: boolean;
}

/** `GET /api/auth/edevlet/start`. In development `redirectUrl` is `/edevlet-test?state=<state>`. */
export interface EdevletStartWire {
  redirectUrl: string;
}

export type StageWire =
  | 'profile' | 'verified' | 'evaluating' | 'evaluationQuestions' | 'titleChecking' | 'titleConflict' | 'review' | 'eligibility' | 'declaration'
  | 'screening' | 'manual' | 'payment' | 'threeDs' | 'signing' | 'calling' | 'signed' | 'setup' | 'done';

/** The keys of `ApplicationView.review` (Wizard.FieldLabels on the API). */
export type ReviewKey =
  | 'trade_name' | 'nace_codes' | 'shareholding' | 'given_name' | 'family_name' | 'nationality' | 'email' | 'phone'
  | 'residence_address' | 'residence_country' | 'source_of_funds' | 'postal_code';

export interface ProfileWire {
  brand: string;
  /** Only on a profile saved before API step 24; null afterwards. */
  sector: string | null;
  /** API step 24; absent from captures made before it. */
  naceCodes?: string[];
  funding: string;
  nationality: string;
  phone: string;
  country: string;
  at: string;
}

/** The deck or the CV as uploaded. */
export interface UploadWire {
  fileName: string | null;
  sizeKb: number;
}

/** The outside evaluation of the last upload. No findings and no question content reach the founder. */
export interface EvaluationWire {
  status: 'queued' | 'running' | 'questions' | 'done' | 'failed' | 'rejected' | 'cancelled';
  attempt: number;
  maxAttempts: number;
  startedAt: string;
  finishedAt: string | null;
  /**
   * Why a `rejected` evaluation was rejected, in the API's own words (`formDeckConflict`), or null.
   * Absent on answers of an API built before it (API step 21). Never the service's code or message.
   */
  reason?: string | null;
}

/** `GET /api/reference/evaluation`: the outside service's dictionaries and the upload limits. */
export interface EvaluationReferenceWire {
  activityGroups: { id: number; label: string }[];
  /** `groupId`: the activity's group (derived mapping, not from STB, to be confirmed); missing from an API built before 2026-11-26. */
  activities: { id: number; label: string; groupId?: number }[];
  businessModels: { id: number; label: string }[];
  revenueModels: { id: number; label: string }[];
  productTypes: { id: number; label: string }[];
  limits: { deckMaxMb: number; cvMaxMb: number; deckMinPages: number; deckMaxPages: number; summaryMin: number; summaryMax: number };
}

export interface ReviewFieldWire {
  label: string;
  value: string;
  /** `profile`: a default from the profile or the account, untouched; `edited` / `entered`: the founder's. */
  mark: 'profile' | 'edited' | 'entered';
}

export interface TitleCheckWire {
  status: 'checking' | 'conflict' | 'ok';
  candidate: string;
  reason: string | null;
}

export interface EligibilityWire {
  consentAt: string | null;
  running: boolean;
  identityDone: boolean;
  identityError: string | null;
  declaredAt: string | null;
  screeningRunning: boolean;
  result: 'eligible' | 'manual' | null;
}

/** `POST /api/application/phone-link` (200). The token is sent only here, once. */
export interface PhoneLinkWire {
  token: string;
  expiresInSeconds: number;
}

/**
 * `GET /api/phone/status` (PhoneStatus): what the phone page may learn, a state and times only.
 * `invalid` also for an unknown, revoked or replaced token; never an error.
 */
export interface PhoneStatusWire {
  state: 'invalid' | 'ready' | 'expired' | 'running' | 'done';
  expiresAt: string | null;
  startedAt: string | null;
}

export interface PaymentWire {
  /** In kuruş. */
  amountMinor: number;
  fees: { code: string; label: string; amountMinor: number }[];
  /** The latest payment: `3ds_pending`, `captured`, or `failed` (3-D Secure cancelled); null before any. */
  status: '3ds_pending' | 'captured' | 'failed' | 'initiated' | null;
  /** Always null today: the API never receives the card number. */
  last4: string | null;
  paidAt: string | null;
}

export interface SignatureWire {
  kind: string;
  serial: string;
  issuedAt: string;
  validUntil: string;
}

export interface SetupWire {
  steps: { no: number; code: string; title: string; status: string; tasks: { code: string; title: string; status: string }[] }[];
}

export interface LogWire {
  at: string;
  text: string;
  /** s: system, u: the founder, a: the assistant, k: an institution. */
  who: string;
}

/** `GET /api/application` (ApplicationView). */
export interface ApplicationWire {
  id: string;
  referenceNo: string;
  stage: StageWire;
  status: string;
  founderType: 'resident' | 'foreign';
  createdAt: string;
  profile: ProfileWire | null;
  deck: UploadWire | null;
  cv: UploadWire | null;
  /** Null before the first upload. */
  evaluation: EvaluationWire | null;
  review: Partial<Record<ReviewKey, ReviewFieldWire>>;
  titleCheck: TitleCheckWire | null;
  eligibility: EligibilityWire | null;
  payment: PaymentWire;
  signature: SignatureWire | null;
  callConsentAt: string | null;
  setup: SetupWire | null;
  results: Record<string, string> | null;
  documents: { id: string; type: string; sizeKb: number; at: string }[];
  logs: LogWire[];
}
