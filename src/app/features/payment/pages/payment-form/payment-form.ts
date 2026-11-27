import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Api } from '@core/api/api';
import { followFlow } from '@core/flow/follow';
import { ApplicationStore } from '@core/state/application.store';
import { tl } from '@core/utils/format';
import { validateCard } from '@core/utils/rules';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { Icon } from '@ui/icon';
import { CardField, cardBrand, formatCardField } from '../../card.rules';
import { feeLines, feeTotal } from '../../fees';

/** D-3a — Ödeme. One card: what the fee covers (always shown) beside the card form. */
@Component({
  selector: 'app-payment-form-page',
  imports: [FormError, Icon, StepPage],
  templateUrl: './payment-form.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentFormPage {
  protected readonly store = inject(ApplicationStore);
  /** Mock mode: "Test kartını doldur" needs no note that it only fills the form. */
  protected readonly demoMode = !!inject(Api).demo;

  constructor() {
    this.store.clearError();
    followFlow();
  }

  protected readonly card = signal({ holder: '', number: '', expiry: '', cvv: '' });
  private readonly cardTried = signal(false);
  protected readonly fees = computed(() => feeLines(this.store.app()).map((f) => ({ label: f.label, amount: tl(f.amount) })));
  protected readonly total = computed(() => tl(feeTotal(this.store.app())));

  protected setCard(key: CardField, e: Event) {
    const el = e.target as HTMLInputElement;
    const v = formatCardField(key, el.value);
    el.value = v;
    this.card.update((c) => ({ ...c, [key]: v }));
  }

  protected readonly cardBrand = computed(() => cardBrand(this.card().number));

  protected readonly cardError = computed(() => (this.cardTried() ? validateCard(this.card()) : null));

  /**
   * "Test kartını doldur" only fills this form, in both modes. In HTTP mode the development payment
   * provider then gets `tok_test_4242` (see HttpApi.pay); nothing else is different.
   */
  protected useTestCard() {
    this.card.set({ holder: this.store.fullName().toLocaleUpperCase('tr-TR'), number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' });
  }

  protected pay() {
    this.cardTried.set(true);
    if (this.cardError()) return;
    void this.store.pay(this.card());
  }
}
