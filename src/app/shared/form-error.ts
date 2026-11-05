import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Icon } from './icon';
import { ApplicationStore } from '../core/application.store';

/** Shows the last failed action's message (or a local validation message) in the portal's danger style. */
@Component({
  selector: 'app-form-error',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:contents' },
  template: `
    @let msg = message() || store.error();
    @if (msg) {
      <p role="alert" style="margin:0;display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border-radius:9px;background:var(--bg-FEF3F2);border:1px solid var(--bd-FBD5D1);font:500 13px/19px 'IBM Plex Sans',sans-serif;color:var(--fg-912018)">
        <app-icon name="alert" size="18px" style="color:var(--fg-B42318)" />{{ msg }}
      </p>
    }
  `,
})
export class FormError {
  /** Local validation message; falls back to the store's last action error. */
  readonly message = input<string | null>(null);
  protected readonly store = inject(ApplicationStore);
}
