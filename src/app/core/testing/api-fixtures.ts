import { ApplicationWire, MeWire, PhoneStatusWire } from '../api-types';
import { EvaluationReference, WizardReference } from '../models';
import evaluationReference from '../evaluation-reference.json';
import evaluating from './hand-written/evaluating.json';
import evaluationFailed from './hand-written/evaluation-failed.json';
import evaluationQuestions from './hand-written/evaluation-questions.json';
import reviewDefaults from './hand-written/review-defaults.json';
import reviewEdited from './hand-written/review-edited.json';
import statusEvaluating from './hand-written/status-evaluating.json';
import profile from './captured/profile.json';
import reference from './captured/reference.json';
import status from './captured/status.json';
import titleCheckingAgain from './captured/title-checking-again.json';
import titleChecking from './captured/title-checking.json';
import titleConflict from './captured/title-conflict.json';
import titleReserved from './captured/title-reserved.json';
import verified from './captured/verified.json';
import closed from './captured/closed.json';
import declaration from './captured/declaration.json';
import eligible from './captured/eligible.json';
import identityRunningPhone from './captured/identity-running-phone.json';
import identityRunning from './captured/identity-running.json';
import manual from './captured/manual.json';
import phoneDone from './captured/phone-done.json';
import phoneLink from './captured/phone-link.json';
import phoneReady from './captured/phone-ready.json';
import phoneRunning from './captured/phone-running.json';
import residentDeclaration from './captured/resident-declaration.json';
import reviewApproved from './captured/review-approved.json';
import screening from './captured/screening.json';
import cardDeclined from './captured/card-declined.json';
import payment3dsPending from './captured/payment-3ds-pending.json';
import paymentCancelled from './captured/payment-cancelled.json';
import paymentCaptured from './captured/payment-captured.json';
import paymentOpen from './captured/payment-open.json';
import stepUpRequired from './captured/step-up-required.json';
import stepUpWrongCode from './captured/step-up-wrong-code.json';
import threeDsWrongCode from './captured/threeds-wrong-code.json';
import esignSigning from './captured/esign-signing.json';
import esignConsent from './captured/esign-consent.json';
import esignCallOpen from './captured/esign-call-open.json';
import esignCallEnded from './captured/esign-call-ended.json';
import esignIssuing from './captured/esign-issuing.json';
import esignSigned from './captured/esign-signed.json';
import setupStarted from './captured/setup-started.json';
import setupSteps from './captured/setup-steps.json';
import setupResults from './captured/setup-results.json';
import setupDone from './captured/setup-done.json';
import residentSigning from './captured/resident-signing.json';
import residentIssuing from './captured/resident-issuing.json';
import residentSigned from './captured/resident-signed.json';
import residentSetupSteps from './captured/resident-setup-steps.json';
import esignConsentMissing from './captured/esign-consent-missing.json';
import esignNoOpenCall from './captured/esign-no-open-call.json';
import statusSetup from './captured/status-setup.json';
import statusDone from './captured/status-done.json';

/**
 * Literal API answers for the specs, in the shape `GET /api/me` and `GET /api/application` send
 * (records in dijital-sirket-api/src/DijitalSirket.Api/Models/). The hand-written ones come first;
 * `CAPTURED` holds what the running API answered on 2026-11-25 (below).
 */

export const ME: MeWire = { firstName: 'Ayşe', lastName: 'Kaya', email: 'ayse@example.test', founderType: 'foreign', verified: true };

/**
 * A fresh application, right after `POST /api/application`. Same values as the answer the running
 * API gave on 2026-11-25 (portal E2E walk), except the uuid and the times.
 */
export const NEW_APPLICATION: ApplicationWire = {
  id: '0193a3c2-7f00-7000-8000-000000000001',
  referenceNo: 'DS-26-03403699',
  stage: 'profile',
  status: 'draft',
  founderType: 'foreign',
  createdAt: '2026-11-25T09:41:12.408113+00:00',
  profile: null,
  deck: null,
  cv: null,
  evaluation: null,
  review: {},
  titleCheck: null,
  eligibility: null,
  payment: {
    amountMinor: 1_275_000,
    fees: [
      { code: 'tescil_ilan_harci', label: 'Ticaret sicili tescil ve ilan harçları', amountMinor: 485_000 },
      { code: 'noter_eimza', label: 'Noter onayı ve e-İmza (ESHS)', amountMinor: 240_000 },
      { code: 'sanal_ofis_yil1', label: 'Sanal ofis · ilk yıl', amountMinor: 360_000 },
      { code: 'platform', label: 'Platform hizmet bedeli', amountMinor: 190_000 },
    ],
    status: null,
    last4: null,
    paidAt: null,
  },
  signature: null,
  callConsentAt: null,
  setup: null,
  results: null,
  documents: [],
  logs: [{ at: '2026-11-25T09:41:12.408113+00:00', text: 'Başvuru oluşturuldu', who: 's' }],
};

/** At the company form: defaults from the profile and the account, the founder's own title and codes, one name changed. */
export const REVIEW_APPLICATION: ApplicationWire = {
  ...NEW_APPLICATION,
  stage: 'review',
  profile: { brand: 'Lumora', sector: 'software', funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya', at: '2026-11-25T09:45:00+00:00' },
  deck: { fileName: 'Lumora Sunum.pdf', sizeKb: 57 },
  cv: { fileName: 'Ozgecmis.pdf', sizeKb: 120 },
  evaluation: { status: 'done', attempt: 1, maxAttempts: 3, startedAt: '2026-11-25T09:46:00+00:00', finishedAt: '2026-11-25T09:50:00+00:00' },
  review: {
    trade_name: { label: 'Şirket unvanı', value: 'Lumora Veri Analitiği', mark: 'entered' },
    nace_codes: { label: 'NACE kodları', value: '62.01, 63.11', mark: 'entered' },
    given_name: { label: 'Ad', value: 'Ayşe', mark: 'profile' },
    family_name: { label: 'Soyad', value: 'Kaya-Berg', mark: 'edited' },
    nationality: { label: 'Uyruk', value: 'Almanya', mark: 'profile' },
    email: { label: 'E-posta', value: 'ayse@example.test', mark: 'profile' },
    phone: { label: 'Telefon', value: '+49 151 2345 6700', mark: 'profile' },
    residence_country: { label: 'Ülke', value: 'Almanya', mark: 'profile' },
    postal_code: { label: 'Posta kodu', value: '10119', mark: 'entered' },
    source_of_funds: { label: 'Sermaye kaynağı', value: 'investor', mark: 'edited' },
  },
  logs: [
    { at: '2026-11-25T09:41:12+00:00', text: 'Başvuru oluşturuldu', who: 's' },
    { at: '2026-11-25T09:46:00+00:00', text: 'Sunum ve özgeçmiş yüklendi', who: 'u' },
  ],
};

/**
 * The answers captured before the outside evaluation existed (2026-11-25) have no `cv` and no
 * `evaluation`, and carry the old reader's `crossCheck` and deck fields; the mapper ignores those.
 */
const wire = (json: unknown) => json as ApplicationWire;

/**
 * HAND-WRITTEN until recaptured (see testing/hand-written/README.md): the deck step with the outside
 * evaluation, as the contract of 2026-11-25 describes it. Founder "Deneme Kurucu", the same profile as
 * `CAPTURED.verified`.
 */
export const HAND = {
  /** `GET /api/reference/evaluation`: the saved STB dictionary (17 groups, 216 activities, 4, 8, 4) and the limits. */
  referenceEvaluation: evaluationReference as EvaluationReference,
  /** Deck and CV uploaded; the evaluation runs (first attempt). */
  evaluating: evaluating as ApplicationWire,
  /** `GET /api/application/status` while it runs. */
  statusEvaluating: statusEvaluating as { stage: 'evaluating'; changedAt: string },
  /** The evaluation needs more information (a stop state). */
  evaluationQuestions: evaluationQuestions as ApplicationWire,
  /** The evaluation failed after three attempts: back at `verified` for a new upload. */
  evaluationFailed: evaluationFailed as ApplicationWire,
  /** Done: the company form with defaults from the profile and the account (`profile`), title and codes empty. */
  reviewDefaults: reviewDefaults as ApplicationWire,
  /** The founder typed the title, the codes, an address and a postal code, and changed the family name. */
  reviewEdited: reviewEdited as ApplicationWire,
};

/**
 * `GET /api/application` as the running API answered it at each stage of step 1, captured on
 * 2026-11-25 with tools/api-capture/capture.sh (one made-up founder, "Deneme Kurucu"; every e-mail
 * address replaced with kurucu@example.test). Re-run that script to refresh them.
 * The deck was then read by the development deck reader (the step the outside evaluation replaced on
 * 2026-11-25); its answers (scanning, the review with differences) were removed with it, and their
 * successors are in `HAND` above. The later answers here still carry the reader's leftovers.
 */
export const CAPTURED = {
  /** Right after `POST /api/application`. */
  profile: wire(profile),
  /** Profile saved, no deck. */
  verified: wire(verified),
  /** After "Onayla ve devam et": the trade name waits for staff. */
  titleChecking: wire(titleChecking),
  /** Staff refused it (dev/staff.sh title reject "Benzer bir unvan sicilde kayıtlıdır."). */
  titleConflict: wire(titleConflict),
  /** The founder chose "Lumora Analitik Yazılım" on D-1d. */
  titleCheckingAgain: wire(titleCheckingAgain),
  /** Staff reserved it: on to the identity step (foreign founder). */
  titleReserved: wire(titleReserved),
  /** `GET /api/application/status` while the title was being checked. */
  status: status as { stage: 'titleChecking'; changedAt: string },
  // Step 2 (captured 2026-11-25; each from a founder of its own, see tools/api-capture/capture.sh)
  /** Founder A: a check started on the phone page, seen from the computer. */
  identityRunningPhone: wire(identityRunningPhone),
  /** Founder A after the phone finished and the Worker passed the identity. */
  declaration: wire(declaration),
  /** Founder A right after the declaration: the list search runs. */
  screening: wire(screening),
  /** Founder A after a clear list search: the API is at `payment` with the result `eligible`. */
  eligible: wire(eligible),
  /** Founder B (third-party funds): a check started on the computer. */
  identityRunning: wire(identityRunning),
  /** Founder B after the list search: under manual review. */
  manual: wire(manual),
  /** Founder B after staff approved (dev/staff.sh review approve). */
  reviewApproved: wire(reviewApproved),
  /** Founder D, resident (e-Devlet): straight to the declaration after the reserved title. */
  residentDeclaration: wire(residentDeclaration),
  /** Founder C after staff rejected: `GET /api/application` answers this 404. */
  closed: closed as { title: string; status: 404; code: 'no_application' },
  /** `POST /api/application/phone-link` (200); the token is replaced with "<token>". */
  phoneLink: phoneLink as { token: string; expiresInSeconds: number },
  /** `GET /api/phone/status` with the link's token: before the start, while it runs, after the Worker decided. */
  phoneReady: phoneReady as PhoneStatusWire,
  phoneRunning: phoneRunning as PhoneStatusWire,
  phoneDone: phoneDone as PhoneStatusWire,
  /** `GET /api/reference/wizard`. */
  reference: reference as WizardReference,
  // Step 3 (captured 2026-11-25; founder E, see tools/api-capture/capture.sh). The card is only ever
  // the development token (tok_test_4242, tok_test_0002); no card number exists in any of these.
  /** Founder E at `payment` after a clear list search, before any payment. */
  paymentOpen: wire(paymentOpen),
  /** `POST /payment` without a recent second factor: 403. */
  stepUpRequired: stepUpRequired as ProblemWire,
  /** `POST /auth/step-up/verify` with a wrong code: 400, the sentence under `errors.code`. */
  stepUpWrongCode: stepUpWrongCode as ProblemWire,
  /** `POST /payment` with `tok_test_0002`: 422 `card_declined`. */
  cardDeclined: cardDeclined as ProblemWire,
  /** After `POST /payment` with `tok_test_4242`: stage `threeDs`, `payment.status: "3ds_pending"`. */
  payment3dsPending: wire(payment3dsPending),
  /** `POST /payment/3ds` with a wrong code: 422 with the provider's code; the payment stays open. */
  threeDsWrongCode: threeDsWrongCode as ProblemWire,
  /** After `POST /payment/3ds/cancel`: back at `payment`, the payment `failed`. */
  paymentCancelled: wire(paymentCancelled),
  /** Paid again (no new code within 15 minutes), 123456: stage `signing`, `captured`. */
  paymentCaptured: wire(paymentCaptured),
  // Steps 4 and 5 (captured 2026-11-25; founder F foreign, founder R resident; see tools/api-capture/capture.sh).
  /** F after the payment: `signing`, no consent yet. */
  esignSigning: wire(esignSigning),
  /** `POST esign/call/start` before the consent: 409. */
  esignConsentMissing: esignConsentMissing as ProblemWire,
  /** F after `POST esign/consent {consent:true}`: `callConsentAt` set. */
  esignConsent: wire(esignConsent),
  /** F after `POST esign/call/start`: `calling`, the call open. */
  esignCallOpen: wire(esignCallOpen),
  /** F after `POST esign/call/end`: `signing` again, "Görüşme tamamlanmadan sonlandırıldı". */
  esignCallEnded: wire(esignCallEnded),
  /** `POST esign/call/end` with no call open: 409. */
  esignNoOpenCall: esignNoOpenCall as ProblemWire,
  /** F right after `POST esign/call/complete`: still `calling` (the certificate being issued). */
  esignIssuing: wire(esignIssuing),
  /** F once the Worker issued the daily certificate: `signed`, `nes_daily`, valid 24 hours. */
  esignSigned: wire(esignSigned),
  /** F right after `POST setup {confirmed:true}`: `setup`, the steps not created yet (`setup: null`). */
  setupStarted: wire(setupStarted),
  /** `GET /api/application/status` at that moment. */
  statusSetup: statusSetup as { stage: 'setup'; changedAt: string },
  /** F once the Worker created the nine steps: 1–3 completed, 4–9 pending, the first task with the institution. */
  setupSteps: wire(setupSteps),
  /** F while staff work (dev/staff.sh setup): the registration done, its numbers in `results`. */
  setupResults: wire(setupResults),
  /** F at the end: `done`, every step completed, all the numbers. */
  setupDone: wire(setupDone),
  /** `GET /api/application/status` after `done`. */
  statusDone: statusDone as { stage: 'done'; changedAt: string },
  /** R (resident, e-Devlet) after the payment: `signing`. */
  residentSigning: wire(residentSigning),
  /** R right after `POST esign/resident {method:"existing"}`: the API reports `calling` while issuing (no call). */
  residentIssuing: wire(residentIssuing),
  /** R once the Worker verified it: `signed`, `nes_existing`, valid a year. */
  residentSigned: wire(residentSigned),
  /** R after `POST setup`, once the steps exist. */
  residentSetupSteps: wire(residentSetupSteps),
};

/** An error body as the API sends it (`application/problem+json`). */
export interface ProblemWire {
  title: string;
  status: number;
  code: string;
  requestId: string;
  errors?: Record<string, string[]>;
}

/**
 * A failed camera check, built by hand from the captured `identityRunning` (the development identity
 * provider always passes, so a failure cannot be captured). What the API's view says then
 * (ApplicationQueries: the last identity_check is done and no founder person was linked): no check
 * open, `identityError: "identity_failed"`, and the Worker's timeline line.
 */
export const IDENTITY_FAILED: ApplicationWire = {
  ...CAPTURED.identityRunning,
  eligibility: { ...CAPTURED.identityRunning.eligibility!, running: false, identityError: 'identity_failed' },
  logs: [...CAPTURED.identityRunning.logs, { at: '2026-11-25T10:31:20+00:00', text: 'Kimlik doğrulanamadı; lütfen yeniden deneyiniz', who: 's' }],
};

/**
 * The second failure (the policy's limit is two): ApplicationStage.Of says `manual` while the
 * application's status is still `identity`; the view's result stays null and the identity not done.
 */
export const IDENTITY_FAILED_TWICE: ApplicationWire = { ...IDENTITY_FAILED, stage: 'manual' };

/**
 * The daily certificate after its 24 hours, before the formation was started. Not captured (it takes a
 * day): the captured `esignSigned` with what ApplicationStage then reports: the stage back at `signing`
 * (`awaiting_esign` without a valid certificate) and the expired certificate still in the view.
 */
export const SIGNATURE_EXPIRED: ApplicationWire = {
  ...CAPTURED.esignSigned,
  stage: 'signing',
  signature: { ...CAPTURED.esignSigned.signature!, issuedAt: '2026-11-20T09:00:00+00:00', validUntil: '2026-11-21T09:00:00+00:00' },
};

/** `POST /api/application/setup` with an expired certificate (StartSetupHandler; not captured, see above). */
export const NO_VALID_SIGNATURE: ProblemWire = {
  title: 'Geçerli bir e-imzanız yok. Lütfen e-imza adımını yeniden yapınız.',
  status: 409,
  code: 'no_valid_signature',
  requestId: 'hand-written',
};
