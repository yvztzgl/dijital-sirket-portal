import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, numberAttribute } from '@angular/core';
import { Icon } from './icon';

const LABELS = ['Sunum', 'Uygunluk', 'Ödeme', 'e-İmza', 'Kuruluş'];

/** Five-step wizard progress: Sunum → Uygunluk → Ödeme → e-İmza → Kuruluş. */
@Component({
  selector: 'app-stepper',
  imports: [Icon],
  templateUrl: './stepper.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Stepper {
  readonly current = input(1, { transform: numberAttribute });
  readonly sub = input('');
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
