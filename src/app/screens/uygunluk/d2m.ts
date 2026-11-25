import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApplicationStore } from '../../core/application.store';
import { FormError } from '../../shared/form-error';
import { Icon } from '../../shared/icon';
import { cameraView, KYC_RULES } from '../data/uygunluk.data';

/**
 * D-2a-m — the identity step on the founder's phone, opened from the QR code on D-2a.
 * It is a page for this step only: no header menu, no stepper, no Terminal AI, and it knows the
 * application only through its link (`store.phone`), never through a session. It shows nothing
 * about the founder or the company. The computer's page follows the check and moves on by itself.
 */
@Component({
  selector: 'app-screen-d2m',
  imports: [FormError, Icon],
  templateUrl: './d2m.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD2m {
  protected readonly store = inject(ApplicationStore);
  protected readonly rules = KYC_RULES;
  protected readonly consent = signal(false);

  constructor() {
    this.store.clearError();
    void this.store.openPhoneLink(inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '');
  }

  protected readonly view = computed(() => {
    const s = this.store.phone();
    if (!s) return { state: 'loading' as const, cam: null };
    // A code that runs out while this page is open.
    if (s.state === 'ready' && this.store.now() > Date.parse(s.expiresAt)) return { state: 'expired' as const, cam: null };
    const check = this.store.phoneCheck();
    return { state: s.state, cam: check ? cameraView(check) : null };
  });

  protected start() {
    void this.store.startByPhone(this.consent());
  }
}
