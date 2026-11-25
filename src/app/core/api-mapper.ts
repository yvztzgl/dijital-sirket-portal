import type { ReviewPatch } from './api';
import { ApplicationWire, DeckFieldWire, MeWire, ReviewFieldWire, ReviewKey, StageWire, TitleCheckWire } from './api-types';
import { Account, Application, CAPITAL, CrossCheck, CrossKey, FieldMark, FundingSource, FUNDING_LABELS, LogEntry, Profile, ScanField, Sector, SECTORS, Stage } from './models';
import { titleAlternatives, withoutSuffix } from './rules';

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
 * The API's stage → the portal's. The names are the same; the portal's `eligible` does not exist on
 * the API (it moves straight to `payment`; `toApplication` shows the result screen once, see
 * `showsResult`). An unknown stage is an error: guessing one would put the founder on the wrong screen.
 */
export function toStage(stage: StageWire): Stage {
  if (SAME_STAGES.includes(stage)) return stage as Stage;
  throw new Error(`Unknown application stage from the API: ${stage}`);
}

const SAME_STAGES: string[] = [
  'profile', 'verified', 'scanning', 'review', 'titleChecking', 'titleConflict', 'eligibility', 'declaration', 'screening', 'manual',
  'payment', 'threeDs', 'signing', 'calling', 'signed', 'setup', 'done',
];

/** What the HTTP client knows beside the view and passes to `toApplication`. */
export interface MapOptions {
  /** The founder pressed "Ödemeye geç" on the result screen in this page's life (HttpApi keeps it in memory). */
  resultSeen?: boolean;
}

/**
 * `GET /api/application` → the portal's application. `account` supplies the founder's name and
 * e-mail until the review has its own values (the mock does the same for a new application).
 */
export function toApplication(view: ApplicationWire, account: Account, options: MapOptions = {}): Application {
  const review = (key: ReviewKey) => view.review[key]?.value.trim() ?? '';
  const tradeName = review('trade_name');
  // The title being checked or already reserved is the reservation's (D-1d may have chosen another
  // one; the API keeps the review's trade name as it was). Otherwise it is the review's.
  const title = view.titleCheck && view.titleCheck.status !== 'conflict' ? withoutSuffix(view.titleCheck.candidate) : withoutSuffix(tradeName);
  // The portal shows a title as root + activity ("Acme" + "Bulut Bilişim"); the API keeps one
  // string. The first word is taken as the root; joined again, nothing is lost.
  const [root = '', ...activity] = title.split(/\s+/).filter(Boolean);
  const profile = view.profile ? toProfile(view.profile) : undefined;
  const funding = asFunding(review('source_of_funds')) ?? profile?.funding ?? 'own-abroad';
  const readName = view.deck?.fields.find((f) => f.key === 'trade_name')?.value ?? '';

  return {
    // The reference number is what the founder sees and quotes ("DS-…"); the API's uuid is not needed by any screen.
    id: view.referenceNo,
    createdAt: view.createdAt,
    stage: showsResult(view, options) ? 'eligible' : toStage(view.stage),
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
          // Not known while the deck is being read; the development reader leaves it null even after.
          pages: view.deck.pages ?? 0,
          startedAt: view.deck.uploadedAt,
          fields: view.deck.fields.map(toScanField),
          status: view.deck.status,
        }
      : undefined,
    crossCheck: view.crossCheck.map(toCrossCheck),
    titleCheck: toTitleCheck(view.titleCheck),
    eligibility: toEligibility(view),
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
    docs: view.documents.map((d) => ({ ...(DOC_NAMES[d.type] ?? { group: '', name: d.type }), sizeKb: d.sizeKb, at: d.at })),
    logs: view.logs.map(toLog),
  };
}

/**
 * The portal's result screen (D-2b, stage `eligible`) as a one-time acknowledgement. The API has no
 * such stage: a cleared list search goes straight to `payment`. The screen is shown while the API
 * is at `payment` with the result `eligible`, no payment has been started, the founder has not yet
 * pressed "Ödemeye geç" (`resultSeen`), and the application did not come through manual review
 * (after staff approve, the portal goes straight on to the payment, which the API's own timeline
 * line "Başvurunuz incelendi; ödeme adımına geçebilirsiniz" announces).
 */
function showsResult(view: ApplicationWire, options: MapOptions): boolean {
  return (
    view.stage === 'payment' &&
    view.eligibility?.result === 'eligible' &&
    !view.payment.status &&
    !options.resultSeen &&
    !view.logs.some((l) => l.text === LOG_TEXTS.reviewApproved)
  );
}

/**
 * The API's timeline lines (Wizard.ActivityTexts on the API) that step 2 reads times from. The view
 * carries no codes for them, only the Turkish text; api-mapper.spec.ts checks them against captured
 * answers, so a changed wording on the API shows up there.
 */
export const LOG_TEXTS = {
  identityStarted: 'Kimlik doğrulama başlatıldı',
  identityStartedByPhone: 'Kimlik doğrulama telefondan başlatıldı',
  screeningDone: 'Yaptırım ve PEP taraması tamamlandı',
  reviewApproved: 'Başvurunuz incelendi; ödeme adımına geçebilirsiniz',
};

/** The newest timeline line with one of these texts. */
function latestLog(view: ApplicationWire, texts: string[]) {
  return view.logs.filter((l) => texts.includes(l.text)).reduce<ApplicationWire['logs'][number] | undefined>((a, b) => (!a || b.at > a.at ? b : a), undefined);
}

/**
 * Step 2 as the API reports it. Nothing is made up: there is no score (the mock's liveness score
 * has no counterpart; D-2b leaves it out), no address file name, and `result` stays empty until the
 * list search has finished. Times the view does not carry as fields come from its timeline:
 * - `startedAt`, `via`: the newest "Kimlik doğrulama (telefondan) başlatıldı" line, only while a
 *   check is open (`running`); the camera animation runs from it, and `via: 'phone'` makes the
 *   computer follow the phone instead of finishing the check itself;
 * - `screeningStartedAt`: the declaration's time (the API queues the list search in the same request);
 * - `finishedAt`: the "Yaptırım ve PEP taraması tamamlandı" line.
 */
function toEligibility(view: ApplicationWire): Application['eligibility'] {
  const e = view.eligibility;
  if (!e) return undefined;
  const started = e.running ? latestLog(view, [LOG_TEXTS.identityStarted, LOG_TEXTS.identityStartedByPhone]) : undefined;
  const finished = latestLog(view, [LOG_TEXTS.screeningDone]);
  return {
    ...(started ? { startedAt: started.at } : {}),
    ...(started?.text === LOG_TEXTS.identityStartedByPhone ? { via: 'phone' as const } : {}),
    ...(e.consentAt ? { consentAt: e.consentAt } : {}),
    running: e.running,
    ...(e.identityError === 'identity_failed' ? { identityError: 'identity_failed' as const } : {}),
    ...(e.declaredAt ? { declaredAt: e.declaredAt, screeningStartedAt: e.declaredAt } : {}),
    ...(e.result ? { result: e.result } : {}),
    ...(e.result && finished ? { finishedAt: finished.at } : {}),
  };
}

/** The document types the API names in `documents`, as the portal's documents list groups and names them. */
const DOC_NAMES: Record<string, { group: string; name: string }> = {
  deck: { group: '1 · Başvuru & Uygunluk', name: 'Sunum' },
  address_proof: { group: '1 · Başvuru & Uygunluk', name: 'Adres belgesi' },
};

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

/** A funding key read from the deck ("own-abroad") as the founder reads it; any other text as it is. */
const fundingText = (value: string) => FUNDING_LABELS[asFunding(value) as FundingSource] ?? value;

/**
 * A field the deck reader found, under the key the portal's scan and review screens use (the mock's
 * keys: `title`, `nace`, …), so D-1b lists it and D-1c finds its page for a difference.
 */
function toScanField(f: DeckFieldWire): ScanField {
  const key = DECK_FIELD_KEYS[f.key as ReviewKey] ?? f.key;
  return { key, label: f.label, value: f.key === 'source_of_funds' ? fundingText(f.value) : f.value, page: f.page };
}

const DECK_FIELD_KEYS: Partial<Record<ReviewKey, string>> = {
  trade_name: 'title',
  nace_codes: 'nace',
  shareholding: 'share',
  given_name: 'name',
  family_name: 'name',
  nationality: 'nationality',
  email: 'email',
  phone: 'phone',
  residence_address: 'address',
  source_of_funds: 'funding',
};

/**
 * The review screen's changes → the API's review fields (`PATCH /api/application/review`), only
 * those that differ from what the review holds now (`current`, the last application read). The API
 * refuses an empty request and empty values, and records every value it is sent as a new claim of
 * the founder's; so a field left as it was is not sent. A value the portal only showed from the
 * account (the name before the review has one) is sent, so that it becomes the founder's own.
 */
export function toReviewFields(patch: ReviewPatch, current: ApplicationWire): Partial<Record<ReviewKey, string>> {
  const fields: Partial<Record<ReviewKey, string>> = {};
  const put = (key: ReviewKey, value: string | undefined) => {
    if (value === undefined) return;
    const now = current.review[key]?.value.trim() ?? '';
    const next = value.replace(/\s+/g, ' ').trim();
    if (next !== now) fields[key] = next;
  };
  const c = patch.company;
  if (c?.root !== undefined || c?.activity !== undefined) {
    const [root = '', ...activity] = withoutSuffix(current.review.trade_name?.value ?? '').split(/\s+/);
    put('trade_name', withoutSuffix(`${c.root ?? root} ${c.activity ?? activity.join(' ')}`));
  }
  if (c?.nace) {
    const now = splitNace(current.review.nace_codes?.value ?? '').join(', ');
    const next = splitNace(c.nace.join(', ')).join(', ');
    if (next !== now) fields.nace_codes = next;
  }
  put('given_name', patch.founder?.firstName);
  put('family_name', patch.founder?.lastName);
  put('nationality', patch.founder?.nationality);
  put('email', patch.contact?.email);
  put('phone', patch.contact?.phone);
  put('residence_address', patch.contact?.address);
  put('postal_code', patch.contact?.postalCode);
  put('residence_country', patch.contact?.country);
  put('source_of_funds', patch.funding);
  return fields;
}

/**
 * The API's field names → the review screen's rows (D-1c), for showing a refusal's message at its
 * row. Several API fields share a row: the name row holds given name and family name; the address
 * row holds address, postal code and country.
 */
export const REVIEW_ROWS: Record<ReviewKey, string> = {
  trade_name: 'title',
  nace_codes: 'nace',
  shareholding: 'share',
  given_name: 'name',
  family_name: 'name',
  nationality: 'nationality',
  email: 'email',
  phone: 'phone',
  residence_address: 'address',
  postal_code: 'address',
  residence_country: 'address',
  source_of_funds: 'funding',
};

/** The API's field names → the inputs of the review screen's editors (founder, contact, funding cards). */
export const REVIEW_INPUTS: Partial<Record<ReviewKey, string>> = {
  given_name: 'firstName',
  family_name: 'lastName',
  nationality: 'nationality',
  email: 'email',
  phone: 'phone',
  residence_address: 'address',
  postal_code: 'postalCode',
  residence_country: 'country',
  source_of_funds: 'funding',
};

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

/**
 * One comparison of the profile with the deck. The API states the funding as its label but reads it
 * from the deck as a key ("own-abroad"); the key is shown as its label too, so both sides read alike.
 */
function toCrossCheck(c: ApplicationWire['crossCheck'][number]): CrossCheck {
  if (!CROSS_KEYS.includes(c.key as CrossKey)) throw new Error(`Unknown cross-check key from the API: ${c.key}`);
  const choice = c.choice === 'stated' || c.choice === 'read' || c.choice === 'edited' ? c.choice : null;
  const read = c.key === 'funding' ? fundingText(c.read) : c.read;
  return { key: c.key as CrossKey, label: c.label, stated: c.stated, read, match: c.match, choice, at: c.at };
}

/**
 * The trade-name check. The API's candidate carries the type suffix ("… A.Ş."); the portal keeps
 * titles without it and the screens add "Anonim Şirketi". For a conflict the API gives the staff
 * member's reason, not the registered title it clashed with, and no alternatives: those come from
 * the portal's own suggestions (rules.ts), which the founder may ignore and type their own.
 */
function toTitleCheck(t: TitleCheckWire | null): Application['titleCheck'] {
  if (!t) return undefined;
  const candidate = withoutSuffix(t.candidate);
  if (t.status !== 'conflict') return { status: t.status === 'checking' ? 'checking' : 'ok', candidate };
  const root = candidate.split(/\s+/)[0] ?? '';
  return { status: 'conflict', candidate, reason: t.reason ?? undefined, alternatives: titleAlternatives(root, candidate) };
}

function toLog(l: ApplicationWire['logs'][number]): LogEntry {
  const who = l.who === 'u' || l.who === 'a' || l.who === 'k' ? l.who : 's';
  return { at: l.at, text: l.text, who };
}
