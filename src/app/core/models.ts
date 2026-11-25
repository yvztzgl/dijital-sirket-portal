/** Domain model for a single-shareholder anonim şirket application. */

export type FounderType = 'foreign' | 'resident';

/**
 * Where an application is in the wizard. Long-running stages (`scanning`, `eligibility` once the
 * founder has started it, `screening`, `calling`, `setup`) are time-based: progress is derived from their start timestamp, so they survive reloads.
 */
export type Stage =
  | 'registered' // account created, e-mail not verified
  | 'profile' // step 1, first screen: the founder states the basics before the deck is read (D-1e)
  | 'verified' // profile saved, ready to upload a pitch deck (the profile can still be changed)
  | 'scanning' // AI Reviewer reading the deck
  | 'review' // founder checks extracted fields
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
  'registered', 'profile', 'verified', 'scanning', 'review', 'titleChecking', 'titleConflict', 'eligibility', 'declaration', 'screening', 'eligible', 'manual',
  'payment', 'threeDs', 'signing', 'calling', 'signed', 'setup', 'done',
];

/** Wizard step (1–5) a stage belongs to. */
export function stepOf(stage: Stage): number {
  switch (stage) {
    case 'registered':
    case 'profile':
    case 'verified':
    case 'scanning':
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

/** Activity area the founder states on D-1e, with the NACE codes it stands for (the API's table; compared with the codes read from the deck). */
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

/** The pieces of the profile that are compared with what was read from the deck. */
export type CrossKey = 'brand' | 'sector' | 'funding' | 'nationality' | 'phone' | 'country';

/**
 * One comparison between the profile and the deck, made when the scan finishes. Same shape as an
 * item of the API's `crossCheck`. `stated` and `read` are display texts (`read` is "—" when the
 * deck gave nothing). A difference needs the founder's decision before the review can be
 * submitted: `stated` (use what they wrote on D-1e), `read` (keep the deck's value) or `edited`
 * (they typed another value in the review).
 */
export interface CrossCheck {
  key: CrossKey;
  label: string;
  stated: string;
  read: string;
  match: boolean;
  choice: null | 'stated' | 'read' | 'edited';
  at: string | null;
}

/** The two acts the deck upload needs (D-1a); both must be the founder's own ticks. */
export interface DeckConsents {
  noticeAcknowledged: boolean;
  aiConsent: boolean;
}

/** Badge state per reviewable field: read by AI, needs a check, or edited by the founder. */
export type FieldMark = 'ai' | 'check' | 'edited';

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

export interface ScanField {
  key: string;
  label: string;
  value: string;
  page: number | null;
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

export interface Application {
  id: string;
  createdAt: string;
  stage: Stage;
  founderType: FounderType;
  founder: { firstName: string; lastName: string; nationality: string; passportNo: string; tckn?: string };
  contact: { email: string; phone: string; address: string; postalCode: string; country: string };
  company: {
    deckName: string; // brand as written in the deck ("Acme Cloud")
    /** The company's logo as found in the deck, as an image URL (the mock draws a stand-in; see mock-api `deckLogo`). */
    logo?: string;
    root: string; // title root ("Acme")
    activity: string; // title activity part ("Bulut Bilişim")
    nace: string[];
    suggestedNace: string[];
    capital: number;
  };
  funding: FundingSource;
  marks: Record<string, FieldMark>;
  /** Stated by the founder on D-1e before the deck is uploaded; each save replaces the last. */
  profile?: Profile;
  /**
   * `noticeAt` / `aiConsentAt`: when the founder ticked the privacy notice and the AI-processing
   * consent for this deck (absent on decks uploaded before 2026-11-25).
   */
  deck?: {
    fileName: string;
    sizeKb: number;
    pages: number;
    startedAt: string;
    fields: ScanField[];
    noticeAt?: string;
    aiConsentAt?: string;
    /**
     * Where reading the deck stands (the API's `deck.status`). `failed`: the reader gave up; the
     * application is back at `verified` and the founder uploads again. Absent on mock decks saved
     * before 2026-11-25, which were all read.
     */
    status?: 'reading' | 'read' | 'failed';
  };
  /** The profile compared with the deck, from the end of the scan; empty until both exist. */
  crossCheck: CrossCheck[];
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
  call?: { startedAt: string };
  signature?: { method: 'eshs' | 'existing' | 'edevlet'; serial: string; holder: string; issuedAt: string; validUntil: string };
  /** `signConsentAt`: when the founder confirmed on D-4c that the formation documents are signed with their e-signature. */
  setup?: { startedAt: string; signConsentAt?: string; finishedAt?: string };
  results?: { vkn: string; mersis: string; iban: string; advisor: string; advisorFirm: string; taxOffice: string };
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
