import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, numberAttribute } from '@angular/core';
import { Icon } from './icon';

/** Step names in plain words (2026-11-17): the second and fourth were "Uygunluk" and "e-İmza". */
const LABELS = ['Sunum', 'Kimlik', 'Ödeme', 'İmza', 'Kuruluş'];

/**
 * Five-step wizard progress as thin bars with names: Sunum → Kimlik → Ödeme → İmza → Kuruluş.
 * A step that spans several screens (step 2 has three) shows them inside this one stepper: its bar
 * is cut into `parts` pieces filled up to `part`, and `sub` names the current screen under the
 * step's label. The owner found a second row of steps under this one confusing (2026-11-17).
 */
@Component({
  selector: 'app-stepper',
  imports: [Icon],
  templateUrl: './stepper.html',
  styles: `
    .steps { list-style: none; margin: 0 auto; padding: 0; max-width: 600px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; text-align: left; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    .steps li { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
    .bar { height: 3px; border-radius: 3px; background: var(--bg-D6DEEE); }
    .done .bar, .cur .bar { background: var(--bg-061262); }
    .cur .bar.parts { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; background: none; }
    .bar.parts i { border-radius: 3px; background: var(--bg-D6DEEE); }
    .bar.parts i.on { background: var(--bg-061262); }
    .cap { margin-top: -4px; font: 400 11.5px/15px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); white-space: nowrap; }
    .lbl { display: inline-flex; align-items: center; gap: 4px; font: 400 12.5px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); white-space: nowrap; }
    .done .lbl { font-weight: 500; color: var(--fg-061262); }
    .cur .lbl { font-weight: 600; color: var(--fg-061262); }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  `,
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Stepper {
  readonly current = input(1, { transform: numberAttribute });
  /** Name of the current screen within the current step ("Beyan"). */
  readonly sub = input('');
  /** How many screens the current step has, and which one this is (1-based). 0 = the step is one screen. */
  readonly parts = input(0, { transform: numberAttribute });
  readonly part = input(0, { transform: numberAttribute });
  readonly allDone = input(false, { transform: booleanAttribute });
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly vals = computed(() => {
    const cur = this.current();
    const all = this.allDone();
    const sub = this.sub() ? '· ' + this.sub() : '';
    const steps = LABELS.map((label, i) => {
      const n = i + 1;
      const done = all || n < cur;
      const current = !all && n === cur;
      return {
        n,
        label,
        done,
        current,
        upcoming: !done && !current,
        state: done ? 'Tamamlandı' : current ? 'Şu an' : 'Adım ' + n,
        aria: current ? 'step' : null,
        sub: current ? sub : '',
        cap: current ? this.sub() : '',
        parts: current && this.parts() > 1 ? Array.from({ length: this.parts() }, (_, k) => k < this.part()) : null,
        partText: current && this.parts() > 1 ? `, aşama ${this.part()} / ${this.parts()}` : '',
        labelColor: done || current ? 'var(--fg-061262)' : 'var(--fg-5B6478)',
        line: n < 5,
        flex: n < 5 ? '1 1 0' : '0 0 auto',
        lineColor: done ? 'var(--fg-15803D)' : 'var(--fg-E5E7EB)',
        segColor: done ? 'var(--fg-15803D)' : current ? 'var(--fg-061262)' : 'var(--fg-E5E7EB)',
      };
    });
    const compact = this.compact();
    const c = all ? 5 : cur;
    return { steps, compact, full: !compact, cur: c, curLabel: LABELS[c - 1], curSub: sub };
  });
}
