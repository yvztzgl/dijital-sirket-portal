import { ApplicationWire, MeWire } from '../api-types';

/**
 * Literal API answers for the specs, in the shape `GET /api/me` and `GET /api/application` send
 * (records in dijital-sirket-api/src/DijitalSirket.Api/Models/). The next piece replaces or
 * extends these with JSON captured from the running API.
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
