import { inject, Injectable, signal } from '@angular/core';
import { MockApi } from './mock-api';

export interface ChatMessage {
  me: boolean;
  text: string;
  /** True while the reply is still being written out. */
  streaming?: boolean;
}

/** What Terminal AI shows it is doing while it prepares an answer. */
const STAGES = ['Sorunuzu okuyorum', 'Başvurunuzu kontrol ediyorum', 'Yanıtı hazırlıyorum'];

/** Terminal AI conversation shared by the side panel and the AI suggestion cards. */
@Injectable({ providedIn: 'root' })
export class Assistant {
  private readonly api = inject(MockApi);

  readonly thread = signal<ChatMessage[]>([]);
  /** Busy from the question until the reply has finished writing out. */
  readonly thinking = signal(false);
  /** Current thinking stage label, or null once the reply starts streaming. */
  readonly status = signal<string | null>(null);
  /** Bumps whenever something asks the assistant, so the side panel can switch to its AI tab. */
  readonly focus = signal(0);

  async ask(question: string) {
    const q = question.trim();
    if (!q || this.thinking()) return;
    this.focus.update((n) => n + 1);
    this.thread.update((t) => [...t, { me: true, text: q }]);
    this.thinking.set(true);

    let stage = 0;
    this.status.set(STAGES[0]);
    const ticker = setInterval(() => this.status.set(STAGES[Math.min(++stage, STAGES.length - 1)]), 650);
    try {
      const answer = await this.api.ask(q);
      clearInterval(ticker);
      this.status.set(null);
      await this.stream(answer);
    } finally {
      clearInterval(ticker);
      this.status.set(null);
      this.thinking.set(false);
    }
  }

  clear() {
    this.thread.set([]);
  }

  /** Writes the reply out a few words at a time, like a model generating it. */
  private async stream(text: string) {
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.thread.update((t) => [...t, { me: false, text: instant ? text : '', streaming: !instant }]);
    if (instant) return;
    const tokens = text.match(/\S+\s*/g) ?? [text];
    let shown = '';
    for (let i = 0; i < tokens.length; i++) {
      shown += tokens[i];
      const done = i === tokens.length - 1;
      this.updateLast({ me: false, text: shown, streaming: !done });
      // Slight variation and a pause after sentence ends reads as natural generation.
      const pause = /[.!?…:]\s*$/.test(tokens[i]) ? 140 : 0;
      if (!done) await sleep(28 + Math.random() * 34 + pause);
    }
  }

  private updateLast(m: ChatMessage) {
    this.thread.update((t) => [...t.slice(0, -1), m]);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
