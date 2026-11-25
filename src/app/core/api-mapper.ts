import { ApplicationWire, MeWire, ReviewFieldWire, ReviewKey, StageWire } from './api-types';
import { Account, Application, CAPITAL, CrossCheck, CrossKey, FieldMark, FundingSource, FUNDING_LABELS, LogEntry, Profile, Sector, SECTORS, Stage } from './models';

/**
 * Turns the API's JSON (api-types.ts) into the portal's model (models.ts). Pure functions, no
 * Angular: api-mapper.spec.ts feeds them literal JSON.
 *
 * Where the portal's model needs something the API does not send, the mapper puts a neutral empty
 * value ('' / [] / undefined) and never makes data up. The list of those gaps is in
 * docs/api-client.md ("What the mapper cannot fill yet").
 */

/** `GET /api/me` → the signed-in founder. */
export function toAccount(me: MeWire): Account {
  return {
    email: me.email ?? '',
    firstName: me.firstName,
    lastName: me.lastName,
    founderType: me.founderType === 'resident' ? 'resident' : 'foreign',
    verified: me.verified,
  };
}

/**
 * The API's stage → the portal's. Two differ:
 * - `titleChecking` (the trade name is being asked of MERSİS) has no screen in the portal yet;
 *   it is shown as `review` until a later piece adds one.
 * - the portal's `eligible` does not exist on the API (it moves straight to `payment`).
 * An unknown stage is an error: guessing one would put the founder on the wrong screen.
 */
export function toStage(stage: StageWire): Stage {
  if (stage === 'titleChecking') return 'review';
  if (SAME_STAGES.includes(stage)) return stage as Stage;
  throw new Error(`Unknown application stage from the API: ${stage}`);
}

const SAME_STAGES: string[] = [
  'profile', 'verified', 'scanning', 'review', 'titleConflict', 'eligibility', 'declaration', 'screening', 'manual',
  'payment', 'threeDs', 'signing', 'calling', 'signed', 'setup', 'done',
];

/**
 * `GET /api/application` → the portal's application. `account` supplies the founder's name and
 * e-mail until the review has its own values (the mock does the same for a new application).
 */
export function toApplication(view: ApplicationWire, account: Account): Application {
  const review = (key: ReviewKey) => view.review[key]?.value.trim() ?? '';
  const tradeName = review('trade_name');
  const [root = '', ...activity] = tradeName.replace(/\s+(A\.Ş\.|Anonim Şirketi)$/i, '').split(/\s+/).filter(Boolean);
  const profile = view.profile ? toProfile(view.profile) : undefined;
  const funding = asFunding(review('source_of_funds')) ?? profile?.funding ?? 'own-abroad';
  const readName = view.deck?.fields.find((f) => f.key === 'trade_name')?.value ?? '';

  return {
    // The reference number is what the founder sees and quotes ("DS-…"); the API's uuid is not needed by any screen.
    id: view.referenceNo,
    createdAt: view.createdAt,
    stage: toStage(view.stage),
    founderType: view.founderType === 'resident' ? 'resident' : 'foreign',
    founder: {
      firstName: review('given_name') || account.firstName,
      lastName: review('family_name') || account.lastName,
      nationality: review('nationality'),
      passportNo: '',
    },
    contact: {
      email: review('email') || account.email,
      phone: review('phone'),
      address: review('residence_address'),
      postalCode: review('postal_code'),
      country: review('residence_country'),
    },
    company: {
      deckName: readName || tradeName,
      root,
      activity: activity.join(' '),
      nace: splitNace(review('nace_codes')),
      suggestedNace: [],
      // The legal minimum for an anonim şirket, the same constant the mock uses; the API does not send a capital yet.
      capital: CAPITAL,
    },
    funding,
    marks: toMarks(view),
    profile,
    deck: view.deck
      ? {
          fileName: view.deck.fileName ?? '',
          sizeKb: view.deck.sizeKb,
          pages: view.deck.pages ?? 0,
          startedAt: view.deck.uploadedAt,
          fields: view.deck.fields.map((f) => ({ key: f.key, label: f.label, value: f.value, page: f.page })),
        }
      : undefined,
    crossCheck: view.crossCheck.map(toCrossCheck),
    titleCheck: toTitleCheck(view),
    payment: view.payment.status
      ? { holder: '', last4: view.payment.last4 ?? '', amount: view.payment.amountMinor / 100, paidAt: view.payment.paidAt ?? undefined }
      : undefined,
    fees: view.payment.fees.map((f) => ({ code: f.code, label: f.label, amount: f.amountMinor / 100 })),
    callConsentAt: view.callConsentAt ?? undefined,
    signature: view.signature
      ? {
          method: view.signature.kind === 'existing' || view.signature.kind === 'edevlet' ? view.signature.kind : 'eshs',
          serial: view.signature.serial,
          holder: `${review('given_name') || account.firstName} ${review('family_name') || account.lastName}`,
          issuedAt: view.signature.issuedAt,
          validUntil: view.signature.validUntil,
        }
      : undefined,
    docs: view.documents.map((d) => ({ group: '', name: d.type, sizeKb: d.sizeKb, at: d.at })),
    logs: view.logs.map(toLog),
  };
}

function toProfile(p: NonNullable<ApplicationWire['profile']>): Profile {
  return {
    brand: p.brand,
    sector: p.sector in SECTORS ? (p.sector as Sector) : 'other',
    funding: asFunding(p.funding) ?? 'own-abroad',
    nationality: p.nationality,
    phone: p.phone,
    country: p.country,
    at: p.at,
  };
}

function asFunding(value: string): FundingSource | undefined {
  return value in FUNDING_LABELS ? (value as FundingSource) : undefined;
}

/** "62.01, 63.11" → ['62.01', '63.11']; the same separators the API's Claims.SplitNace accepts. */
export function splitNace(value: string): string[] {
  return [...new Set(value.split(/[,·;\s]+/).map((c) => c.trim()).filter(Boolean))];
}

/**
 * The review's marks, under the portal's field names. The API says `ai` (as read), `edited` (read,
 * then changed) or `entered` (typed with nothing read); the portal shows both of the latter as
 * edited. A field read with less than `high` confidence is marked for checking, as the mock marks
 * uncertain readings.
 */
function toMarks(view: ApplicationWire): Record<string, FieldMark> {
  const confidence = new Map(view.deck?.fields.map((f) => [f.key, f.confidence]) ?? []);
  const marks: Record<string, FieldMark> = {};
  for (const [key, field] of Object.entries(view.review) as [ReviewKey, ReviewFieldWire][]) {
    const name = MARK_NAMES[key];
    if (!name) continue;
    const mark: FieldMark = field.mark !== 'ai' ? 'edited' : confidence.get(key) && confidence.get(key) !== 'high' ? 'check' : 'ai';
    // Several API fields share one portal row (given name, family name and nationality are "name"): an edit wins.
    if (marks[name] !== 'edited') marks[name] = mark;
  }
  return marks;
}

/** The portal's review rows (the mock's `marks` keys) for each API field. */
const MARK_NAMES: Partial<Record<ReviewKey, string>> = {
  trade_name: 'title',
  nace_codes: 'nace',
  given_name: 'name',
  family_name: 'name',
  nationality: 'name',
  email: 'email',
  phone: 'phone',
  residence_address: 'address',
  residence_country: 'address',
  postal_code: 'address',
  source_of_funds: 'funding',
};

const CROSS_KEYS: CrossKey[] = ['brand', 'sector', 'funding', 'nationality', 'phone', 'country'];

function toCrossCheck(c: ApplicationWire['crossCheck'][number]): CrossCheck {
  if (!CROSS_KEYS.includes(c.key as CrossKey)) throw new Error(`Unknown cross-check key from the API: ${c.key}`);
  const choice = c.choice === 'stated' || c.choice === 'read' || c.choice === 'edited' ? c.choice : null;
  return { key: c.key as CrossKey, label: c.label, stated: c.stated, read: c.read, match: c.match, choice, at: c.at };
}

/**
 * The trade-name check. `checking` has no counterpart in the portal yet (left out). For a conflict
 * the API gives a reason, not the registered title it clashed with, and no alternatives.
 */
function toTitleCheck(view: ApplicationWire): Application['titleCheck'] {
  const t = view.titleCheck;
  if (!t || t.status === 'checking') return undefined;
  return t.status === 'ok' ? { status: 'ok', candidate: t.candidate } : { status: 'conflict', candidate: t.candidate, alternatives: [] };
}

function toLog(l: ApplicationWire['logs'][number]): LogEntry {
  const who = l.who === 'u' || l.who === 'a' || l.who === 'k' ? l.who : 's';
  return { at: l.at, text: l.text, who };
}
