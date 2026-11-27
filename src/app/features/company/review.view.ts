import { ReviewPatch } from '@core/api/api';
import { REVIEW_INPUTS, REVIEW_ROWS } from '@core/api/http/api-mapper';
import { ReviewKey } from '@core/api/http/api-types';
import { Application, CAPITAL, FUNDING_LABELS, FundingSource, WizardReference } from '@core/models/models';
import { tl0 } from '@core/utils/format';

/** The founder, contact and funding forms of D-1c. */
export type CardId = 'founder' | 'contact' | 'funding';
/** What the pencil on a row of the confirm screen opens. */
export type Editor = 'title' | 'nace' | CardId;

interface EditField {
  key: string;
  label: string;
  value: string;
  options?: { value: string; label: string; hint?: string }[];
  wide?: boolean;
  /** Rich control instead of a plain text box. */
  kind?: 'country' | 'phone' | 'select';
}

/** One row of D-1c: what it is, its value, which editor its pencil opens (none for fixed facts), and its mark. */
export interface ReviewRow {
  key: string;
  label: string;
  value: string;
  edit: Editor | null;
  /** A default from the profile or the account. */
  fromProfile: boolean;
  /** The founder's own value. */
  edited: boolean;
}

/** The NACE codes the API accepts (Api.reference), code → title. */
export function naceTitles(reference: WizardReference | null): Map<string, string> {
  return new Map((reference?.naceCodes ?? []).map((n) => [n.code, n.title]));
}

/** A code the reference does not list (e.g. one of the retired four-digit codes) is shown as the code itself. */
export function naceName(titles: Map<string, string>, code: string): string {
  return titles.get(code) ?? code;
}

/**
 * Every piece of information on the company form as one row: what it is, its value, which editor
 * its pencil opens (none for fixed facts), and whether it is a default from the profile or the
 * account (`profile`) or the founder's own value (`edited`).
 */
export function reviewRows(a: Application | null, fullTitle: string, titles: Map<string, string>): ReviewRow[] {
  if (!a) return [];
  const m = a.marks;
  const name = `${a.founder.firstName} ${a.founder.lastName}`.trim();
  const row = (key: string, label: string, value: string, edit: Editor | null, mark = key): ReviewRow => ({
    key, label, value: value || '—', edit, fromProfile: m[mark] === 'profile', edited: m[mark] === 'edited',
  });
  return [
    row('title', 'Şirket unvanı', fullTitle, 'title'),
    row('name', 'Kurucu', name, 'founder'),
    row('nace', 'Faaliyet', (a.company.nace ?? []).map((c) => naceName(titles, c)).join(', '), 'nace'),
    row('nationality', 'Uyruk', a.founder.nationality, 'founder', 'name'),
    row('type', 'Şirket türü', 'Tek pay sahipli anonim şirket', null),
    row('share', 'Pay sahipliği', `%100, ${name}`, null),
    row('capital', 'Sermaye', tl0(a.company.capital ?? CAPITAL), null),
    row('funding', 'Sermaye kaynağı', FUNDING_LABELS[a.funding], 'funding', 'funding'),
    row('email', 'E-posta', a.contact.email, 'contact'),
    row('phone', 'Telefon', a.contact.phone, 'contact'),
    row('address', 'Adres', [a.contact.address, a.contact.postalCode, a.contact.country].filter((x) => x?.trim()).join(', '), 'contact', 'address'),
    row('office', 'Merkez adresi', 'Terminal İstanbul sanal ofisi, Gebze / Kocaeli', null),
  ];
}

/** A refusal's messages at the review rows (e.g. "Ad eksik." under Kurucu after "Onayla ve devam et"). */
export function rowErrors(fieldErrors: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const row = REVIEW_ROWS[key as ReviewKey];
    if (row && messages[0]) out[row] = out[row] ? `${out[row]} ${messages[0]}` : messages[0];
  }
  return out;
}

/** A refusal's message at an input of the open editor (founder, contact or funding). */
export function inputErrors(fieldErrors: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const input = REVIEW_INPUTS[key as ReviewKey];
    if (input && messages[0]) out[input] = messages[0];
  }
  return out;
}

/** The founder / contact / funding forms, each with its fields and their current values. */
export function editorCards(a: Application | null, funding: { value: string; label: string; hint?: string }[]): { id: CardId; fields: EditField[] }[] {
  if (!a) return [];
  return [
    {
      id: 'founder',
      fields: [
        { key: 'firstName', label: 'Ad', value: a.founder.firstName },
        { key: 'lastName', label: 'Soyad', value: a.founder.lastName },
        { key: 'nationality', label: 'Uyruk', value: a.founder.nationality, wide: true, kind: 'country' },
      ],
    },
    {
      id: 'contact',
      fields: [
        { key: 'email', label: 'E-posta', value: a.contact.email },
        { key: 'phone', label: 'Telefon', value: a.contact.phone, kind: 'phone' },
        { key: 'address', label: 'Adres', value: a.contact.address, wide: true },
        { key: 'postalCode', label: 'Posta kodu', value: a.contact.postalCode },
        { key: 'country', label: 'Ülke', value: a.contact.country, kind: 'country' },
      ],
    },
    { id: 'funding', fields: [{ key: 'funding', label: 'Sermaye nereden geliyor?', value: a.funding, wide: true, kind: 'select', options: funding }] },
  ];
}

/** What an editor's "Kaydet" sends, and the rows it marks as the founder's own. */
export function cardPatch(id: CardId, d: Partial<Record<string, string>>): { patch: ReviewPatch; edited: string[] } {
  if (id === 'founder') return { patch: { founder: { firstName: d['firstName'], lastName: d['lastName'], nationality: d['nationality'] } }, edited: ['name'] };
  if (id === 'contact') {
    return { patch: { contact: { email: d['email'], phone: d['phone'], address: d['address'], postalCode: d['postalCode'], country: d['country'] } }, edited: ['phone', 'address', 'email'] };
  }
  return { patch: { funding: d['funding'] as FundingSource }, edited: ['funding'] };
}

/** "Acme Bulut Bilişim A.Ş." → root "Acme", activity "Bulut Bilişim"; the type suffix is never kept. */
export function titleParts(value: string): { root: string; activity: string } {
  const [root = '', ...rest] = value.replace(/\s+(A\.Ş\.|Anonim Şirketi)$/i, '').trim().split(/\s+/);
  return { root, activity: rest.join(' ') };
}

/** Search results and suggestions, only among the codes the API accepts. */
export function naceChoices(c: Application['company'] | undefined, allowed: Map<string, string>, query: string) {
  if (!c) return [];
  const q = query.trim().toLocaleLowerCase('tr-TR');
  if (q) {
    return [...allowed]
      .filter(([code, name]) => !c.nace.includes(code) && (code.startsWith(q) || name.toLocaleLowerCase('tr-TR').includes(q)))
      .slice(0, 5)
      .map(([code, name]) => ({ code, name, suggested: false }));
  }
  // Without a search: the codes of the activity area stated on the profile.
  return c.suggestedNace
    .filter((x) => allowed.has(x) && !c.nace.includes(x))
    .map((code) => ({ code, name: naceName(allowed, code), suggested: true }))
    .slice(0, 3);
}

/** The brand stated on the profile, with the logo the founder chose on D-1c (mock only). */
export function brandOf(c: Application['company'] | undefined) {
  const name = c?.brand ?? '';
  return { name, logo: c?.logo ?? '', initials: name.slice(0, 1).toLocaleUpperCase('tr-TR') };
}

/** Why a picked logo is refused, or null when it may be used. */
export function logoError(f: File): string | null {
  if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) return 'Logo için PNG, JPEG, SVG veya WebP biçiminde bir görsel seçiniz.';
  // The mock keeps the image in localStorage, so it has to stay small.
  if (f.size > 500 * 1024) return 'Görsel 500 KB’tan büyüktür. Daha küçük bir dosya seçiniz.';
  return null;
}
