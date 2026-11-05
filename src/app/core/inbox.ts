import { Injectable, signal } from '@angular/core';

export interface InboxMessage {
  id: number;
  kind: 'mail' | 'sms';
  from: string;
  title: string;
  body: string;
  code?: string;
  at: number;
}

/**
 * Simulated e-mail / SMS delivery. The mock backend "sends" verification codes here and the shell
 * shows them as toasts, so flows that need a code work without a real mail or SMS provider.
 */
@Injectable({ providedIn: 'root' })
export class Inbox {
  readonly messages = signal<InboxMessage[]>([]);
  private seq = 0;

  send(m: Omit<InboxMessage, 'id' | 'at'>) {
    const msg = { ...m, id: ++this.seq, at: Date.now() };
    this.messages.update((list) => [msg, ...list].slice(0, 4));
    return msg;
  }

  dismiss(id: number) {
    this.messages.update((list) => list.filter((m) => m.id !== id));
  }

  /** Latest code sent through a channel (used by screens that mirror the SMS on-screen). */
  latest(kind: InboxMessage['kind']) {
    return this.messages().find((m) => m.kind === kind);
  }
}
