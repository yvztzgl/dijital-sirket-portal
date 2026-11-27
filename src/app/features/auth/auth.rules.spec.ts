import { EMAIL_MESSAGE, PASSWORD_MESSAGE, isEmail, passwordMeter } from './auth.rules';

const GREY = 'var(--bg-E5E7EB)';
const RED = 'var(--fg-B42318)';
const AMBER = 'var(--fg-B54708)';
const GREEN = 'var(--fg-15803D)';
const RULE = 'en az 10 karakter, harf, rakam ve sembol';

describe('auth rules', () => {
  it('isEmail wants something@something.tld without spaces', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('john.doe@acme.com')).toBe(true);
    expect(isEmail('')).toBe(false);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a b@c.de')).toBe(false);
    expect(isEmail('@c.de')).toBe(false);
  });

  it('keeps the on-screen messages', () => {
    expect(EMAIL_MESSAGE).toBe('Geçerli bir e-posta adresi girin.');
    expect(PASSWORD_MESSAGE).toBe('Şifre en az 10 karakter olmalı ve harf, rakam, sembol içermeli.');
  });

  it('passwordMeter: empty shows grey bars and the bare rule', () => {
    expect(passwordMeter('')).toEqual({
      ok: false,
      strengthBars: [GREY, GREY, GREY, GREY],
      strengthText: 'En az 10 karakter, harf, rakam ve sembol',
      strengthColor: 'var(--fg-5B6478)',
    });
  });

  it('passwordMeter: a weak password lights one red bar', () => {
    expect(passwordMeter('abc')).toEqual({ ok: false, strengthBars: [RED, GREY, GREY, GREY], strengthText: `Çok zayıf · ${RULE}`, strengthColor: RED });
  });

  it('passwordMeter: a middling password lights two amber bars', () => {
    expect(passwordMeter('abcdefghij1')).toEqual({ ok: false, strengthBars: [AMBER, AMBER, GREY, GREY], strengthText: `Orta · ${RULE}`, strengthColor: AMBER });
  });

  it('passwordMeter: a password that passes gets the tick', () => {
    expect(passwordMeter('abcdefghi-1')).toEqual({ ok: true, strengthBars: [GREEN, GREEN, GREEN, GREY], strengthText: `✓ Güçlü · ${RULE}`, strengthColor: GREEN });
    expect(passwordMeter('Strong-Pass-2026!')).toEqual({ ok: true, strengthBars: [GREEN, GREEN, GREEN, GREEN], strengthText: `✓ Çok güçlü · ${RULE}`, strengthColor: GREEN });
  });
});
