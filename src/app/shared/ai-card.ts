import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Assistant } from '../core/assistant';
import { Icon } from './icon';

/** Terminal AI suggestion card: a single recommendation plus the reason behind it. */
@Component({
  selector: 'app-ai-card',
  imports: [Icon],
  templateUrl: './aicard.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiCard {
  readonly cardTitle = input('Fon kaynağını ve telefon numarasını kontrol edin');
  readonly reason = input('Sunumda fon kaynağı dolaylı ifade edilmiş (s. 10).');

  private readonly assistant = inject(Assistant);

  protected ask() {
    void this.assistant.ask(`${this.cardTitle()} — neden?`);
  }

  protected readonly vals = computed(() => ({ title: this.cardTitle(), reason: this.reason() }));
}
