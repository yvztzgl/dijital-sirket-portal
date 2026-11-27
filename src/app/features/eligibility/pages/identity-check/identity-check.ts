import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Api } from '@core/api/api';
import { followFlow } from '@core/flow/follow';
import { Assistant } from '@core/services/assistant';
import { ApplicationStore } from '@core/state/application.store';
import { clock } from '@core/utils/format';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { Icon } from '@ui/icon';
import { QrCode } from '@ui/qr-code';
import { cameraView, KYC_RULES, mrzName } from '../../identity.view';

/**
 * D-2a — Kimlik doğrulama. Opens on a pre-information view (what to have ready, do's and don'ts,
 * the consent tick, "Doğrulamayı başlat", or "Telefonla devam et" for a QR code that opens the step on
 * the founder's phone: see d2m); after that the camera area follows the automatic check: passport, then
 * face, then waiting.
 */
@Component({
  selector: 'app-identity-check-page',
  imports: [FormError, Icon, QrCode, StepPage],
  templateUrl: './identity-check.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdentityCheckPage {
  protected readonly store = inject(ApplicationStore);
  /** Mock mode only: the demo link that opens the phone page in a tab. */
  protected readonly demoMode = !!inject(Api).demo;
  private readonly assistant = inject(Assistant);

  constructor() {
    this.store.clearError();
    followFlow();
    // A consent is for one check. Once a check is running (started here or on the phone) the tick
    // is cleared, so that after a failed check the founder has to give it again for the next one.
    effect(() => {
      if (this.store.identity()) this.consent.set(false);
    });
  }

  /**
   * D-2a in the Odak layout. Null while the founder is still on the pre-information view; once
   * started the camera check runs by itself (see timeline.identityView) and this says what the
   * camera area shows at each moment. When it ends the application moves to the declaration screen.
   */
  protected readonly kyc = computed(() => {
    const e = this.store.identity();
    const f = this.store.app()?.founder;
    if (!e) return null;
    const cam = cameraView(e, this.store.serverDecides);
    const phone = this.store.app()?.eligibility?.via === 'phone';
    return {
      ...cam,
      /** The check was started from the phone page: this screen only follows it. */
      phone,
      title: phone && !e.identityDone ? 'Doğrulama telefonunuzda sürüyor' : cam.title,
      lead: phone
        ? 'Pasaportunuz ve yüzünüz telefonunuzun kamerasıyla doğrulanır. Bu sayfa kendiliğinden ilerler.'
        : 'Kimliğiniz, pasaportunuz ve kameranız aracılığıyla doğrulanır. Doğrulama tamamlanana kadar kameranın karşısında kalınız.',
      mrz: mrzName(f?.firstName, f?.lastName),
    };
  });

  /** The consent tick, for one check only (see the constructor). The button stays off until it is set; the API checks it too. */
  protected readonly consent = signal(false);

  /**
   * HTTP mode: the last camera check ended without a verified identity (the API's
   * `eligibility.identityError`). The pre-information view says so and offers to start again; after
   * the second failure the API moves the application to manual review.
   */
  protected readonly identityFailed = computed(() => !this.kyc() && this.store.app()?.eligibility?.identityError === 'identity_failed');

  protected readonly rules = KYC_RULES;

  /** "Telefonla devam et": the QR view is showing instead of the pre-information. */
  protected readonly phoneMode = signal(false);
  /**
   * The link behind the QR code, with the time it has left. The token is in the fragment (after
   * `#`): browsers do not send it to servers, so it is neither in request lines nor in server logs.
   */
  protected readonly phoneLink = computed(() => {
    const l = this.store.app()?.phoneLink;
    if (!l) return null;
    const left = Date.parse(l.expiresAt) - this.store.now();
    const path = `/eligibility/phone#${l.token}`;
    return { url: location.origin + path, path, expired: left <= 0, left: clock(left) };
  });

  protected usePhone() {
    this.phoneMode.set(true);
    const l = this.phoneLink();
    if (!l || l.expired) void this.store.createPhoneLink();
  }

  protected renewPhoneLink() {
    void this.store.createPhoneLink();
  }

  protected useComputer() {
    this.store.clearError();
    this.phoneMode.set(false);
    this.store.leavePhoneLink();
  }

  /** "Doğrulamayı başlat". Until then `kyc()` is null and nothing runs. */
  protected startCheck() {
    void this.store.startEligibility(this.consent());
  }

  /** "Kamera çalışmıyor": Terminal AI answers in the side panel. */
  protected askCamera() {
    void this.assistant.ask('Kamera çalışmıyorsa ne yapılır?');
  }
}
