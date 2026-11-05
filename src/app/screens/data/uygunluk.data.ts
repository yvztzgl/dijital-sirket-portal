import { computed, inject, signal } from '@angular/core';
import { ApplicationStore } from '../../core/application.store';
import { followFlow } from '../../core/follow';
import { clock, dateTime, dec1, hm, maskCard, maskPhone, tl, tl0 } from '../../core/format';
import { Inbox } from '../../core/inbox';
import { validateCard } from '../../core/mock-api';
import { FEES, FUNDING_LABELS } from '../../core/models';
import { DURATION, eligibilityEvents, LIVENESS, SCREENING_LISTS } from '../../core/timeline';
import { DemoSettings } from '../../core/demo-settings';

const OTP_TTL = 180_000;

/** Step 2 eligibility (AML) and step 3 payment with 3-D Secure (Ekranlar 2). */
export class UygunlukData {
  protected readonly store = inject(ApplicationStore);
  private readonly inbox = inject(Inbox);
  private readonly demo = inject(DemoSettings);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  // --------------------------------------------------------------- D-2a checks in progress

  protected readonly passportLine = computed(() => {
    const f = this.store.app()?.founder;
    if (!f) return '';
    const exp = new Date(this.store.app()!.createdAt);
    return `${f.nationality || '—'} · Pasaport no ●●●●${f.passportNo.slice(-4)} · Son geçerlilik ${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear() + 5}`;
  });

  protected readonly live = computed(() => {
    const e = this.store.eligibility();
    const score = this.store.app()?.eligibility?.score ?? 0;
    if (!e) return null;
    const step1 = (e.passportRead ? 1 : 0) + Math.max(0, Math.min(2, e.liveness));
    const chip = (i: number) => {
      const done = e.liveness > i;
      const cur = e.liveness === i;
      return {
        t: (done ? '✓ ' : '') + LIVENESS[i],
        style: `padding:2px 8px;border-radius:999px;background:${done ? 'var(--bg-F0FDF4)' : cur ? 'var(--bg-061262)' : 'var(--bg-EEF1F6)'};color:${done ? 'var(--fg-15803D)' : cur ? 'var(--fg-FFFFFF)' : 'var(--fg-3B4660)'};font:600 11px/16px 'IBM Plex Sans',sans-serif`,
      };
    };
    const circle = (state: 'done' | 'cur' | 'todo', n: number) => ({
      n: state === 'done' ? '✓' : String(n),
      style:
        state === 'done'
          ? "width:28px;height:28px;border-radius:50%;background:var(--bg-15803D);color:var(--fg-FFFFFF);display:grid;place-items:center;font:600 13px/1 'IBM Plex Sans',sans-serif"
          : state === 'cur'
            ? "width:28px;height:28px;border-radius:50%;background:var(--bg-061262);color:var(--fg-FFFFFF);display:grid;place-items:center;font:600 13px/1 'IBM Plex Sans',sans-serif;box-shadow:0 0 0 4px var(--bd-DCE6FF)"
            : "width:28px;height:28px;border-radius:50%;border:1.5px solid var(--bd-C9D2E3);color:var(--fg-5B6478);display:grid;place-items:center;font:600 13px/1 'IBM Plex Sans',sans-serif;box-sizing:border-box",
    });
    const badge = (state: 'done' | 'cur' | 'todo', text: string) => ({
      text: state === 'done' ? '✓ Tamamlandı' : state === 'cur' ? text : 'Sırada',
      style:
        state === 'done'
          ? "padding:2px 9px;border-radius:999px;background:var(--bg-F0FDF4);color:var(--fg-15803D);font:600 11.5px/16px 'IBM Plex Sans',sans-serif"
          : state === 'cur'
            ? "padding:2px 9px;border-radius:999px;background:var(--bg-EFF4FF);color:var(--fg-061262);font:600 11.5px/16px 'IBM Plex Sans',sans-serif"
            : "font:500 12px/16px 'IBM Plex Sans',sans-serif;color:var(--fg-5B6478)",
    });
    const st = (i: number) => (e.stage > i ? 'done' : e.stage === i ? 'cur' : 'todo') as 'done' | 'cur' | 'todo';
    return {
      c1: circle(st(0), 1),
      b1: badge(st(0), `Devam ediyor · ${step1}/3`),
      c2: circle(st(1), 2),
      b2: badge(st(1), 'Devam ediyor'),
      c3: circle(st(2), 3),
      b3: badge(st(2), `${e.listsDone}/5 liste tarandı`),
      passport: e.passportRead ? '✓ Pasaport okundu · MRZ doğrulandı' : 'Pasaport okunuyor…',
      prompt: e.identityDone ? '✓ Canlılık doğrulandı' : e.liveness < 0 ? 'Yüzünüzü çerçeveye yerleştirin' : `Şimdi ${LIVENESS[e.liveness].toLocaleLowerCase('tr-TR')}`,
      chips: [0, 1, 2].map(chip),
      score: e.identityDone ? `Eşleşme skoru ${dec1(score)}` : 'Eşleşme skoru hesaplanıyor…',
    };
  });

  protected readonly passportOpen = signal(false);

  // ---------------------------------------------------------------------- D-2b eligible

  private readonly events = computed(() => {
    const a = this.store.app();
    return a?.eligibility ? eligibilityEvents(a, DURATION.eligibility / this.demo.speed()) : null;
  });

  protected readonly doneStages = computed(() => {
    const a = this.store.app();
    if (!a?.eligibility) return [];
    return [
      { t: 'Kimlik doğrulama', s: `Pasaport MRZ doğrulandı · canlılık eşleşmesi ${dec1(a.eligibility.score)}`, d: this.passportLine() },
      { t: 'Beyan onayı', s: `Adres belgesi alındı · fon kaynağı: ${FUNDING_LABELS[a.funding].toLocaleLowerCase('tr-TR')}`, d: `${a.contact.address}, ${a.contact.postalCode} ${a.contact.country}` },
    ];
  });

  protected readonly manualStages = computed(() => [
    ...this.doneStages(),
    { t: 'Yaptırım ve PEP taraması', s: '5/5 liste tarandı · eşleşme bulunmadı', d: '' },
  ]);

  protected readonly openStage = signal<number | null>(null);
  protected readonly listsOpen = signal(true);

  protected readonly lists = computed(() => {
    const times = this.events()?.listTimes ?? [];
    return SCREENING_LISTS.map((n, i) => ({ n, t: times[i] ? hm(times[i]).concat(':', new Date(times[i]).getSeconds().toString().padStart(2, '0')) : '' }));
  });

  protected readonly finishedAt = computed(() => {
    const f = this.store.app()?.eligibility?.finishedAt;
    return f ? hm(f) : '';
  });

  // ------------------------------------------------------------------- D-2c manual review

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

  protected readonly manualHint = computed(() =>
    this.store.app()?.funding === 'third-party'
      ? { title: 'Fon kaynağı yanlış girildiyse önce düzeltin', reason: '“Üçüncü taraf transferi” seçimi manuel incelemeyi tetikledi (s. 10).' }
      : { title: 'Ödeme ve e-imzaya devam edebilirsiniz', reason: 'İnceleme olumlu sonuçlanınca kuruluş belgeleri kurumlara gönderilir.' },
  );

  protected continueManual() {
    void this.store.proceedToPayment();
  }

  protected fixDeck() {
    void this.store.backToReview();
  }

  protected toPayment() {
    void this.store.proceedToPayment();
  }

  // ------------------------------------------------------------------------ D-3a payment

  protected readonly card = signal({ holder: '', number: '', expiry: '', cvv: '' });
  protected readonly cardTried = signal(false);
  protected readonly feesOpen = signal(false);
  protected readonly fees = FEES.map((f) => ({ label: f.label, amount: tl(f.amount) }));
  protected readonly total = computed(() => tl(this.store.app()?.payment?.amount ?? FEES.reduce((s, f) => s + f.amount, 0)));
  protected readonly totalNumber = computed(() => this.total().replace(' TL', ''));
  protected readonly capital = computed(() => tl0(this.store.app()?.company.capital ?? 250_000));

  protected setCard(key: 'holder' | 'number' | 'expiry' | 'cvv', e: Event) {
    const el = e.target as HTMLInputElement;
    let v = el.value;
    if (key === 'number') v = v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
    if (key === 'expiry') {
      const d = v.replace(/\D/g, '').slice(0, 4);
      v = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    }
    if (key === 'cvv') v = v.replace(/\D/g, '').slice(0, 4);
    if (key === 'holder') v = v.toLocaleUpperCase('tr-TR');
    el.value = v;
    this.card.update((c) => ({ ...c, [key]: v }));
  }

  protected readonly cardBrand = computed(() => {
    const n = this.card().number.replace(/\D/g, '');
    return n.startsWith('4') ? 'VISA' : /^5[1-5]/.test(n) ? 'MC' : /^9792/.test(n) ? 'TROY' : 'KART';
  });

  protected readonly cardError = computed(() => (this.cardTried() ? validateCard(this.card()) : null));

  protected useTestCard() {
    this.card.set({ holder: this.store.fullName().toLocaleUpperCase('tr-TR'), number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' });
  }

  protected pay() {
    this.cardTried.set(true);
    if (this.cardError()) return;
    void this.store.pay(this.card());
  }

  // --------------------------------------------------------------------- D-3b 3-D Secure

  protected readonly otp = signal('');
  protected readonly payment = computed(() => this.store.app()?.payment);
  protected readonly maskedCard = computed(() => maskCard(this.payment()?.last4 ?? '0000'));
  protected readonly maskedPhone = computed(() => maskPhone(this.store.app()?.contact.phone || '+00 0000'));
  protected readonly txTime = computed(() => (this.payment()?.otpSentAt ? dateTime(this.payment()!.otpSentAt!) : ''));
  protected readonly otpLeft = computed(() => {
    const sent = this.payment()?.otpSentAt;
    return sent ? Math.max(0, OTP_TTL - (this.store.now() - Date.parse(sent))) : 0;
  });
  protected readonly otpLeftLabel = computed(() => clock(this.otpLeft()));
  protected readonly sms = computed(() => this.inbox.messages().find((m) => m.kind === 'sms') ?? null);

  protected confirm(code = this.otp()) {
    if (!/^\d{6}$/.test(code)) {
      this.store.error.set('6 haneli kodu girin.');
      return;
    }
    void this.store.confirm3ds(code);
  }

  protected resendOtp() {
    this.otp.set('');
    void this.store.resendOtp();
  }

  protected cancel3ds() {
    void this.store.cancel3ds();
  }
}
