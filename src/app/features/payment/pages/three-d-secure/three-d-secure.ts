import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Api } from '@core/api/api';
import { DemoServerApi } from '@core/api/demo/demo-server-api';
import { followFlow } from '@core/flow/follow';
import { Inbox } from '@core/services/inbox';
import { ApplicationStore } from '@core/state/application.store';
import { clock, dateTime, maskCard, maskPhone, tl } from '@core/utils/format';
import { DemoCodeHint } from '@demo/demo-code-hint';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { OtpInput } from '@ui/otp-input';
import { feeTotal } from '../../fees';

/** How long the mock's SMS code is valid (the mock refuses it after that). */
const OTP_TTL = 180_000;

/** D-3b — 3D Secure. The bank's code step, shown as the bank's own plain card inside our page. */
@Component({
  selector: 'app-three-d-secure-page',
  imports: [DemoCodeHint, FormError, OtpInput, StepPage],
  templateUrl: './three-d-secure.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreeDSecurePage {
  protected readonly store = inject(ApplicationStore);
  /** Mock mode: the phone, the time left and the SMS are the mock's own. */
  protected readonly demoMode = !!inject(Api).demo;
  private readonly inbox = inject(Inbox);
  /** http-demo build against a demo API: the stand-in bank's fixed code is shown under the boxes. */
  protected readonly demoServer = inject(DemoServerApi);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  protected readonly otp = signal('');
  private readonly payment = computed(() => this.store.app()?.payment);
  protected readonly total = computed(() => tl(feeTotal(this.store.app())));
  /**
   * Empty in HTTP mode after a reload: the API never returns the card's last digits, and the portal
   * keeps them only in memory (HttpApi). D-3b then leaves the card row out.
   */
  protected readonly maskedCard = computed(() => {
    const last4 = this.payment()?.last4;
    return this.demoMode ? maskCard(last4 ?? '0000') : last4 ? maskCard(last4) : '';
  });
  protected readonly maskedPhone = computed(() => maskPhone(this.store.app()?.contact.phone || '+00 0000'));
  protected readonly txTime = computed(() => (this.payment()?.otpSentAt ? dateTime(this.payment()!.otpSentAt!) : ''));
  private readonly otpLeft = computed(() => {
    const sent = this.payment()?.otpSentAt;
    return sent ? Math.max(0, OTP_TTL - (this.store.now() - Date.parse(sent))) : 0;
  });
  protected readonly otpLeftLabel = computed(() => clock(this.otpLeft()));
  /** The mock's SMS, mirrored beside the bank's page. HTTP mode has no code to show: the bank sends it. */
  protected readonly sms = computed(() => (this.demoMode ? (this.inbox.messages().find((m) => m.kind === 'sms') ?? null) : null));
  /** HTTP mode: "Kodu tekrar gönder" was answered (nothing on screen changes otherwise). */
  protected readonly otpResent = signal(false);

  protected confirm(code = this.otp()) {
    if (!/^\d{6}$/.test(code)) {
      this.store.error.set('6 haneli kodu girin.');
      return;
    }
    void this.store.confirm3ds(code);
  }

  protected async resendOtp() {
    this.otp.set('');
    this.otpResent.set(false);
    const ok = await this.store.resendOtp();
    if (!this.demoMode) this.otpResent.set(ok);
  }

  protected cancel3ds() {
    void this.store.cancel3ds();
  }
}
