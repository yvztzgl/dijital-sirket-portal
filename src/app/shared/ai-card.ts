import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { Assistant } from '../core/assistant';
import { Bot } from './bot';
import { Icon } from './icon';

/**
 * Terminal AI suggestion card: one recommendation, the reason behind it, and ways to answer it.
 *
 * It is Terminal AI's voice in the reading column, so it is made to be noticed: it has its own
 * look (gradient edge, Terminal AI's moving face from `bot.ts`), the message arrives (a short "thinking" beat, then the
 * title is written out) every time it changes, and the founder can reply on the spot with the
 * screen's suggested questions. Replies are answered in the side panel's chat, which lights up.
 */
@Component({
  selector: 'app-ai-card',
  imports: [Bot, Icon],
  templateUrl: './aicard.html',
  styles: `
    :host { display: block; }
    .card {
      position: relative; overflow: hidden; display: flex; align-items: flex-start; gap: 14px; padding: 14px 16px 14px 14px;
      border: 1.5px solid transparent; border-radius: 14px;
      background:
        linear-gradient(var(--bg-F7F9FE), var(--bg-F7F9FE)) padding-box,
        linear-gradient(115deg, var(--bg-061262), var(--fg-9DB6FF) 45%, var(--bg-0C217E)) border-box;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
    }
    /* One light sweep across the card each time a message arrives. */
    .card.arriving::after {
      content: ''; position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(100deg, transparent 30%, rgba(157, 182, 255, .28) 50%, transparent 70%);
      background-size: 250% 100%; animation: sweep 1.3s ease-out both;
    }

    /* The face stands on its own, level with the label and the title. */
    .avatar { margin-top: 5px; }

    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .label { display: flex; align-items: center; gap: 8px; font: 600 10.5px/14px 'IBM Plex Sans', sans-serif; letter-spacing: .1em; color: var(--fg-061262); }
    .dots { display: inline-flex; gap: 3px; }
    .dots i { width: 4px; height: 4px; border-radius: 50%; background: var(--bg-061262); opacity: .35; animation: dot 1s ease-in-out infinite; }
    .dots i:nth-child(2) { animation-delay: .15s; }
    .dots i:nth-child(3) { animation-delay: .3s; }
    .title { font: 600 15.5px/22px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); text-wrap: pretty; }
    /* The words not written yet keep their space, so the card never changes height. */
    .rest { visibility: hidden; }
    .caret {
      display: inline-block; width: 7px; height: 14px; margin-left: 1px; vertical-align: -2px; border-radius: 2px;
      background: var(--bg-061262); animation: caret .9s steps(1) infinite;
    }
    .reason { font: 400 13px/19px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); text-wrap: pretty; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .reason, .chips { transition: opacity .35s ease, transform .35s ease; }
    .card.arriving :is(.reason, .chips) { opacity: 0; transform: translateY(3px); }
    .chips { transition-delay: .12s; }

    .chip {
      display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--bd-C7D5F7); background: var(--bg-FFFFFF);
      color: var(--fg-061262); border-radius: 999px; padding: 6px 12px; font: 500 12.5px/16px 'IBM Plex Sans', sans-serif;
      cursor: pointer; transition: background .15s, border-color .15s, transform .15s;
    }
    .chip:hover { background: var(--bg-EFF4FF); border-color: var(--bd-061262); }
    .chip:active { transform: scale(.97); }
    .chip:disabled { opacity: .55; cursor: default; }
    .chip.own { border-style: dashed; background: transparent; color: var(--fg-3B4660); }

    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

    @keyframes sweep { from { background-position: 120% 0; } to { background-position: -60% 0; } }
    @keyframes dot { 0%, 100% { transform: translateY(0); opacity: .35; } 40% { transform: translateY(-3px); opacity: 1; } }
    @keyframes caret { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .dots i, .caret, .card.arriving::after { animation: none !important; }
      .reason, .chips { transition: none; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiCard {
  readonly cardTitle = input('Fon kaynağını ve telefon numarasını kontrol edin');
  readonly reason = input('Sunumda fon kaynağı dolaylı ifade edilmiş (s. 10).');

  protected readonly assistant = inject(Assistant);

  /** thinking: dots beside the label · typing: the title is being written out · done: at rest. */
  protected readonly phase = signal<'thinking' | 'typing' | 'done'>('done');
  /** How many words of the title are written so far. */
  private readonly shown = signal(Number.MAX_SAFE_INTEGER);

  constructor() {
    // The card shows the screen's suggested questions, so the side panel hides its own copy.
    this.assistant.cards.update((n) => n + 1);
    inject(DestroyRef).onDestroy(() => this.assistant.cards.update((n) => n - 1));

    // Every new message arrives: a short thinking beat, then the title word by word.
    effect((onCleanup) => {
      const words = split(this.cardTitle()).length;
      this.reason();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.shown.set(words);
        this.phase.set('done');
        return;
      }
      this.shown.set(0);
      this.phase.set('thinking');
      let ticker: ReturnType<typeof setInterval> | undefined;
      const start = setTimeout(() => {
        this.phase.set('typing');
        ticker = setInterval(() => {
          this.shown.update((n) => n + 1);
          if (this.shown() >= words) {
            clearInterval(ticker);
            this.phase.set('done');
          }
        }, 42);
      }, 650);
      onCleanup(() => {
        clearTimeout(start);
        clearInterval(ticker);
      });
    });
  }

  protected why() {
    void this.assistant.ask(`${this.cardTitle()} — neden?`);
  }

  protected ask(question: string) {
    void this.assistant.ask(question);
  }

  protected readonly vals = computed(() => {
    const words = split(this.cardTitle());
    const n = Math.min(this.shown(), words.length);
    return {
      title: this.cardTitle(),
      reason: this.reason(),
      typed: words.slice(0, n).join(''),
      rest: words.slice(n).join(''),
      phase: this.phase(),
      chips: this.assistant.suggestions().slice(0, 2),
      busy: this.assistant.thinking(),
    };
  });
}

/** Words with their trailing space, so joining them gives the text back. */
const split = (text: string) => text.match(/\S+\s*/g) ?? [text];
