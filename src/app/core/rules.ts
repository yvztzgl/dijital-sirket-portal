import { FundingSource } from './models';

/**
 * Checks and constants the screens use to help the founder before anything is sent. They are pure
 * and belong to neither API implementation, so a build on the HTTP client does not pull in the
 * mock to get them. The server repeats every check; these only give early feedback.
 * (Moved here unchanged from mock-api.ts, which still re-exports them.)
 */

/** Largest address document the declaration screen takes. */
export const ADDRESS_DOC_MAX = 10 * 1024 * 1024;

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
