import { passwordStrength } from '@core/utils/rules';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A first check on the sign-in screens only; the API decides. */
export const isEmail = (value: string) => EMAIL_RE.test(value);

export const EMAIL_MESSAGE = 'Geçerli bir e-posta adresi girin.';
export const PASSWORD_MESSAGE = 'Şifre en az 10 karakter olmalı ve harf, rakam, sembol içermeli.';

const METER_COLORS = ['var(--fg-B42318)', 'var(--fg-B42318)', 'var(--fg-B54708)', 'var(--fg-15803D)', 'var(--fg-15803D)'];

/**
 * The strength meter under a new password (register, new password): whether the password passes,
 * four bar colours and the line of text under them. Grey bars and the bare rule while it is empty.
 */
export function passwordMeter(password: string) {
  const st = passwordStrength(password);
  const color = METER_COLORS[st.score];
  return {
    ok: st.ok,
    strengthBars: [0, 1, 2, 3].map((i) => (password && i < Math.max(1, st.score) ? color : 'var(--bg-E5E7EB)')),
    strengthText: password ? `${st.ok ? '✓ ' : ''}${st.label} · en az 10 karakter, harf, rakam ve sembol` : 'En az 10 karakter, harf, rakam ve sembol',
    strengthColor: password ? color : 'var(--fg-5B6478)',
  };
}
