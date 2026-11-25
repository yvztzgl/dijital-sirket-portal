import { ApplicationWire, MeWire, PhoneStatusWire } from '../api-types';
import { WizardReference } from '../models';
import profile from './captured/profile.json';
import reference from './captured/reference.json';
import reviewDecided from './captured/review-decided.json';
import reviewOpen from './captured/review-open.json';
import scanning from './captured/scanning.json';
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
  crossCheck: [],
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

/** At the review: profile stated, deck read, one difference (the phone) open, two fields changed by the founder. */
export const REVIEW_APPLICATION: ApplicationWire = {
  ...NEW_APPLICATION,
  stage: 'review',
  profile: { brand: 'Lumora', sector: 'software', funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya', at: '2026-11-25T09:45:00+00:00' },
  deck: {
    fileName: 'Lumora Sunum.pdf',
    sizeKb: 57,
    pages: 16,
    uploadedAt: '2026-11-25T09:46:00+00:00',
    status: 'read',
    fields: [
      { key: 'trade_name', label: 'Şirket unvanı', value: 'Lumora Veri Analitiği', page: 13, confidence: 'medium' },
      { key: 'nace_codes', label: 'NACE kodları', value: '62.01, 63.11', page: 13, confidence: 'high' },
      { key: 'phone', label: 'Telefon', value: '+49 151 2345 6789', page: 15, confidence: 'high' },
    ],
  },
  crossCheck: [
    { key: 'brand', label: 'Şirket / marka adı', stated: 'Lumora', read: 'Lumora Veri Analitiği', match: true, choice: null, at: null },
    { key: 'phone', label: 'Telefon', stated: '+49 151 2345 6700', read: '+49 151 2345 6789', match: false, choice: null, at: null },
  ],
  review: {
    trade_name: { label: 'Şirket unvanı', value: 'Lumora Veri Analitiği', mark: 'ai' },
    nace_codes: { label: 'NACE kodları', value: '62.01, 63.11', mark: 'ai' },
    given_name: { label: 'Ad', value: 'Ayşe', mark: 'ai' },
    family_name: { label: 'Soyad', value: 'Kaya-Berg', mark: 'edited' },
    nationality: { label: 'Uyruk', value: 'Almanya', mark: 'ai' },
    phone: { label: 'Telefon', value: '+49 151 2345 6789', mark: 'ai' },
    residence_address: { label: 'Adres', value: 'Torstraße 45, Berlin', mark: 'ai' },
    residence_country: { label: 'Ülke', value: 'Almanya', mark: 'ai' },
    postal_code: { label: 'Posta kodu', value: '10119', mark: 'entered' },
    source_of_funds: { label: 'Sermaye kaynağı', value: 'investor', mark: 'edited' },
  },
  logs: [
    { at: '2026-11-25T09:41:12+00:00', text: 'Başvuru oluşturuldu', who: 's' },
    { at: '2026-11-25T09:46:00+00:00', text: 'Sunum yüklendi · Lumora Sunum.pdf', who: 'u' },
    { at: '2026-11-25T09:46:30+00:00', text: 'Sunum okundu', who: 'a' },
  ],
};

/**
 * `GET /api/application` as the running API answered it at each stage of step 1, captured on
 * 2026-11-25 with tools/api-capture/capture.sh (one made-up founder, "Deneme Kurucu"; every e-mail
 * address replaced with kurucu@example.test). Re-run that script to refresh them.
 * The deck is a text "PDF" the development deck reader reads field by field; its phone and its
 * address line differ from the profile, so the review has two differences.
 */
export const CAPTURED = {
  /** Right after `POST /api/application`. */
  profile: profile as ApplicationWire,
  /** Profile saved, no deck. */
  verified: verified as ApplicationWire,
  /** Deck uploaded, the Worker has not read it yet (`deck.status: "reading"`, no fields). */
  scanning: scanning as ApplicationWire,
  /** Deck read; the phone and the country differ from the profile and wait for a choice. */
  reviewOpen: reviewOpen as ApplicationWire,
  /** Phone: the deck's value; country: the profile's; postal code typed, family name changed. */
  reviewDecided: reviewDecided as ApplicationWire,
  /** After "Onayla ve devam et": the trade name waits for staff. */
  titleChecking: titleChecking as ApplicationWire,
  /** Staff refused it (dev/staff.sh title reject "Benzer bir unvan sicilde kayıtlıdır."). */
  titleConflict: titleConflict as ApplicationWire,
  /** The founder chose "Lumora Analitik Yazılım" on D-1d. */
  titleCheckingAgain: titleCheckingAgain as ApplicationWire,
  /** Staff reserved it: on to the identity step (foreign founder). */
  titleReserved: titleReserved as ApplicationWire,
  /** `GET /api/application/status` while the title was being checked. */
  status: status as { stage: 'titleChecking'; changedAt: string },
  // Step 2 (captured 2026-11-25; each from a founder of its own, see tools/api-capture/capture.sh)
  /** Founder A: a check started on the phone page, seen from the computer. */
  identityRunningPhone: identityRunningPhone as ApplicationWire,
  /** Founder A after the phone finished and the Worker passed the identity. */
  declaration: declaration as ApplicationWire,
  /** Founder A right after the declaration: the list search runs. */
  screening: screening as ApplicationWire,
  /** Founder A after a clear list search: the API is at `payment` with the result `eligible`. */
  eligible: eligible as ApplicationWire,
  /** Founder B (third-party funds): a check started on the computer. */
  identityRunning: identityRunning as ApplicationWire,
  /** Founder B after the list search: under manual review. */
  manual: manual as ApplicationWire,
  /** Founder B after staff approved (dev/staff.sh review approve). */
  reviewApproved: reviewApproved as ApplicationWire,
  /** Founder D, resident (e-Devlet): straight to the declaration after the reserved title. */
  residentDeclaration: residentDeclaration as ApplicationWire,
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
  paymentOpen: paymentOpen as ApplicationWire,
  /** `POST /payment` without a recent second factor: 403. */
  stepUpRequired: stepUpRequired as ProblemWire,
  /** `POST /auth/step-up/verify` with a wrong code: 400, the sentence under `errors.code`. */
  stepUpWrongCode: stepUpWrongCode as ProblemWire,
  /** `POST /payment` with `tok_test_0002`: 422 `card_declined`. */
  cardDeclined: cardDeclined as ProblemWire,
  /** After `POST /payment` with `tok_test_4242`: stage `threeDs`, `payment.status: "3ds_pending"`. */
  payment3dsPending: payment3dsPending as ApplicationWire,
  /** `POST /payment/3ds` with a wrong code: 422 with the provider's code; the payment stays open. */
  threeDsWrongCode: threeDsWrongCode as ProblemWire,
  /** After `POST /payment/3ds/cancel`: back at `payment`, the payment `failed`. */
  paymentCancelled: paymentCancelled as ApplicationWire,
  /** Paid again (no new code within 15 minutes), 123456: stage `signing`, `captured`. */
  paymentCaptured: paymentCaptured as ApplicationWire,
  // Steps 4 and 5 (captured 2026-11-25; founder F foreign, founder R resident; see tools/api-capture/capture.sh).
  /** F after the payment: `signing`, no consent yet. */
  esignSigning: esignSigning as ApplicationWire,
  /** `POST esign/call/start` before the consent: 409. */
  esignConsentMissing: esignConsentMissing as ProblemWire,
  /** F after `POST esign/consent {consent:true}`: `callConsentAt` set. */
  esignConsent: esignConsent as ApplicationWire,
  /** F after `POST esign/call/start`: `calling`, the call open. */
  esignCallOpen: esignCallOpen as ApplicationWire,
  /** F after `POST esign/call/end`: `signing` again, "Görüşme tamamlanmadan sonlandırıldı". */
  esignCallEnded: esignCallEnded as ApplicationWire,
  /** `POST esign/call/end` with no call open: 409. */
  esignNoOpenCall: esignNoOpenCall as ProblemWire,
  /** F right after `POST esign/call/complete`: still `calling` (the certificate being issued). */
  esignIssuing: esignIssuing as ApplicationWire,
  /** F once the Worker issued the daily certificate: `signed`, `nes_daily`, valid 24 hours. */
  esignSigned: esignSigned as ApplicationWire,
  /** F right after `POST setup {confirmed:true}`: `setup`, the steps not created yet (`setup: null`). */
  setupStarted: setupStarted as ApplicationWire,
  /** `GET /api/application/status` at that moment. */
  statusSetup: statusSetup as { stage: 'setup'; changedAt: string },
  /** F once the Worker created the nine steps: 1–3 completed, 4–9 pending, the first task with the institution. */
  setupSteps: setupSteps as ApplicationWire,
  /** F while staff work (dev/staff.sh setup): the registration done, its numbers in `results`. */
  setupResults: setupResults as ApplicationWire,
  /** F at the end: `done`, every step completed, all the numbers. */
  setupDone: setupDone as ApplicationWire,
  /** `GET /api/application/status` after `done`. */
  statusDone: statusDone as { stage: 'done'; changedAt: string },
  /** R (resident, e-Devlet) after the payment: `signing`. */
  residentSigning: residentSigning as ApplicationWire,
  /** R right after `POST esign/resident {method:"existing"}`: the API reports `calling` while issuing (no call). */
  residentIssuing: residentIssuing as ApplicationWire,
  /** R once the Worker verified it: `signed`, `nes_existing`, valid a year. */
  residentSigned: residentSigned as ApplicationWire,
  /** R after `POST setup`, once the steps exist. */
  residentSetupSteps: residentSetupSteps as ApplicationWire,
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
 * Reading the deck failed for good: the API puts the stage back at `verified` with
 * `deck.status: "failed"`. Not captured (the development reader does not fail; the Worker gives up
 * only after five failures): the captured scanning answer with those two values changed.
 */
export const DECK_FAILED: ApplicationWire = { ...CAPTURED.scanning, stage: 'verified', deck: { ...CAPTURED.scanning.deck!, status: 'failed' } };

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
