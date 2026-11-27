import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { ApplicationStore } from '@core/state/application.store';
import { Icon } from '@ui/icon';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { signatureExpired } from '../../e-signature.rules';

/** D-4d — T.C. vatandaşı için imza. One choice between two methods, then start the setup. */
@Component({
  selector: 'app-resident-signature-page',
  imports: [FormError, Icon, StepPage],
  templateUrl: './resident-signature.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResidentSignaturePage {
  protected readonly store = inject(ApplicationStore);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  protected readonly method = signal<'existing' | 'edevlet'>('existing');
  protected readonly resident = computed(() => {
    const a = this.store.app();
    return a ? `${a.founder.firstName} ${a.founder.lastName}` : '';
  });

  /** HTTP mode: the certificate has expired; signing must be done again. */
  protected readonly expired = computed(() => signatureExpired(this.store.app(), this.store.now()));

  /**
   * The chosen e-signature is verified; the founder then confirms the signing on D-4c like
   * everyone else. (Until 2026-11-17 this also started the formation at once.)
   */
  protected signResident() {
    void this.store.signResident(this.method());
  }

  /**
   * HTTP mode: the provider is verifying (or issuing) the resident's e-signature. The API reports
   * `calling` while its e-signature work item is open, though a resident has no call; D-4d shows a
   * waiting state and the page polls until `signed`. Which method was chosen is not in the view.
   * Also while the page gives way after `signed` arrived, so the choice does not flash back for a frame.
   */
  protected readonly verifying = computed(() => {
    const stage = this.store.app()?.stage;
    return stage === 'calling' || (this.store.serverDecides && !!stage && stage !== 'signing');
  });
}
