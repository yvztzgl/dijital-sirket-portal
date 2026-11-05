/** Turkish formatting helpers (numbers, money, dates) and masking. */

const num2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 12750 → "12.750,00 TL" */
export const tl = (n: number) => `${num2.format(n)} TL`;
/** 250000 → "250.000 TL" */
export const tl0 = (n: number) => `${num0.format(n)} TL`;
/** 98.4 → "98,4" */
export const dec1 = (n: number) => num1.format(n);

const pad = (n: number) => String(n).padStart(2, '0');

/** "14:02:11" */
export const time = (iso: string | number | Date) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
/** "14:02" */
export const hm = (iso: string | number | Date) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** "22.10.2026" */
export const date = (iso: string | number | Date) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
/** "22.10.2026 14:11" */
export const dateTime = (iso: string | number | Date) => `${date(iso)} ${hm(iso)}`;

/** Milliseconds → "02:14" (mm:ss) or "23:58" (hh:mm when `hours`). */
export const clock = (ms: number, hours = false) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return hours ? `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};

/** "+44 7700 900123" → "+44 ••• ••• 0123" */
export const maskPhone = (p: string) => {
  const digits = p.replace(/\D/g, '');
  const cc = p.trim().startsWith('+') ? p.trim().split(/\s/)[0] : '';
  return `${cc ? cc + ' ' : ''}••• ••• ${digits.slice(-4)}`;
};

/** "1234 5678 9012 4242" → "**** **** **** 4242" */
export const maskCard = (last4: string) => `**** **** **** ${last4}`;

export const initials = (first: string, last: string) =>
  ((first.trim()[0] ?? '') + (last.trim()[0] ?? '')).toLocaleUpperCase('tr-TR');

/** Title-cases a Turkish-aware string ("acme cloud" → "Acme Cloud"). */
export const titleCase = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toLocaleUpperCase('tr-TR') + w.slice(1))
    .join(' ');
