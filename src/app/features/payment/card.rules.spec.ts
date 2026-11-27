import { cardBrand, formatCardField } from './card.rules';

describe('card rules', () => {
  it('formatCardField: the number in fours, at most 16 digits', () => {
    expect(formatCardField('number', '4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardField('number', '4242-4242 42x')).toBe('4242 4242 42');
    expect(formatCardField('number', '4242')).toBe('4242');
    expect(formatCardField('number', '42424242424242429')).toBe('4242 4242 4242 4242');
  });

  it('formatCardField: the expiry as AA/YY, the CVV as up to four digits, the holder in Turkish capitals', () => {
    expect(formatCardField('expiry', '12')).toBe('12');
    expect(formatCardField('expiry', '1230')).toBe('12/30');
    expect(formatCardField('expiry', '12/3099')).toBe('12/30');
    expect(formatCardField('cvv', '12a345')).toBe('1234');
    expect(formatCardField('holder', 'ışık ince')).toBe('IŞIK İNCE');
  });

  it('cardBrand: Visa, Mastercard, Troy, otherwise a card', () => {
    expect(cardBrand('4111')).toBe('VISA');
    expect(cardBrand('5 1')).toBe('MC');
    expect(cardBrand('5600')).toBe('KART');
    expect(cardBrand('9792 1')).toBe('TROY');
    expect(cardBrand('')).toBe('KART');
  });
});
