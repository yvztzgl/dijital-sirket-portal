/** Domain model for a single-shareholder anonim şirket application. */

export type FounderType = 'foreign' | 'resident';

/**
 * Where an application is in the wizard. Long-running stages (`evaluating`, `eligibility` once the
 * founder has started it, `screening`, `calling`, `setup`) are time-based in the mock: progress is
 * derived from their start timestamp, so they survive reloads.
 */
export type Stage =
  | 'registered' // account created, e-mail not verified
  | 'profile' // step 1, first screen: the founder states the basics before the deck is read (D-1e)
  | 'verified' // profile saved, ready to upload the deck, the CV and the answers (the profile can still be changed); also after an evaluation that ended failed, rejected or cancelled
  | 'evaluating' // the outside evaluation service (STB) evaluates the deck, the CV and the answers; takes minutes
  | 'evaluationQuestions' // the evaluation needs more information; the platform contacts the founder (no form yet)
  | 'review' // the founder fills the company form, with defaults from the profile and the account
  | 'titleChecking' // the trade name is being checked for reservation; done by staff, so it can take hours
  | 'titleConflict' // MERSİS could not reserve the title
  | 'eligibility' // step 2, first screen: identity check (pre-information, then passport and face on camera)
  | 'declaration' // step 2, second screen: the founder uploads an address document and confirms the declaration
  | 'screening' // step 2, third screen: sanctions and PEP lists are searched
  | 'eligible'
  | 'manual' // compliance will review manually (not a rejection)
  | 'payment'
  | 'threeDs'
  | 'signing' // before / during the ESHS call (or T.C. e-signature choice)
  | 'calling'
  | 'signed'
  | 'setup' // agencies being processed
  | 'done'
  // HTTP mode only: staff rejected the application under manual review and the API closed it (its
  // read answers 404). Not a wizard stage: not in STAGE_ORDER, never seeded, never sent by the API.
  | 'closed';

export const STAGE_ORDER: Stage[] = [
  'registered', 'profile', 'verified', 'evaluating', 'evaluationQuestions', 'review', 'titleChecking', 'titleConflict', 'eligibility', 'declaration', 'screening', 'eligible', 'manual',
  'payment', 'threeDs', 'signing', 'calling', 'signed', 'setup', 'done',
];

/** Wizard step (1–5) a stage belongs to. */
export function stepOf(stage: Stage): number {
  switch (stage) {
    case 'registered':
    case 'profile':
    case 'verified':
    case 'evaluating':
    case 'evaluationQuestions':
    case 'review':
    case 'titleChecking':
    case 'titleConflict':
      return 1;
    case 'eligibility':
    case 'declaration':
    case 'screening':
    case 'eligible':
    case 'manual':
    case 'closed':
      return 2;
    case 'payment':
    case 'threeDs':
      return 3;
    case 'signing':
    case 'calling':
    case 'signed':
      return 4;
    default:
      return 5;
  }
}

export type FundingSource = 'own-abroad' | 'own-turkey' | 'investor' | 'third-party';

export const FUNDING_LABELS: Record<FundingSource, string> = {
  'own-abroad': 'Yurt dışı banka transferi',
  'own-turkey': 'Türkiye’deki kendi hesabımdan',
  investor: 'Yatırımcı sermayesi (sözleşmeli)',
  'third-party': 'Üçüncü taraf transferi',
};

/** Activity area the founder states on D-1e, with the NACE codes it stands for (the API's table; offered as suggestions on the company form). */
export type Sector = 'software' | 'ecommerce' | 'consulting' | 'design' | 'education' | 'other';

export const SECTORS: Record<Sector, { label: string; nace: string[] }> = {
  software: { label: 'Yazılım ve bilişim', nace: ['62.01', '62.02', '63.11'] },
  ecommerce: { label: 'E-ticaret', nace: ['47.91'] },
  consulting: { label: 'Danışmanlık', nace: ['70.22'] },
  design: { label: 'Tasarım ve reklam', nace: ['74.10', '73.11'] },
  education: { label: 'Eğitim', nace: ['85.59'] },
  other: { label: 'Diğer', nace: [] },
};

/** What the founder states before uploading the deck (D-1e). Same shape as the API's `profile`. */
export interface Profile {
  brand: string;
  sector: Sector;
  funding: FundingSource;
  nationality: string;
  phone: string;
  country: string;
  at: string;
}

/**
 * The two acts the deck upload needs (D-1a); both must be the founder's own ticks. The field names
 * are the API's; `aiConsent` now stands for consent to sending the deck, the CV and the answers to
 * the outside evaluation service (the wording on screen is a placeholder, see deck-consents.ts).
 */
export interface DeckConsents {
  noticeAcknowledged: boolean;
  aiConsent: boolean;
}

/**
 * The five answers sent with the deck and the CV (D-1a), by the ids of `EvaluationReference`.
 * The API takes them as the multipart fields of the same names.
 */
export interface EvaluationAnswers {
  summary: string;
  activityGroupId: number | null;
  activityId: number | null;
  businessModelIds: number[];
  revenueModelIds: number[];
  productTypeIds: number[];
}

/** One choice of the evaluation's dictionaries. */
export interface EvaluationOption {
  id: number;
  label: string;
}

/**
 * One activity of the evaluation's dictionary, with the group it belongs to. `groupId` is our own
 * derived mapping (2026-11-26), not from STB and still to be confirmed; an API built before it sends
 * no `groupId`, and D-1a then offers the activities as one flat list, unlinked to the group.
 */
export interface EvaluationActivity extends EvaluationOption {
  groupId?: number;
}

/**
 * What D-1a may offer and the limits it checks (`GET /api/reference/evaluation`): the outside
 * evaluation service's dictionaries and the upload limits. The activities carry their group
 * (`groupId`) when the API sends it.
 */
export interface EvaluationReference {
  activityGroups: EvaluationOption[];
  activities: EvaluationActivity[];
  businessModels: EvaluationOption[];
  revenueModels: EvaluationOption[];
  productTypes: EvaluationOption[];
  limits: { deckMaxMb: number; cvMaxMb: number; deckMinPages: number; deckMaxPages: number; summaryMin: number; summaryMax: number };
}

/**
 * Where the outside evaluation stands (the API's `evaluation`). Only the status and times reach the
 * founder: no findings and no question content. `attempt` counts the service's tries of this
 * evaluation; kept for support, never shown to the founder (owner, 2026-11-26). `reason` says why a
 * `rejected` evaluation was rejected when the API knows it; D-1a words its notice by it.
 */
export interface Evaluation {
  status: 'queued' | 'running' | 'questions' | 'done' | 'failed' | 'rejected' | 'cancelled';
  attempt: number;
  maxAttempts: number;
  startedAt: string;
  finishedAt: string | null;
  reason: EvaluationReason | null;
}

/** `formDeckConflict`: the answers on the form do not describe the deck (the service's form check). */
export type EvaluationReason = 'formDeckConflict';

/**
 * Per value on the company form: `profile` (a default taken from the profile or the account, not
 * touched since) or `edited` (the founder typed it; the API's `edited` and `entered`). No mark: empty.
 */
export type FieldMark = 'profile' | 'edited';

/**
 * The signed-in founder as the portal sees them; the same fields as the API's `GET /api/me`.
 * No password and no T.C. kimlik no: the mock keeps those in its own type (`MockAccount` in
 * mock-api.ts), and the real API never sends them.
 */
export interface Account {
  email: string;
  firstName: string;
  lastName: string;
  founderType: FounderType;
  verified: boolean;
}

export interface LogEntry {
  at: string; // ISO
  text: string;
  who: 's' | 'u' | 'a' | 'k'; // Sistem, Siz, Terminal AI, Kurum
}

export interface DocItem {
  group: string;
  name: string;
  sizeKb: number;
  at: string;
}

/**
 * One step of the formation as the server reports it (HTTP mode). The nine steps are the same as the
 * portal's `AGENCIES` (timeline.ts), by number and title; their tasks are the server's own, fewer
 * than the mock's sub-steps. Statuses the portal does not know are kept as `other`.
 */
export interface SetupStep {
  no: number;
  code: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'other';
  tasks: SetupTask[];
}

/** `waiting`: the task has been handed to the institution (the API's `waiting_external`); staff do it there. */
export interface SetupTask {
  code: string;
  title: string;
  status: 'pending' | 'in_progress' | 'waiting' | 'done' | 'exempt' | 'other';
}

export interface Application {
  id: string;
  createdAt: string;
  stage: Stage;
  founderType: FounderType;
  founder: { firstName: string; lastName: string; nationality: string; passportNo: string; tckn?: string };
  contact: { email: string; phone: string; address: string; postalCode: string; country: string };
  company: {
    /** The brand the founder stated on the profile (D-1e), "Acme Cloud". */
    brand: string;
    /** A logo image URL the founder chose on D-1c (mock only; the API keeps no logo). */
    logo?: string;
    root: string; // title root ("Acme")
    activity: string; // title activity part ("Bulut Bilişim")
    nace: string[];
    /** Codes offered on D-1c: those of the activity area stated on the profile. */
    suggestedNace: string[];
    capital: number;
  };
  funding: FundingSource;
  marks: Record<string, FieldMark>;
  /** Stated by the founder on D-1e before the deck is uploaded; each save replaces the last. */
  profile?: Profile;
  /** The deck as uploaded (name and size only). */
  deck?: { fileName: string; sizeKb: number };
  /** The CV uploaded with the deck (name and size only). */
  cv?: { fileName: string; sizeKb: number };
  /** The outside evaluation of the last upload; absent before the first. */
  evaluation?: Evaluation;
  /**
   * The trade-name check after the review. `candidate`: the title asked for, without the type suffix.
   * `checking` (stage `titleChecking`): waiting for the answer; `requestedAt` is when it was asked
   * (the mock's simulated check runs from it; the API does not send it). `conflict`: refused, with
   * the registered title it clashed with (mock) or the staff member's `reason` (API).
   */
  titleCheck?: {
    status: 'checking' | 'ok' | 'conflict';
    candidate: string;
    requestedAt?: string;
    conflictWith?: string;
    reason?: string;
    alternatives?: string[];
  };
  /**
   * Step 2. The mock fills it when the founder starts the check and decides the result at once
   * (`score`, `result`); the API reports it as the server sees it (api-mapper `toEligibility`), so in
   * HTTP mode `score` is never set and `result` only once the list search has finished.
   * `consentAt`: when the founder ticked the consent on D-2a (absent on mock applications saved
   * before 2026-11-17). `via: 'phone'`: the check was started from the phone page.
   */
  eligibility?: {
    /**
     * When the camera check now open was started; the camera animation runs from it. Absent in HTTP
     * mode while no check is open (before the first start, after a failed one).
     */
    startedAt?: string;
    consentAt?: string;
    via?: 'phone';
    /** The mock's liveness score. The API sends none. */
    score?: number;
    /** `eligible` or `manual`: decided at the start in the mock, after the list search by the API. */
    result?: 'eligible' | 'manual';
    /** HTTP mode: a check is open on the server (camera not finished yet, or the Worker deciding). */
    running?: boolean;
    /** HTTP mode: the last check ended without a verified identity; the founder may start again. */
    identityError?: 'identity_failed';
    /** The camera check ended (stage moved to `declaration`). */
    identityDoneAt?: string;
    /** The address document the founder uploaded on the declaration screen. The mock keeps its name and size only. */
    address?: { fileName: string; sizeKb: number; at: string };
    /** The founder confirmed that the information in the application is true. */
    declaredAt?: string;
    /** The list search began (stage `screening`). */
    screeningStartedAt?: string;
    finishedAt?: string;
    manualAccepted?: boolean;
  };
  /**
   * D-2a "Telefonla devam et": the link behind the QR code. It opens the identity step only, on
   * another device, without a session. One link at a time; a new one replaces the old.
   */
  phoneLink?: { token: string; createdAt: string; expiresAt: string; usedAt?: string };
  payment?: { holder: string; last4: string; amount: number; otp?: string; otpSentAt?: string; paidAt?: string };
  /**
   * The fee lines the server charges, in TL (set from the API's `payment.fees`; the mock leaves it
   * out and the payment screen uses `FEES`).
   */
  fees?: { code: string; label: string; amount: number }[];
  /** D-4a pre-information: when the founder accepted that the call is recorded and an e-signature is issued in their name. */
  callConsentAt?: string;
  /**
   * The video call (stage `calling`, foreign founders). `startedAt`: the call's start; the portal's
   * scripted call runs from it. `completed` (HTTP mode only): this page has told the server the call
   * ended (or the server said no call is open any more) and the e-signature provider is issuing the
   * certificate; the API reports `calling` for both, so only the portal can tell them apart.
   */
  call?: { startedAt: string; completed?: boolean };
  /**
   * The e-signature. `method`: `eshs` for the daily certificate of the video call, `existing` /
   * `edevlet` for a resident's own. `holder` is the signed-in founder's name (the API sends none).
   * The API keeps reporting the newest certificate after it has expired, with the stage back at
   * `signing`; the screens then say it expired.
   */
  signature?: { method: 'eshs' | 'existing' | 'edevlet'; serial: string; holder: string; issuedAt: string; validUntil: string };
  /**
   * Step 5. `signConsentAt`: when the founder confirmed on D-4c that the formation documents are
   * signed with their e-signature. `steps`: absent in the mock (its set-up is a scripted animation
   * over the portal's own agency list, `AGENCIES`); in HTTP mode the server's steps and tasks, or
   * null while the server has not created them yet.
   */
  setup?: { startedAt: string; signConsentAt?: string; finishedAt?: string; steps?: SetupStep[] | null };
  /**
   * The company's numbers. The mock fills all of them at the end; the API reports each one as the
   * institution task that issues it is completed, so in HTTP mode any of them may be missing, and the
   * advisor's name and firm never come (the API does not send them).
   */
  results?: {
    vkn?: string;
    mersis?: string;
    iban?: string;
    taxOffice?: string;
    /** Ticaret sicili tescil no (HTTP mode). */
    registryNo?: string;
    /** e-Fatura kayıt no (HTTP mode). */
    eInvoiceNo?: string;
    /** SGK işyeri sicil no (HTTP mode). */
    sgkNo?: string;
    advisor?: string;
    advisorFirm?: string;
  };
  docs: DocItem[];
  logs: LogEntry[];
}

/**
 * The values the API accepts on the profile form and the review screen (`GET /api/reference/wizard`):
 * activity areas with their NACE codes, capital sources, and the NACE codes a review may name.
 * The mock answers with the portal's own constants in the same shape.
 */
export interface WizardReference {
  sectors: { key: string; label: string; naceCodes: string[] }[];
  funding: { key: string; label: string }[];
  naceCodes: { code: string; title: string }[];
}

/** Fee breakdown for the one-off payment (sums to the total). */
export const FEES = [
  { label: 'Ticaret sicili tescil ve ilan harçları', amount: 4_850 },
  { label: 'Noter onayı ve e-İmza (ESHS)', amount: 2_400 },
  { label: 'Sanal ofis · ilk yıl', amount: 3_600 },
  { label: 'Platform hizmet bedeli', amount: 1_900 },
];
export const FEE_TOTAL = FEES.reduce((s, f) => s + f.amount, 0); // 12.750

export const CAPITAL = 250_000;

/**
 * What the phone page of the identity step may learn from its link, and nothing else: no name,
 * no company, no application number.
 */
export type PhoneLinkStatus =
  | { state: 'invalid' } // unknown, replaced by a newer link, or the check was started on the computer
  | { state: 'expired' }
  | { state: 'ready'; expiresAt: string }
  | { state: 'running'; startedAt: string }
  | { state: 'done' };
