/**
 * The API's JSON as it arrives (camelCase), before api-mapper.ts turns it into the portal's model.
 * Written from the API's records in `dijital-sirket-api/src/DijitalSirket.Api/Models/` (2026-11-25).
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
  | 'profile' | 'verified' | 'scanning' | 'titleChecking' | 'titleConflict' | 'review' | 'eligibility' | 'declaration'
  | 'screening' | 'manual' | 'payment' | 'threeDs' | 'signing' | 'calling' | 'signed' | 'setup' | 'done';

/** The keys of `ApplicationView.review` (Wizard.FieldLabels on the API). */
export type ReviewKey =
  | 'trade_name' | 'nace_codes' | 'shareholding' | 'given_name' | 'family_name' | 'nationality' | 'email' | 'phone'
  | 'residence_address' | 'residence_country' | 'source_of_funds' | 'postal_code';

export interface ProfileWire {
  brand: string;
  sector: string;
  funding: string;
  nationality: string;
  phone: string;
  country: string;
  at: string;
}

export interface DeckFieldWire {
  key: string;
  label: string;
  value: string;
  page: number | null;
  /** What the deck reader says of its own reading; the development reader sends `high` or `medium`. */
  confidence: string;
}

export interface DeckWire {
  fileName: string | null;
  sizeKb: number;
  pages: number | null;
  uploadedAt: string;
  status: 'reading' | 'read' | 'failed';
  fields: DeckFieldWire[];
}

export interface CrossCheckWire {
  key: string;
  label: string;
  stated: string;
  read: string;
  match: boolean;
  choice: string | null;
  at: string | null;
}

export interface ReviewFieldWire {
  label: string;
  value: string;
  mark: 'ai' | 'edited' | 'entered';
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

export interface PaymentWire {
  /** In kuruş. */
  amountMinor: number;
  fees: { code: string; label: string; amountMinor: number }[];
  status: string | null;
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
  deck: DeckWire | null;
  crossCheck: CrossCheckWire[];
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
