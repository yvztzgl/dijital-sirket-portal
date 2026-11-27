import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { ApplicationStore } from '@core/state/application.store';
import { Icon } from '@ui/icon';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { founderInitials, signatureExpired } from '../../e-signature.rules';

/** D-4a — Görüntülü görüşme öncesi. Camera preview with device checks, one action: call the operator. */
@Component({
  selector: 'app-call-lobby-page',
  imports: [FormError, Icon, StepPage],
  templateUrl: './call-lobby.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallLobbyPage {
  protected readonly store = inject(ApplicationStore);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  /** D-4a opens on a pre-information view until the founder has accepted the call's terms. */
  protected readonly briefed = computed(() => !!this.store.app()?.callConsentAt);
  protected readonly callConsent = signal(false);
  /**
   * What to do and not to do during the call. Placeholders until the e-signature provider's own
   * rules are known (PROJECT_LOG, 2026-11-17 twenty-sixth entry).
   */
  protected readonly callRules = {
    do: ['Pasaportunuzu yanınızda bulundurunuz.', 'Yüzünüzü açık ve tam görünür tutunuz.', 'Görüşme bitene kadar kameranın karşısında kalınız.'],
    dont: ['Görüşme sırasında başka bir kişiden yardım almayınız.', 'Güneş gözlüğü, şapka veya maske takmayınız.', 'Görüşme tamamlanmadan bağlantıyı kesmeyiniz.'],
  };

  /** HTTP mode: the certificate has expired; signing must be done again. */
  protected readonly expired = computed(() => signatureExpired(this.store.app(), this.store.now()));

  protected acceptCallTerms() {
    void this.store.acceptCallTerms(this.callConsent());
  }

  // Not shared with D-4b: each page starts with both on.
  protected readonly mic = signal(true);
  protected readonly cam = signal(true);
  protected readonly initials = computed(() => founderInitials(this.store.app()));

  protected startCall() {
    if (!this.mic() || !this.cam()) {
      this.store.error.set('Görüşme için kamera ve mikrofon açık olmalıdır.');
      return;
    }
    void this.store.startCall();
  }
}
