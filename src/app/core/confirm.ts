import { Injectable, signal } from '@angular/core';

/** What the confirmation dialog asks. Wording follows the portal's rule: formal, short, whole sentences. */
export interface ConfirmOptions {
  /** The question, e.g. "Görüşme sonlandırılsın mı?" */
  title: string;
  /** One or two sentences on what happens if the founder confirms. */
  message: string;
  /** Optional list of what is affected, shown under a short heading ("Silinecekler"). */
  details?: { label: string; items: string[] };
  /** Label of the confirming button: the action itself ("Verileri sil"), never "Tamam". */
  confirm: string;
  /** Label of the button that keeps things as they are. */
  cancel?: string;
  /** `danger` for what cannot be undone; focus then starts on the cancel button. */
  tone?: 'danger' | 'warn' | 'info';
  /** Icon name from `<app-icon>`; defaults by tone. */
  icon?: string;
}

/**
 * The portal's own confirmation dialog, in place of the browser's `confirm()`.
 * `await confirm.ask({...})` resolves true when the founder confirms, false when they cancel,
 * press Esc or click outside. It is rendered once by the app shell (`ConfirmDialog`).
 */
@Injectable({ providedIn: 'root' })
export class Confirm {
  /** The question on screen, or null when the dialog is closed. */
  readonly current = signal<ConfirmOptions | null>(null);
  private resolve: ((ok: boolean) => void) | null = null;

  ask(options: ConfirmOptions): Promise<boolean> {
    this.answer(false); // a question still open is cancelled, never left hanging
    this.current.set(options);
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /** Called by the dialog once its closing motion has ended. */
  answer(ok: boolean) {
    const resolve = this.resolve;
    this.resolve = null;
    this.current.set(null);
    resolve?.(ok);
  }
}
