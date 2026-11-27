import { computed, inject, signal } from '@angular/core';
import { Clock } from '@core/services/clock';
import { clock } from '@core/utils/format';

const RESEND_WAIT = 60_000;

/**
 * The 60-second wait before a code (D-0c) or a reset link (D-0d) may be sent again. Call it in an
 * injection context (a field initialiser); it runs from the moment the screen opens.
 */
export function resendTimer() {
  const now = inject(Clock).now;
  // Set from Date.now(), not the Clock, as before: the Clock's value can be up to 200 ms old.
  const at = signal(Date.now() + RESEND_WAIT);
  const left = computed(() => Math.max(0, at() - now()));
  return {
    /** When the last code or link was sent (+60 s); also tells the demo hint to read again. */
    at: at.asReadonly(),
    /** Milliseconds still to wait. */
    left,
    /** `left` as mm:ss. */
    label: computed(() => clock(left())),
    restart: () => at.set(Date.now() + RESEND_WAIT),
  };
}
