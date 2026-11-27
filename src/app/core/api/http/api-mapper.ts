import type { ReviewPatch } from '@core/api/api';
import { ApplicationWire, EvaluationWire, MeWire, ReviewFieldWire, ReviewKey, StageWire, TitleCheckWire, UploadWire } from './api-types';
import { Account, Application, CAPITAL, Evaluation, FieldMark, FundingSource, FUNDING_LABELS, LogEntry, Profile, Sector, SECTORS, SetupStep, SetupTask, Stage } from '@core/models/models';
import { titleAlternatives, withoutSuffix } from '@core/utils/rules';

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
  'profile', 'verified', 'evaluating', 'evaluationQuestions', 'review', 'titleChecking', 'titleConflict', 'eligibility', 'declaration', 'screening', 'manual',
  'payment', 'threeDs', 'signing', 'calling', 'signed', 'setup', 'done',
];

/** What the HTTP client knows beside the view and passes to `toApplication`. */
export interface MapOptions {
  /** The founder pressed "Ödemeye geç" on the result screen in this page's life (HttpApi keeps it in memory). */
  resultSeen?: boolean;
  /**
   * The card holder and the card's last four digits as typed on this page for this application.
   * The API returns neither (its `last4` is always null), so HttpApi keeps them in memory for the
   * session; after a reload the screens show no card.
   */
  card?: { holder: string; last4: string };
  /**
   * The start time of the video call this page has reported ended (`call/complete`), or that the
   * server said was no longer open. The API reports `calling` both while the call is open and while
   * the certificate is being issued; HttpApi remembers which, in memory (see `toCall`).
   */
  callCompleted?: string;
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
      brand: profile?.brand ?? '',
      root,
      activity: activity.join(' '),
      nace: splitNace(review('nace_codes')),
      // The NACE codes stated on the profile (D-1e's "Faaliyet alanı").
      suggestedNace: profile?.naceCodes ?? [],
      // The legal minimum for an anonim şirket, the same constant the mock uses; the API does not send a capital yet.
      capital: CAPITAL,
    },
    funding,
    marks: toMarks(view),
    profile,
    // `?? null`: answers captured before the evaluation existed have no `cv` and no `evaluation`.
    deck: toUpload(view.deck),
    cv: toUpload(view.cv ?? null),
    evaluation: toEvaluation(view.evaluation ?? null),
    titleCheck: toTitleCheck(view.titleCheck),
    eligibility: toEligibility(view),
    payment: toPayment(view.payment, options.card),
    fees: view.payment.fees.map((f) => ({ code: f.code, label: f.label, amount: f.amountMinor / 100 })),
    callConsentAt: view.callConsentAt ?? undefined,
    call: toCall(view, options.callCompleted),
    signature: view.signature
      ? {
          method: SIGNATURE_METHODS[view.signature.kind] ?? 'eshs',
          serial: view.signature.serial,
          // The API sends no holder: the certificate is the signed-in founder's, under the account's name.
          holder: `${account.firstName} ${account.lastName}`.trim(),
          issuedAt: view.signature.issuedAt,
          validUntil: view.signature.validUntil,
        }
      : undefined,
    setup: toSetup(view),
    results: toResults(view.results),
    docs: view.documents.map((d) => ({ ...(DOC_NAMES[d.type] ?? { group: 'Diğer belgeler', name: d.type }), sizeKb: d.sizeKb, at: d.at })),
    logs: view.logs.map(toLog),
  };
}

function toUpload(u: UploadWire | null): Application['deck'] {
  return u ? { fileName: u.fileName ?? '', sizeKb: u.sizeKb } : undefined;
}

const EVALUATION_STATUSES: Evaluation['status'][] = ['queued', 'running', 'questions', 'done', 'failed', 'rejected', 'cancelled'];

/** The outside evaluation as the API reports it; an unknown status is an error, like an unknown stage. */
function toEvaluation(e: EvaluationWire | null): Application['evaluation'] {
  if (!e) return undefined;
  if (!EVALUATION_STATUSES.includes(e.status)) throw new Error(`Unknown evaluation status from the API: ${e.status}`);
  // A reason this build does not know is no reason: D-1a then shows its general notice.
  const reason = e.reason === 'formDeckConflict' ? e.reason : null;
  return { status: e.status, attempt: e.attempt, maxAttempts: e.maxAttempts, startedAt: e.startedAt, finishedAt: e.finishedAt, reason };
}

/**
 * The certificate kinds the API issues (formation.certificate.kind) → the portal's method words:
 * the daily certificate of the video call (`eshs`), a resident's existing e-signature, and a new one
 * through e-Devlet (the development provider issues `nes_standard` for that).
 */
const SIGNATURE_METHODS: Record<string, 'eshs' | 'existing' | 'edevlet'> = {
  nes_daily: 'eshs',
  nes_existing: 'existing',
  nes_standard: 'edevlet',
};

/**
 * The video call while the API is at `calling` (foreign founders only; a resident at `calling` is
 * waiting for the provider, with no call). The call's start is the newest "ESHS görüntülü görüşmesi
 * başladı" line of the timeline (the view has no field for it); the portal's scripted call runs from
 * it, so a reload continues where the script was. `completed` when HttpApi knows this call was
 * reported ended (`callCompleted`); then the certificate is being issued.
 */
function toCall(view: ApplicationWire, callCompleted: string | undefined): Application['call'] {
  if (view.stage !== 'calling' || view.founderType === 'resident') return undefined;
  const startedAt = callStartedAt(view);
  if (!startedAt) return undefined;
  return callCompleted === startedAt ? { startedAt, completed: true } : { startedAt };
}

/** When the newest video call started, from the timeline; undefined when no call was ever started. */
export function callStartedAt(view: ApplicationWire): string | undefined {
  return latestLog(view, [LOG_TEXTS.callStarted])?.at;
}

/**
 * Step 5 from the API. `steps` is null until the Worker has created them (the stage is already
 * `setup`); the times come from the timeline lines "Kuruluş başlatıldı", "Kuruluş belgelerinin e-imza
 * ile imzalanması onaylandı" and "Şirketiniz kuruldu" (the view has no fields for them).
 */
function toSetup(view: ApplicationWire): Application['setup'] {
  const started = latestLog(view, [LOG_TEXTS.setupStarted]);
  if (view.stage !== 'setup' && view.stage !== 'done' && !view.setup) return undefined;
  const consent = latestLog(view, [LOG_TEXTS.setupConsent]);
  const finished = view.stage === 'done' ? latestLog(view, [LOG_TEXTS.formationDone]) : undefined;
  return {
    startedAt: started?.at ?? '',
    ...(consent ? { signConsentAt: consent.at } : {}),
    ...(finished ? { finishedAt: finished.at } : {}),
    steps: view.setup ? view.setup.steps.map(toSetupStep) : null,
  };
}

function toSetupStep(s: NonNullable<ApplicationWire['setup']>['steps'][number]): SetupStep {
  const status = s.status === 'pending' || s.status === 'in_progress' || s.status === 'completed' ? s.status : 'other';
  return { no: s.no, code: s.code, title: s.title, status, tasks: s.tasks.map(toSetupTask) };
}

/** The API's task statuses (formation.task_instance.status); `ready` is not started yet, `waiting_external` is with the institution. */
const TASK_STATUSES: Record<string, SetupTask['status']> = {
  pending: 'pending',
  ready: 'pending',
  in_progress: 'in_progress',
  waiting_external: 'waiting',
  done: 'done',
  exempt: 'exempt',
};

function toSetupTask(t: { code: string; title: string; status: string }): SetupTask {
  return { code: t.code, title: t.title, status: TASK_STATUSES[t.status] ?? 'other' };
}

/**
 * The company's numbers (company.identifier kinds) under the portal's names. Only what has arrived;
 * the API has more kinds (TTSG sayı, oda sicil no, …) that no screen shows yet. No advisor: the API
 * does not send the advisor's name or firm.
 */
function toResults(results: Record<string, string> | null): Application['results'] {
  if (!results) return undefined;
  const out: NonNullable<Application['results']> = {};
  for (const [kind, key] of Object.entries(RESULT_KEYS)) if (results[kind]) out[key] = results[kind];
  return Object.keys(out).length ? out : undefined;
}

const RESULT_KEYS: Record<string, keyof NonNullable<Application['results']>> = {
  vkn: 'vkn',
  vergi_dairesi: 'taxOffice',
  mersis_no: 'mersis',
  tescil_no: 'registryNo',
  iban: 'iban',
  e_fatura_no: 'eInvoiceNo',
  sgk_isyeri_no: 'sgkNo',
};

/**
 * The portal's result screen (D-2b, stage `eligible`) as a one-time acknowledgement. The API has no
 * such stage: a cleared list search goes straight to `payment`. The screen is shown while the API
 * is at `payment` with the result `eligible`, no payment has ever been started (`payment.status` is
 * null; after a cancelled 3-D Secure it is `failed`, so a reload goes to D-3a), the founder has not yet
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
 * The payment as the portal's screens know it: present while a payment is waiting for 3-D Secure
 * (`3ds_pending`, API stage `threeDs`) or once it is captured (`paidAt` set, stage `signing`).
 * A cancelled or failed payment (`failed`) is no payment at all for the screens: the API is back at
 * `payment` and D-3a asks for a card again, as the mock does after "İptal". Amounts are in kuruş on
 * the wire and in TL in the portal. Holder and last four digits are not in the view (see `MapOptions.card`).
 */
function toPayment(p: ApplicationWire['payment'], card: MapOptions['card']): Application['payment'] {
  if (p.status !== '3ds_pending' && p.status !== 'captured') return undefined;
  return {
    holder: card?.holder ?? '',
    last4: p.last4 ?? card?.last4 ?? '',
    amount: p.amountMinor / 100,
    ...(p.status === 'captured' && p.paidAt ? { paidAt: p.paidAt } : {}),
  };
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
  callStarted: 'ESHS görüntülü görüşmesi başladı',
  setupConsent: 'Kuruluş belgelerinin e-imza ile imzalanması onaylandı',
  setupStarted: 'Kuruluş başlatıldı',
  formationDone: 'Şirketiniz kuruldu',
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
/**
 * The document types the API names in `documents`, as the portal's documents list groups and names
 * them. Today the API lists only the deck and the address document; the other types are those the
 * database design names (doc.document.type) for documents an institution or the platform will issue,
 * named here so they read in Turkish when they come. Any other type: "Diğer belgeler" and the type.
 */
const DOC_NAMES: Record<string, { group: string; name: string }> = {
  deck: { group: '1 · Başvuru & Uygunluk', name: 'Sunum' },
  cv: { group: '1 · Başvuru & Uygunluk', name: 'Özgeçmiş' },
  address_proof: { group: '1 · Başvuru & Uygunluk', name: 'Adres belgesi' },
  passport_page: { group: '1 · Başvuru & Uygunluk', name: 'Pasaport sayfası' },
  makbuz: { group: '2 · Ödeme', name: 'Ödeme makbuzu' },
  esas_sozlesme: { group: '4 · Tescil & Oda', name: 'Esas sözleşme' },
  ttsg_ilani: { group: '4 · Tescil & Oda', name: 'Ticaret Sicili Gazetesi ilanı' },
  sicil_tasdiknamesi: { group: '4 · Tescil & Oda', name: 'Sicil tasdiknamesi' },
  vergi_levhasi: { group: '5 · Vergi', name: 'Vergi levhası' },
  bloke_mektubu: { group: '7 · Banka', name: 'Sermaye blokaj mektubu' },
};

function toProfile(p: NonNullable<ApplicationWire['profile']>): Profile {
  return {
    brand: p.brand,
    // A profile saved before API step 24 has a sector instead: its codes, by the same table as the API's.
    naceCodes: p.naceCodes?.length ? p.naceCodes : (SECTORS[p.sector as Sector]?.nace ?? []),
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
 * The review's marks, under the portal's field names. The API says `profile` (a default taken from
 * the profile or the account, untouched), `edited` or `entered`; the portal shows the last two alike.
 * Several API fields share one portal row (given name, family name and nationality are "name"): an
 * edit wins.
 */
function toMarks(view: ApplicationWire): Record<string, FieldMark> {
  const marks: Record<string, FieldMark> = {};
  for (const [key, field] of Object.entries(view.review) as [ReviewKey, ReviewFieldWire][]) {
    const name = MARK_NAMES[key];
    // An empty value has no mark to show (the title and the NACE codes may arrive empty, e.g. with no default).
    if (!name || !field.value.trim()) continue;
    const mark: FieldMark = field.mark === 'profile' ? 'profile' : 'edited';
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
