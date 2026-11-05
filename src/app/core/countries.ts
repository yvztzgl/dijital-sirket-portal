import { CountryCode, getCountries, getCountryCallingCode } from 'libphonenumber-js';

export interface Country {
  iso: CountryCode;
  /** Turkish display name, e.g. "Almanya" — the value stored on the application. */
  name: string;
  /** Calling code without "+", e.g. "49". */
  dial: string;
}

const names = new Intl.DisplayNames(['tr'], { type: 'region' });
/** Territories libphonenumber knows that have no flag in flag-icons. */
const NO_FLAG = new Set(['AC', 'TA']);

/** Every country with a phone numbering plan, sorted by Turkish name. */
export const COUNTRIES: Country[] = getCountries()
  .filter((iso) => !NO_FLAG.has(iso))
  .map((iso) => ({ iso, name: names.of(iso) ?? iso, dial: getCountryCallingCode(iso) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');

export function countryByName(name: string | null | undefined): Country | undefined {
  if (!name?.trim()) return undefined;
  const n = fold(name.trim());
  return COUNTRIES.find((c) => fold(c.name) === n || c.iso.toLowerCase() === n);
}

export function countryByIso(iso: string | null | undefined): Country | undefined {
  return COUNTRIES.find((c) => c.iso === iso);
}

/** Founders most often come from these; they win ties ("turk" → Türkiye before Turks ve Caicos). */
const COMMON = ['TR', 'DE', 'GB', 'US', 'NL', 'FR', 'AZ', 'RU', 'UA', 'IR', 'IQ', 'SA', 'AE', 'KZ', 'UZ', 'IT', 'ES', 'AT', 'CH', 'BE'];
const rank = (iso: string) => {
  const i = COMMON.indexOf(iso);
  return i < 0 ? COMMON.length : i;
};

/** Matches name (accent/case-insensitive), ISO code or calling code ("+49", "49"). */
export function searchCountries(q: string): Country[] {
  const s = fold(q.trim()).replace(/^\+/, '');
  if (!s) return COUNTRIES;
  const starts = COUNTRIES.filter((c) => fold(c.name).startsWith(s) || c.iso.toLowerCase() === s || c.dial === s).sort(
    (a, b) => rank(a.iso) - rank(b.iso),
  );
  const contains = COUNTRIES.filter((c) => !starts.includes(c) && (fold(c.name).includes(s) || c.dial.startsWith(s)));
  return [...starts, ...contains];
}

export const flagUrl = (iso: string) => `/assets/flags/4x3/${iso.toLowerCase()}.svg`;
