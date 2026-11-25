import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Assistant } from '../../core/assistant';
import { ApplicationStore } from '../../core/application.store';
import { followFlow } from '../../core/follow';
import { Icon } from '../../shared/icon';
import { StepPage } from '../../shared/step-page';

/**
 * The closed state (stage `closed`, HTTP mode only). Staff rejected the application under manual
 * review and the API closed it: its read now answers 404 `no_application`, without a reason (the API
 * does not tell the founder why). The portal says so plainly and offers nothing that would start a
 * new application; only signing out. (Signing in again does create a new application, because the
 * API cannot tell "never had one" from "closed": recorded as an API gap in docs/api-client.md.)
 */
@Component({
  selector: 'app-screen-closed',
  imports: [Icon, StepPage],
  template: `
    <app-step-page [step]="2" ctx="manual" label="Başvuru kapatıldı">
      <div class="wz-head">
        <span class="wz-chip wz-chip--warn"><app-icon name="alert" size="13px" [stroke]="2.2" />Başvuru kapatıldı</span>
        <h1 class="wz-h1">Başvurunuz kapatıldı</h1>
        <p class="wz-lead">Başvurunuz, yapılan inceleme sonucunda kapatılmıştır. Bu başvuru için yapabileceğiniz başka bir işlem bulunmamaktadır.</p>
      </div>
      <div class="wz-actions">
        <button type="button" class="wz-btn wz-btn--ghost" (click)="logout()">Çıkış yap</button>
      </div>
    </app-step-page>
  `,
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenClosed {
  private readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);
  private readonly assistant = inject(Assistant);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  protected logout() {
    this.assistant.clear();
    void this.store.logout().then(() => this.router.navigateByUrl('/login'));
  }
}
