import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { followFlow } from '@core/flow/follow';
import { Assistant } from '@core/services/assistant';
import { Inbox } from '@core/services/inbox';
import { ApplicationStore } from '@core/state/application.store';
import { saveBytes } from '@core/utils/files';
import { date, tl0 } from '@core/utils/format';
import { Icon } from '@ui/icon';
import { StepPage } from '@layout/step-page';

const MONO = "600 18px/24px 'IBM Plex Mono',monospace";

/** D-5b — Şirketiniz kuruldu. The four results with copy buttons, the next three things to do, the documents. */
@Component({
  selector: 'app-setup-complete-page',
  imports: [Icon, StepPage],
  templateUrl: './setup-complete.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupCompletePage {
  protected readonly store = inject(ApplicationStore);
  private readonly inbox = inject(Inbox);
  private readonly assistant = inject(Assistant);
  /** HTTP mode: only the identifiers the API returned; no next steps, no browser-made documents, no mock e-mails. */
  protected readonly serverDecides = this.store.serverDecides;

  constructor() {
    this.store.clearError();
    followFlow();
  }

  protected readonly registered = computed(() => {
    if (this.serverDecides) {
      // Only what the API reports: when the formation finished (its timeline) and the registry number.
      const a = this.store.app();
      const parts = [a?.setup?.finishedAt ? `Kuruluş ${date(a.setup.finishedAt)}` : '', a?.results?.registryNo ? `Ticaret sicili tescil no ${a.results.registryNo}` : ''];
      return parts.filter(Boolean).join(' · ');
    }
    const f = this.store.app()?.setup?.finishedAt;
    return f ? `Tescil ${date(f)} · Gebze Ticaret Sicili Müdürlüğü · Merkez: Terminal İstanbul, Gebze / Kocaeli` : '';
  });
  protected readonly copied = signal<string | null>(null);

  protected readonly results = computed(() => {
    const r = this.store.app()?.results;
    if (!r) return [];
    if (this.serverDecides) {
      // HTTP mode: the identifiers the API returned, each with copy; no advisor (the API sends no name
      // or firm) and no blocked-capital line (the API sends no capital).
      return [
        { k: 'Vergi kimlik no', v: r.vkn, s: r.taxOffice ?? '', a: 'Kopyala', font: MONO },
        { k: 'MERSİS no', v: r.mersis, s: r.registryNo ? `Ticaret sicili tescil no ${r.registryNo}` : '', a: 'Kopyala', font: MONO },
        { k: 'IBAN', v: r.iban, s: '', a: 'Kopyala', font: "600 16px/24px 'IBM Plex Mono',monospace" },
        { k: 'e-Fatura kayıt no', v: r.eInvoiceNo, s: '', a: 'Kopyala', font: MONO },
        { k: 'SGK işyeri sicil no', v: r.sgkNo, s: '', a: 'Kopyala', font: "600 15px/24px 'IBM Plex Mono',monospace" },
      ].filter((x): x is typeof x & { v: string } => !!x.v);
    }
    const blocked = tl0((this.store.app()?.company.capital ?? 250_000) * 0.25);
    return [
      { k: 'Vergi kimlik no', v: r.vkn ?? '', s: r.taxOffice ?? '', a: 'Kopyala', font: MONO },
      { k: 'MERSİS no', v: r.mersis ?? '', s: 'Ticaret sicili tescil edildi', a: 'Kopyala', font: MONO },
      { k: 'IBAN · Halkbank', v: r.iban ?? '', s: `Sermayenin %25'i (${blocked}) bloke`, a: 'Kopyala', font: "600 16px/24px 'IBM Plex Mono',monospace" },
      { k: 'Mali müşavir', v: r.advisor ?? '', s: r.advisorFirm ?? '', a: 'İletişim', font: "600 17px/24px 'IBM Plex Sans',sans-serif" },
    ];
  });

  protected readonly nexts = computed(() => {
    const blocked = tl0((this.store.app()?.company.capital ?? 250_000) * 0.25);
    const advisor = this.store.app()?.results?.advisor?.replace('SMMM ', '') ?? 'Müşaviriniz';
    return [
      // `img`: that step's scene, cut from the building picture of D-5a (art/README.md, "Building scene"). `tone`: the tag's colour.
      { n: '01', t: 'Sermayenin %25’ini yatırınız', d: `${blocked} tutarını Halkbank hesabınıza transfer ediniz; blokaj tescille kalkar.`, w: '30 gün içinde', tone: 'warn', img: '/assets/illustrations/next-bank.webp' },
      { n: '02', t: 'İlk e-faturanızı kesiniz', d: 'e-Fatura kaydınız hazırdır; GİB portalına erişim bilgileri e-posta adresinize gönderildi.', w: 'Hazır', tone: 'ok', img: '/assets/illustrations/next-invoice.webp' },
      { n: '03', t: 'Mali müşavirinizle tanışınız', d: `${advisor} ile 20 dakikalık görüntülü bir görüşme planlayabilirsiniz.`, w: 'Önerilir', tone: 'info', img: '/assets/illustrations/next-advisor.webp' },
    ];
  });

  protected resultAction(r: { k: string; v: string; a: string }) {
    if (r.a === 'Kopyala') {
      // Copying can be refused (an unfocused window, an insecure origin); the button still acknowledges the press.
      navigator.clipboard?.writeText(r.v.replace(/\s/g, r.k.startsWith('IBAN') ? ' ' : '')).catch(() => undefined);
      this.copied.set(r.k);
      setTimeout(() => this.copied.set(null), 1500);
    } else {
      this.inbox.send({ kind: 'mail', from: 'musavirlik@terminalistanbul.com', title: 'Tanışma talebiniz iletildi', body: `${r.v} sizinle 1 iş günü içinde iletişime geçecek ve 20 dakikalık bir tanışma görüşmesi planlayacak.` });
    }
  }

  /** HTTP mode: "Belgeleri görüntüle" / "İşlem kaydını görüntüle" open that view in the side panel. */
  protected showPanel(tab: 'docs' | 'log') {
    this.assistant.show(tab);
  }

  /** Mock only: the browser-made placeholder documents as one ZIP. Never offered in HTTP mode. */
  protected downloadAll() {
    saveBytes(this.store.documentsZip(), `${this.store.title().replace(/\s+/g, '-')}-belgeler.zip`, 'application/zip');
  }

  /** Mock only: sends a demo e-mail to the Inbox. Hidden in HTTP mode. */
  protected openPanel() {
    this.inbox.send({ kind: 'mail', from: 'no-reply@dijitalsirket.gov.tr', title: 'Şirket paneliniz hazırlanıyor', body: `${this.store.fullTitle()} paneline erişim bilgileri birkaç dakika içinde e-postanıza gönderilecek.` });
  }
}
