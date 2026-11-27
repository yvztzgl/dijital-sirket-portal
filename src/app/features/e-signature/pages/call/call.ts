import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { Confirm } from '@core/services/confirm';
import { ApplicationStore } from '@core/state/application.store';
import { clock } from '@core/utils/format';
import { Icon } from '@ui/icon';
import { StepPage } from '@layout/step-page';
import { founderInitials } from '../../e-signature.rules';

/** What the call has just established about the founder, shown on their own picture (the latest one only). */
const SELF_STATUS = ['', 'Pasaport algılandı', 'Yüz eşleşti', 'Onayınız alındı', 'Tutanak imzalandı', 'E-imza düzenlendi'];

/** The operator's sentence at each step of the scripted call (the sixth one closes it). */
const captionsFor = (firstName: string | undefined) => [
  `Merhaba ${firstName}, ben Elif. Pasaportunuzun fotoğraflı sayfasını kameraya gösterir misiniz?`,
  'Teşekkürler, pasaportunuz okundu. Şimdi yüzünüzü kameraya yaklaştırın, eşleşmeyi kontrol ediyorum.',
  'Şirket kuruluş belgelerinizin e-imzayla imzalanmasını onaylıyor musunuz? Lütfen “onaylıyorum” deyin.',
  'Onayınız kaydedildi. Görüşme tutanağını imzalıyorum.',
  'Günlük e-imzanız düzenleniyor, birazdan hazır olacak.',
  'Görüşme tamamlandı. İyi günler dilerim.',
];

/** D-4b — Görüşme sürüyor. Operator and founder side by side, the operator's words, the call's five steps. */
@Component({
  selector: 'app-call-page',
  imports: [Icon, StepPage],
  templateUrl: './call.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallPage {
  private readonly store = inject(ApplicationStore);
  private readonly confirmDialog = inject(Confirm);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  /**
   * HTTP mode: the scripted call has ended and been reported (or the portal cannot tell whether a call
   * is open: no call start in the timeline); the provider is issuing the certificate and the page polls.
   * Also while the page gives way after `signed` arrived, so the call does not flash back for a frame.
   */
  protected readonly issuing = computed(() => {
    const a = this.store.app();
    return this.store.serverDecides && (a?.stage !== 'calling' || !a.call || !!a.call.completed);
  });

  protected readonly callTimer = computed(() => clock(this.store.call()?.elapsedMs ?? 0));
  protected readonly captions = computed(() => {
    const c = this.store.call();
    if (!c) return { prev: '', cur: '' };
    const all = captionsFor(this.store.app()?.founder.firstName);
    return { prev: c.step > 0 ? all[c.step - 1] : '', cur: all[c.step] };
  });
  protected readonly selfStatus = computed(() => SELF_STATUS[Math.min(this.store.call()?.step ?? 0, 5)]);

  // Not shared with D-4a: the call starts with both on whatever the lobby had.
  protected readonly mic = signal(true);
  protected readonly cam = signal(true);
  protected readonly initials = computed(() => founderInitials(this.store.app()));

  protected async endCall() {
    const ok = await this.confirmDialog.ask({
      tone: 'danger',
      icon: 'phone-off',
      title: 'Görüşme sonlandırılsın mı?',
      message: 'Görüşmeyi sonlandırırsanız e-imzanız düzenlenmez. Devam etmek için görüşmeyi yeniden başlatmanız gerekir.',
      confirm: 'Görüşmeyi sonlandır',
      cancel: 'Görüşmeye dön',
    });
    if (ok) void this.store.endCall();
  }
}
