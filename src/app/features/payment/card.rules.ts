export type CardField = 'holder' | 'number' | 'expiry' | 'cvv';

/**
 * What a card field keeps of what was typed: the number in groups of four (16 digits), the expiry
 * as "AA/YY", the CVV as up to four digits, the holder in Turkish capitals. Checking is `validateCard`'s job.
 */
export function formatCardField(key: CardField, value: string) {
  if (key === 'number') return value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
  if (key === 'expiry') {
    const d = value.replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  }
  if (key === 'cvv') return value.replace(/\D/g, '').slice(0, 4);
  return value.toLocaleUpperCase('tr-TR');
}

/** The brand shown beside the number, from its first digits. */
export function cardBrand(number: string) {
  const n = number.replace(/\D/g, '');
  return n.startsWith('4') ? 'VISA' : /^5[1-5]/.test(n) ? 'MC' : /^9792/.test(n) ? 'TROY' : 'KART';
}
