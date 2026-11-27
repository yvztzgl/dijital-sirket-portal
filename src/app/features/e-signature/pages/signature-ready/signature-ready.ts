import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { ApplicationStore } from '@core/state/application.store';
import { clock, dateTime } from '@core/utils/format';
import { Icon } from '@ui/icon';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';

const DAY = 24 * 3600_000;

/** D-4c — E-imza hazır. The certificate's details, the time left, one action: start the setup. */
@Component({
  selector: 'app-signature-ready-page',
  imports: [FormError, Icon, StepPage],
  templateUrl: './signature-ready.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignatureReadyPage {
  protected readonly store = inject(ApplicationStore);
  /** HTTP mode: the screen shows only what the server reports (no scope, no document note). */
  protected readonly serverDecides = this.store.serverDecides;

  constructor() {
    this.store.clearError();
    followFlow();
  }

  protected readonly sig = computed(() => this.store.app()?.signature ?? null);
  /** The daily certificate of the video call, or a resident's own (valid for a year or more). */
  protected readonly certName = computed(() => (this.sig()?.method === 'eshs' ? 'Günlük e-imza' : 'Nitelikli e-imza'));
  protected readonly holderLine = computed(() => {
    const a = this.store.app();
    if (!a || !this.sig()) return '';
    // HTTP mode: the API sends no identity document for the holder; the name is the account's.
    if (this.serverDecides) return this.sig()!.holder;
    const doc = a.founderType === 'resident' ? `T.C. ${a.founder.tckn?.slice(0, 3)}●●●●●${a.founder.tckn?.slice(-3)}` : `Pasaport ${a.founder.nationality === 'Birleşik Krallık' ? 'GBR' : a.founder.nationality.slice(0, 3).toLocaleUpperCase('tr-TR')}`;
    return `${this.sig()!.holder} · ${doc}`;
  });
  protected readonly validity = computed(() => (this.sig() ? `${dateTime(this.sig()!.validUntil)} tarihine kadar geçerli` : ''));
  private readonly leftMs = computed(() => (this.sig() ? Math.max(0, Date.parse(this.sig()!.validUntil) - this.store.now()) : 0));
  /** "23:58" (hours and minutes) for the daily certificate; "364 gün" for one valid longer than two days. */
  protected readonly leftLabel = computed(() => (this.leftMs() > 2 * DAY ? `${Math.floor(this.leftMs() / DAY)} gün` : clock(this.leftMs(), true)));
  /** The certificate's whole validity (24 hours for the daily one), for the bar. */
  private readonly validMs = computed(() => {
    const s = this.sig();
    return s ? Math.max(1, Date.parse(s.validUntil) - Date.parse(s.issuedAt)) : DAY;
  });
  /** Share of the signature's validity still left, for the bar. */
  protected readonly leftPct = computed(() => Math.round((this.leftMs() / this.validMs()) * 100));

  /** "Kuruluş belgelerimin bu e-imza ile imzalanmasını onaylıyorum." The API checks it too. */
  protected readonly signConfirm = signal(false);

  protected startSetup() {
    void this.store.startSetup(this.signConfirm());
  }
}
