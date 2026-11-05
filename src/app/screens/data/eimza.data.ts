import { computed, inject, signal } from '@angular/core';
import { ApplicationStore } from '../../core/application.store';
import { DemoSettings } from '../../core/demo-settings';
import { followFlow } from '../../core/follow';
import { clock, date, dateTime, tl0 } from '../../core/format';
import { saveBytes } from '../../core/files';
import { Inbox } from '../../core/inbox';
import { AGENCIES, CALL_STEPS, DURATION } from '../../core/timeline';

/** Step 4 e-signature (ESHS call or T.C. e-imza) and step 5 company setup (Ekranlar 3). */
export class EimzaData {
  protected readonly store = inject(ApplicationStore);
  private readonly demo = inject(DemoSettings);
  private readonly inbox = inject(Inbox);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  // ------------------------------------------------------------------------ D-4a pre-call

  protected readonly mic = signal(true);
  protected readonly cam = signal(true);
  protected readonly faq = signal<'what' | 'how' | null>(null);
  protected readonly checks = computed(() => [
    this.cam() ? 'Kamera hazır' : 'Kamera kapalı',
    this.mic() ? 'Mikrofon hazır' : 'Mikrofon kapalı',
    'Bağlantı kalitesi iyi',
  ]);
  protected readonly devicesReady = computed(() => this.mic() && this.cam());

  protected startCall() {
    if (!this.devicesReady()) {
      this.store.error.set('Görüşme için kamera ve mikrofon açık olmalı.');
      return;
    }
    void this.store.startCall();
  }

  // --------------------------------------------------------------------------- D-4b call

  protected readonly callTimer = computed(() => clock(this.store.call()?.elapsedMs ?? 0));
  protected readonly captions = computed(() => {
    const c = this.store.call();
    if (!c) return { prev: '', cur: '' };
    const all = [
      `Merhaba ${this.store.app()?.founder.firstName}, ben Elif. Pasaportunuzun fotoğraflı sayfasını kameraya gösterir misiniz?`,
      'Teşekkürler, pasaportunuz okundu. Şimdi yüzünüzü kameraya yaklaştırın, eşleşmeyi kontrol ediyorum.',
      'Şirket kuruluş belgelerinizin e-imzayla imzalanmasını onaylıyor musunuz? Lütfen “onaylıyorum” deyin.',
      'Onayınız kaydedildi. Görüşme tutanağını imzalıyorum.',
      'Günlük e-imzanız düzenleniyor, birazdan hazır olacak.',
      'Görüşme tamamlandı. İyi günler dilerim.',
    ];
    return { prev: c.step > 0 ? all[c.step - 1] : '', cur: all[c.step] };
  });
  protected readonly passportSeen = computed(() => (this.store.call()?.step ?? 0) >= 1);
  protected readonly callSteps = computed(() => {
    const step = this.store.call()?.step ?? 0;
    return CALL_STEPS.map((t, i) => {
      const done = i < step;
      const cur = i === step;
      return { t, icon: done ? '✓' : cur ? '›' : String(i + 1), bar: done ? 'var(--bg-15803D)' : cur ? 'var(--bg-061262)' : 'var(--bg-E5E7EB)', color: done ? 'var(--fg-1F2A44)' : cur ? 'var(--fg-061262)' : 'var(--fg-5B6478)' };
    });
  });

  protected endCall() {
    if (confirm('Görüşmeyi bitirirseniz e-imza düzenlenmez ve görüşmeyi yeniden başlatmanız gerekir. Bitirilsin mi?')) void this.store.endCall();
  }

  // ------------------------------------------------------------------------ D-4c ready

  protected readonly sig = computed(() => this.store.app()?.signature ?? null);
  protected readonly holderLine = computed(() => {
    const a = this.store.app();
    if (!a || !this.sig()) return '';
    const doc = a.founderType === 'resident' ? `T.C. ${a.founder.tckn?.slice(0, 3)}●●●●●${a.founder.tckn?.slice(-3)}` : `Pasaport ${a.founder.nationality === 'Birleşik Krallık' ? 'GBR' : a.founder.nationality.slice(0, 3).toLocaleUpperCase('tr-TR')}`;
    return `${this.sig()!.holder} · ${doc}`;
  });
  protected readonly validity = computed(() => (this.sig() ? `${dateTime(this.sig()!.validUntil)} tarihine kadar geçerli` : ''));
  protected readonly leftMs = computed(() => (this.sig() ? Math.max(0, Date.parse(this.sig()!.validUntil) - this.store.now()) : 0));
  protected readonly leftLabel = computed(() => clock(this.leftMs(), true));
  /** Countdown ring: 352 ≈ circumference of r=56. */
  protected readonly ringDash = computed(() => `${Math.round((this.leftMs() / (24 * 3600_000)) * 352)} 352`);
  protected readonly callSummary = computed(() => {
    const s = this.sig();
    if (!s) return '';
    if (s.method !== 'eshs') return '· e-İmzanız doğrulandı · taahhütname belgelerinize eklendi';
    return `· 5/5 adım · ${clock(DURATION.call / this.demo.speed())} dk · tutanak belgelerinize eklendi`;
  });

  protected startSetup() {
    void this.store.startSetup();
  }

  // ---------------------------------------------------------------- D-4d T.C. citizen

  protected readonly method = signal<'existing' | 'edevlet'>('existing');
  protected readonly resident = computed(() => {
    const a = this.store.app();
    return a ? `${a.founder.firstName} ${a.founder.lastName}` : '';
  });

  protected async signAndStart() {
    if (await this.store.signResident(this.method())) await this.store.startSetup();
  }

  // ---------------------------------------------------------------------- D-5a setup

  protected readonly agency = computed(() => {
    const v = this.store.setup();
    const cur = v?.agency ?? 0;
    return AGENCIES.map((a, i) => {
      const done = i < cur;
      const isCur = i === cur;
      return {
        n: String(i + 1).padStart(2, '0'),
        t: a.t,
        ag: a.ag,
        done,
        cur: isCur,
        up: !done && !isCur,
        bg: isCur ? 'var(--bg-F7F9FE)' : 'transparent',
        weight: isCur ? 600 : 500,
        color: done || isCur ? 'var(--fg-061262)' : 'var(--fg-5B6478)',
      };
    });
  });

  protected readonly segs = computed(() => {
    const cur = this.store.setup()?.agency ?? 0;
    return AGENCIES.map((_, i) => ({
      bg: i < cur ? 'var(--bg-15803D)' : i === cur ? 'var(--bg-061262)' : 'var(--bg-E5E7EB)',
      anim: i === cur ? 'seg 1.6s ease-in-out infinite' : 'none',
    }));
  });

  protected readonly current = computed(() => {
    const v = this.store.setup();
    if (!v) return null;
    const a = AGENCIES[Math.min(v.agency, AGENCIES.length - 1)];
    const sub = a.subs[Math.min(v.sub, a.subs.length - 1)];
    return { idx: Math.min(v.agency + 1, AGENCIES.length), total: AGENCIES.length, t: a.t, ag: a.ag, sub: `${sub.t}…`, percent: v.percent };
  });

  protected readonly detailsOpen = signal(false);
  protected readonly totalSubs = AGENCIES.reduce((s, a) => s + a.subs.length, 0);

  /** Sub-steps of the agencies still running or queued (shown under "Detayları göster"). */
  protected readonly details = computed(() => {
    const v = this.store.setup();
    if (!v) return [];
    let k = 0;
    const out: { n: string; t: string; subs: { i: string; ic: string; color: string; t: string; exempt: boolean; deco: string }[] }[] = [];
    AGENCIES.forEach((a, ai) => {
      const subs = a.subs.map((s, si) => {
        const idx = k + si;
        const state = s.kind === 'exempt' ? 'x' : idx < v.done ? 'd' : idx === v.done ? 'c' : 'u';
        const [i, ic, color] = { d: ['✓', 'var(--fg-15803D)', 'var(--fg-1F2A44)'], c: ['›', 'var(--fg-061262)', 'var(--fg-061262)'], u: ['·', 'var(--fg-8A93A6)', 'var(--fg-5B6478)'], x: ['–', 'var(--fg-8A93A6)', 'var(--fg-5B6478)'] }[state];
        return { i, ic, color, t: s.t + (state === 'c' ? '…' : ''), exempt: state === 'x', deco: state === 'x' ? 'line-through' : 'none' };
      });
      k += a.subs.length;
      if (ai >= 3) out.push({ n: String(ai + 1).padStart(2, '0'), t: a.t, subs });
    });
    return out;
  });

  // ------------------------------------------------------------------------ D-5b done

  protected readonly doneLine = computed(() => {
    const a = this.store.app();
    if (!a?.setup?.finishedAt) return '';
    const mins = Math.max(1, Math.round((Date.parse(a.setup.finishedAt) - Date.parse(a.setup.startedAt)) / 60_000));
    return `${AGENCIES.length}/${AGENCIES.length} KURUM ADIMI TAMAMLANDI · ${mins} DK`;
  });
  protected readonly registered = computed(() => {
    const f = this.store.app()?.setup?.finishedAt;
    return f ? `Tescil ${date(f)} · Gebze Ticaret Sicili Müdürlüğü · Merkez: Terminal İstanbul, Gebze / Kocaeli` : '';
  });
  protected readonly copied = signal<string | null>(null);

  protected readonly results = computed(() => {
    const r = this.store.app()?.results;
    if (!r) return [];
    const blocked = tl0((this.store.app()?.company.capital ?? 250_000) * 0.25);
    return [
      { k: 'Vergi kimlik no', v: r.vkn, s: r.taxOffice, a: 'Kopyala', font: "600 18px/24px 'IBM Plex Mono',monospace" },
      { k: 'MERSİS no', v: r.mersis, s: 'Ticaret sicili tescil edildi', a: 'Kopyala', font: "600 18px/24px 'IBM Plex Mono',monospace" },
      { k: 'IBAN · Halkbank', v: r.iban, s: `Sermayenin %25'i (${blocked}) bloke`, a: 'Kopyala', font: "600 16px/24px 'IBM Plex Mono',monospace" },
      { k: 'Mali müşavir', v: r.advisor, s: r.advisorFirm, a: 'İletişim', font: "600 17px/24px 'IBM Plex Sans',sans-serif" },
    ];
  });

  protected readonly nexts = computed(() => {
    const blocked = tl0((this.store.app()?.company.capital ?? 250_000) * 0.25);
    const advisor = this.store.app()?.results?.advisor.replace('SMMM ', '') ?? 'Müşaviriniz';
    return [
      { n: '01', t: "Sermayenin %25'ini yatırın", d: `${blocked}'yi Halkbank hesabınıza transfer edin; blokaj tescille kalkar.`, w: '30 gün içinde' },
      { n: '02', t: 'İlk e-faturanızı kesin', d: 'e-Fatura kaydınız hazır; GİB portalına erişim e-postanıza gönderildi.', w: 'Hazır' },
      { n: '03', t: 'Müşavirinizle tanışın', d: `${advisor} ile 20 dakikalık görüntülü tanışma planlayın.`, w: 'Önerilir' },
    ];
  });

  protected resultAction(r: { k: string; v: string; a: string }) {
    if (r.a === 'Kopyala') {
      void navigator.clipboard?.writeText(r.v.replace(/\s/g, r.k.startsWith('IBAN') ? ' ' : ''));
      this.copied.set(r.k);
      setTimeout(() => this.copied.set(null), 1500);
    } else {
      this.inbox.send({ kind: 'mail', from: 'musavirlik@terminalistanbul.com', title: 'Tanışma talebiniz iletildi', body: `${r.v} sizinle 1 iş günü içinde iletişime geçecek ve 20 dakikalık bir tanışma görüşmesi planlayacak.` });
    }
  }

  protected downloadAll() {
    saveBytes(this.store.documentsZip(), `${this.store.title().replace(/\s+/g, '-')}-belgeler.zip`, 'application/zip');
  }

  protected openPanel() {
    this.inbox.send({ kind: 'mail', from: 'no-reply@dijitalsirket.gov.tr', title: 'Şirket paneliniz hazırlanıyor', body: `${this.store.fullTitle()} paneline erişim bilgileri birkaç dakika içinde e-postanıza gönderilecek.` });
  }
}
