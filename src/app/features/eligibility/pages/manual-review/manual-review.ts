import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { ApplicationStore } from '@core/state/application.store';
import { DemoBar } from '@demo/demo-bar';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { Icon } from '@ui/icon';
import { doneStages } from '../../eligibility.view';

/** D-2c — Manuel inceleme. Why the file is being reviewed, what was checked, and two ways on. */
@Component({
  selector: 'app-manual-review-page',
  imports: [DemoBar, FormError, Icon, StepPage],
  templateUrl: './manual-review.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualReviewPage {
  protected readonly store = inject(ApplicationStore);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  /**
   * D-2c's list. With the server the list search is only said to be finished: under manual review the
   * founder is not told what it found (the API keeps that from the founder's side on purpose).
   */
  protected readonly manualStages = computed(() => [
    ...doneStages(this.store.app(), this.store.serverDecides),
    { t: 'Yaptırım ve PEP taraması', s: this.store.serverDecides ? 'Tarama tamamlandı' : '5/5 liste tarandı · eşleşme bulunmadı', d: '' },
  ]);

  /**
   * The mock's demo reasons. In HTTP mode D-2c shows none: the API never tells the founder why an
   * application is under review (no tipping-off), and the portal does not guess.
   */
  protected readonly manualReasons = computed(() => {
    const a = this.store.app();
    if (a?.funding === 'third-party') {
      return [
        { n: '01', t: 'Fon kaynağı “Üçüncü taraf transferi” olarak beyan edildi', p: 's. 10' },
        { n: '02', t: 'Transferi yapan tarafın kimliği sunumda belirtilmemiş', p: 's. 10' },
      ];
    }
    return [
      { n: '01', t: 'Canlılık eşleşme skoru otomatik onay eşiğine yakın', p: '—' },
      { n: '02', t: 'Uyum ekibi kimlik belgesini ikinci kez kontrol edecek', p: '—' },
    ];
  });

  protected continueManual() {
    void this.store.proceedToPayment();
  }

  protected fixDeck() {
    void this.store.backToReview();
  }
}
