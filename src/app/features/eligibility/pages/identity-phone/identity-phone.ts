import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApplicationStore } from '@core/state/application.store';
import { FormError } from '@layout/form-error';
import { Icon } from '@ui/icon';
import { cameraView, KYC_RULES } from '../../identity.view';

/**
 * D-2a-m — the identity step on the founder's phone, opened from the QR code on D-2a.
 * It is a page for this step only: no header menu, no stepper, no Terminal AI, and it knows the
 * application only through its link (`store.phone`), never through a session. It shows nothing
 * about the founder or the company. The computer's page follows the check and moves on by itself.
 *
 * The link is `/eligibility/phone#<token>`. The token is in the fragment, which browsers do not send
 * to servers, so it appears in no request line and no server log; the API gets it in a header
 * (X-DSP-Phone-Token). The page reads it once and removes it from the address bar and the history
 * entry, so it is not left on screen or in the browser's history. It is kept in memory only.
 *
 * The camera check is the portal's own animation (there is no identity vendor yet); when it ends the
 * page reports it to the server (HTTP: `POST /api/phone/complete`) and waits for the decision,
 * asking for the link's state no faster than the API's rate limit allows (ApplicationStore.PHONE_POLL_MS).
 */
@Component({
  selector: 'app-identity-phone-page',
  imports: [FormError, Icon],
  templateUrl: './identity-phone.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdentityPhonePage {
  protected readonly store = inject(ApplicationStore);
  protected readonly rules = KYC_RULES;
  protected readonly consent = signal(false);

  constructor() {
    this.store.clearError();
    const token = inject(ActivatedRoute).snapshot.fragment ?? '';
    inject(Location).replaceState('/eligibility/phone');
    void this.store.openPhoneLink(token);
  }

  protected readonly view = computed(() => {
    const s = this.store.phone();
    if (!s) return { state: 'loading' as const, cam: null };
    // A code that runs out while this page is open.
    if (s.state === 'ready' && this.store.now() > Date.parse(s.expiresAt)) return { state: 'expired' as const, cam: null };
    const check = this.store.phoneCheck();
    return { state: s.state, cam: check ? cameraView(check, this.store.serverDecides) : null };
  });

  protected start() {
    void this.store.startByPhone(this.consent());
  }
}
