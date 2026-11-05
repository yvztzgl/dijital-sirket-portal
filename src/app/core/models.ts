/** Domain model for a single-shareholder anonim şirket application. */

export type FounderType = 'foreign' | 'resident';

/**
 * Where an application is in the wizard. Long-running stages (`scanning`, `eligibility`, `calling`,
 * `setup`) are time-based: progress is derived from their start timestamp, so they survive reloads.
 */
export type Stage =
  | 'registered' // account created, e-mail not verified
  | 'verified' // ready to upload a pitch deck
  | 'scanning' // AI Reviewer reading the deck
  | 'review' // founder checks extracted fields
  | 'titleConflict' // MERSİS could not reserve the title
  | 'eligibility' // identity, declaration, sanctions screening
  | 'eligible'
  | 'manual' // compliance will review manually (not a rejection)
  | 'payment'
  | 'threeDs'
  | 'signing' // before / during the ESHS call (or T.C. e-signature choice)
  | 'calling'
  | 'signed'
  | 'setup' // agencies being processed
  | 'done';

export const STAGE_ORDER: Stage[] = [
  'registered', 'verified', 'scanning', 'review', 'titleConflict', 'eligibility', 'eligible', 'manual',
  'payment', 'threeDs', 'signing', 'calling', 'signed', 'setup', 'done',
];

/** Wizard step (1–5) a stage belongs to. */
export function stepOf(stage: Stage): number {
  switch (stage) {
    case 'registered':
    case 'verified':
    case 'scanning':
    case 'review':
    case 'titleConflict':
      return 1;
    case 'eligibility':
    case 'eligible':
    case 'manual':
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

/** Badge state per reviewable field: read by AI, needs a check, or edited by the founder. */
export type FieldMark = 'ai' | 'check' | 'edited';

export interface Account {
  email: string;
  password: string; // mock backend only — never do this with a real API
  firstName: string;
  lastName: string;
  founderType: FounderType;
  tckn?: string;
  verified: boolean;
  createdAt: string;
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
    root: string; // title root ("Acme")
    activity: string; // title activity part ("Bulut Bilişim")
    nace: string[];
    suggestedNace: string[];
    capital: number;
  };
  funding: FundingSource;
  marks: Record<string, FieldMark>;
  deck?: { fileName: string; sizeKb: number; pages: number; startedAt: string; fields: ScanField[] };
  titleCheck?: { status: 'ok' | 'conflict'; candidate: string; conflictWith?: string; alternatives?: string[] };
  eligibility?: { startedAt: string; score: number; result: 'eligible' | 'manual'; finishedAt?: string; manualAccepted?: boolean };
  payment?: { holder: string; last4: string; amount: number; otp?: string; otpSentAt?: string; paidAt?: string };
  call?: { startedAt: string };
  signature?: { method: 'eshs' | 'existing' | 'edevlet'; serial: string; holder: string; issuedAt: string; validUntil: string };
  setup?: { startedAt: string; finishedAt?: string };
  results?: { vkn: string; mersis: string; iban: string; advisor: string; advisorFirm: string; taxOffice: string };
  docs: DocItem[];
  logs: LogEntry[];
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
