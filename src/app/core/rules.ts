import { EvaluationAnswers, EvaluationReference, FundingSource } from './models';

/**
 * Checks and constants the screens use to help the founder before anything is sent. They are pure
 * and belong to neither API implementation, so a build on the HTTP client does not pull in the
 * mock to get them. The server repeats every check; these only give early feedback.
 * (Moved here unchanged from mock-api.ts, which still re-exports them.)
 */

/** Largest address document the declaration screen takes. */
export const ADDRESS_DOC_MAX = 10 * 1024 * 1024;

/** The API's refusal when either deck consent is missing; the screen shows the same text. */
export const DECK_CONSENT_ERROR = 'Devam etmek için aydınlatma metnini ve değerlendirme hizmetine aktarım onayını işaretleyiniz.';

/** The upload limits as `GET /api/reference/evaluation` sends them (`EvaluationReference.limits`). */
export type EvaluationLimits = EvaluationReference['limits'];

/** The field names of the API's refusal (`errors.<field>`), which the screen shows at its fields. */
export type EvaluationField = 'deck' | 'cv' | 'summary' | 'activityGroupId' | 'activityId' | 'businessModelIds' | 'revenueModelIds' | 'productTypeIds';

const isPdf = (file: { name: string }) => /\.pdf$/i.test(file.name);

/** The API's refusal of an activity outside the chosen group (`errors.activityId`, 2026-11-26). */
export const ACTIVITY_NOT_IN_GROUP = 'Seçilen faaliyet alanı, seçilen faaliyet grubuna ait değildir.';

/**
 * The deck upload's checks (D-1a), keyed by the API's field names, one message each; empty when
 * nothing is wrong. The screen runs them before sending and the mock refuses with them, so both
 * modes refuse alike; the API repeats them. The deck's page count (3–40) cannot be checked here:
 * the evaluation service checks it and ends the evaluation `rejected`.
 * `choices`: the reference's ids; an id outside them is refused like a missing one.
 */
export function evaluationErrors(
  input: { deck: { name: string; size: number } | null; cv: { name: string; size: number } | null } & EvaluationAnswers,
  limits: EvaluationLimits,
  choices?: Pick<EvaluationReference, 'activityGroups' | 'activities' | 'businessModels' | 'revenueModels' | 'productTypes'>,
): Partial<Record<EvaluationField, string>> {
  const errors: Partial<Record<EvaluationField, string>> = {};
  const mb = (n: number) => n * 1024 * 1024;
  const known = (list: { id: number }[] | undefined, id: number) => !list || list.some((o) => o.id === id);

  if (!input.deck || input.deck.size === 0) errors.deck = 'Sunum dosyanızı yükleyiniz.';
  else if (!isPdf(input.deck)) errors.deck = 'Sunum PDF biçiminde olmalıdır.';
  else if (input.deck.size > mb(limits.deckMaxMb)) errors.deck = `Sunum dosyası ${limits.deckMaxMb} MB’tan büyük olamaz.`;

  if (!input.cv || input.cv.size === 0) errors.cv = 'Özgeçmişinizi yükleyiniz.';
  else if (!isPdf(input.cv)) errors.cv = 'Özgeçmiş PDF biçiminde olmalıdır.';
  else if (input.cv.size > mb(limits.cvMaxMb)) errors.cv = `Özgeçmiş dosyası ${limits.cvMaxMb} MB’tan büyük olamaz.`;

  const length = input.summary.trim().length;
  if (length < limits.summaryMin) errors.summary = `Özet en az ${limits.summaryMin} karakter olmalıdır.`;
  else if (length > limits.summaryMax) errors.summary = `Özet en fazla ${limits.summaryMax} karakter olabilir.`;

  if (input.activityGroupId === null || !known(choices?.activityGroups, input.activityGroupId)) errors.activityGroupId = 'Faaliyet grubunu seçiniz.';
  if (input.activityId === null || !known(choices?.activities, input.activityId)) errors.activityId = 'Faaliyet alanını seçiniz.';
  // The pair must fit when the dictionary links activities to groups (the API's same refusal).
  else if (!errors.activityGroupId) {
    const groupId = choices?.activities.find((o) => o.id === input.activityId)?.groupId;
    if (groupId !== undefined && groupId !== input.activityGroupId) errors.activityId = ACTIVITY_NOT_IN_GROUP;
  }
  const many = (ids: number[], list: { id: number }[] | undefined) => ids.length > 0 && ids.every((id) => known(list, id));
  if (!many(input.businessModelIds, choices?.businessModels)) errors.businessModelIds = 'En az bir iş modeli seçiniz.';
  if (!many(input.revenueModelIds, choices?.revenueModels)) errors.revenueModelIds = 'En az bir gelir modeli seçiniz.';
  if (!many(input.productTypeIds, choices?.productTypes)) errors.productTypeIds = 'En az bir ürün türü seçiniz.';
  return errors;
}

export function luhn(num: string) {
  const d = num.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return d.length >= 13 && sum % 10 === 0;
}

export function validateCard(c: { holder: string; number: string; expiry: string; cvv: string }, now = new Date()): string | null {
  if (c.holder.trim().length < 3) return 'Kart üzerindeki adı yazınız.';
  if (!luhn(c.number)) return 'Kart numarası geçersizdir.';
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(c.expiry.trim());
  if (!m || +m[1] < 1 || +m[1] > 12) return 'Son kullanma tarihini AA/YY biçiminde yazınız.';
  const end = new Date(2000 + +m[2], +m[1], 1);
  if (end <= now) return 'Kartın son kullanma tarihi geçmiştir.';
  if (!/^\d{3,4}$/.test(c.cvv.trim())) return 'Güvenlik kodu (CVV) 3 veya 4 haneli olmalıdır.';
  return null;
}

export function validTckn(t: string) {
  if (!/^[1-9]\d{10}$/.test(t)) return false;
  const d = t.split('').map(Number);
  const d10 = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return ((d10 + 10) % 10) === d[9] && d11 === d[10];
}

export function passwordStrength(p: string): { score: 0 | 1 | 2 | 3 | 4; label: string; ok: boolean } {
  let score = 0;
  if (p.length >= 10) score++;
  if (/[a-zçğıöşü]/.test(p) && /[A-ZÇĞİÖŞÜ]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/.test(p)) score++;
  const s = (p.length < 10 ? Math.min(score, 1) : score) as 0 | 1 | 2 | 3 | 4;
  const label = ['Çok zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok güçlü'][s];
  return { score: s, label, ok: p.length >= 10 && s >= 3 };
}

export const FUNDING_OPTIONS: FundingSource[] = ['own-abroad', 'own-turkey', 'investor', 'third-party'];

/** "Acme Bulut Bilişim A.Ş." → "Acme Bulut Bilişim": the type suffix is added by the API (and shown by the screens), never typed. */
export function withoutSuffix(title: string): string {
  return title.trim().replace(/\s+(A\.Ş\.|AŞ|Anonim Şirketi)$/i, '').trim();
}

/**
 * The title proposed on the company form (D-1c) from the profile's brand, the same rule as the API's
 * default `trade_name` (decision of 2026-11-26): the brand trimmed; kept as it is when it already ends
 * with "Anonim Şirketi" or "A.Ş." (any case), otherwise brand + " Anonim Şirketi". No proposal (null)
 * when it would fail the title check: the part before the suffix must be 3–160 characters, as for a
 * title chosen on D-1d.
 */
export function proposedTitle(brand: string): string | null {
  const b = brand.trim().replace(/\s+/g, ' ');
  const full = /(^|\s)(Anonim Şirketi|A\.Ş\.)$/i.test(b) ? b : `${b} Anonim Şirketi`;
  const root = withoutSuffix(full);
  return root.length >= 3 && root.length <= 160 && root !== full ? full : null;
}

/**
 * Two titles clash when one (ignoring the type suffix) is a word-prefix of the other,
 * e.g. "Acme Bulut Bilişim" vs registered "Acme Bulut Bilişim Hizmetleri A.Ş.".
 */
export function sameStem(a: string, b: string) {
  const words = (s: string) => withoutSuffix(s).toLocaleLowerCase('tr-TR').split(/\s+/).filter(Boolean);
  const [x, y] = [words(a), words(b)].sort((p, q) => p.length - q.length);
  return x.length >= 2 && x.every((w, i) => w === y[i]);
}

/**
 * Up to three titles to offer on D-1d after a refused one. Suggestions only: the founder may also
 * type their own, and whichever is chosen is checked again. `taken` lists titles known to be
 * registered (the mock's simulated MERSİS); the API gives none, so in HTTP mode nothing is left out.
 */
export function titleAlternatives(root: string, candidate: string, taken: string[] = []): string[] {
  return [`${root} Bulut Yazılım`, `${root}nova Bilişim`, `${root} Cloudline Teknoloji`, `${root} Dijital Çözümler`]
    .filter((t) => t !== candidate && !taken.some((r) => sameStem(r, t)))
    .slice(0, 3);
}
