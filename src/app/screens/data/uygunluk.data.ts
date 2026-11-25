import { computed, inject, signal } from '@angular/core';
import { ApplicationStore } from '../../core/application.store';
import { Assistant } from '../../core/assistant';
import { followFlow } from '../../core/follow';
import { clock, dateTime, dec1, hm, maskCard, maskPhone, tl, tl0 } from '../../core/format';
import { Inbox } from '../../core/inbox';
import { ADDRESS_DOC_MAX, validateCard } from '../../core/mock-api';
import { FEES, FUNDING_LABELS } from '../../core/models';
import { DURATION, identityView, SCREENING_LISTS, screeningEvents } from '../../core/timeline';
import { DemoSettings } from '../../core/demo-settings';

const OTP_TTL = 180_000;

/**
 * What the founder is told to do and not to do during the camera check; shown on D-2a's
 * pre-information view and on the phone page. Placeholders until the KYC vendor's capture rules
 * are known (PROJECT_LOG, 2026-11-17 twenty-second entry).
 */
export const KYC_RULES = {
  do: ['Pasaportun fotoğraflı sayfasını çerçeveye tam yerleştiriniz.', 'Yüzünüzü açık ve tam görünür tutunuz.', 'Doğrulama tamamlanana kadar kameranın karşısında kalınız.'],
  dont: ['Güneş gözlüğü, şapka veya maske takmayınız.', 'Pasaportun fotokopisini veya ekran görüntüsünü göstermeyiniz.', 'Kadrajda başka bir kişi bulundurmayınız.'],
};

const PROMPTS = ['Başınızı çeviriniz', 'Göz kırpınız', 'Gülümseyiniz'];

/** What the camera area shows at this moment of the check; the same on the computer and on the phone page. */
export function cameraView(e: ReturnType<typeof identityView>) {
  const face = e.passportRead && !e.identityDone;
  return {
    title: !e.passportRead ? 'Pasaportunuzu kameraya gösteriniz' : face ? 'Yüzünüzü çerçevenin içinde tutunuz' : 'Kimliğiniz doğrulandı',
    view: (!e.passportRead ? 'passport' : face ? 'face' : 'wait') as 'passport' | 'face' | 'wait',
    prompt: e.liveness < 0 ? 'Yüzünüzü çerçeveye yerleştiriniz' : (PROMPTS[e.liveness] ?? ''),
    chips: PROMPTS.map((t, i) => ({ t, done: e.liveness > i, cur: e.liveness === i })),
    wait: 'Bir sonraki aşamaya geçiliyor.',
  };
}

const fileSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/**
 * Step 2 (identity on D-2a, declaration on D-2d, list search on D-2e, result on D-2b / D-2c) and
 * step 3 payment with 3-D Secure.
 */
export class UygunlukData {
  protected readonly store = inject(ApplicationStore);
  private readonly inbox = inject(Inbox);
  private readonly demo = inject(DemoSettings);
  private readonly assistant = inject(Assistant);

  constructor() {
    this.store.clearError();
    followFlow();
  }

  // ------------------------------------------------------------------ D-2a identity check

  protected readonly passportLine = computed(() => {
    const f = this.store.app()?.founder;
    if (!f) return '';
    const exp = new Date(this.store.app()!.createdAt);
    return `${f.nationality || '—'} · Pasaport no ●●●●${f.passportNo.slice(-4)} · Son geçerlilik ${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear() + 5}`;
  });

  /**
   * D-2a in the Odak layout. Null while the founder is still on the pre-information view; once
   * started the camera check runs by itself (see timeline.identityView) and this says what the
   * camera area shows at each moment. When it ends the application moves to the declaration screen.
   */
  protected readonly kyc = computed(() => {
    const e = this.store.identity();
    const f = this.store.app()?.founder;
    if (!e) return null;
    const cam = cameraView(e);
    const phone = this.store.app()?.eligibility?.via === 'phone';
    const mrzName = (x = '') => x.toLocaleUpperCase('en-US').replace(/[^A-Z]/g, '');
    return {
      ...cam,
      /** The check was started from the phone page: this screen only follows it. */
      phone,
      title: phone && !e.identityDone ? 'Doğrulama telefonunuzda sürüyor' : cam.title,
      lead: phone
        ? 'Pasaportunuz ve yüzünüz telefonunuzun kamerasıyla doğrulanır. Bu sayfa kendiliğinden ilerler.'
        : 'Kimliğiniz, pasaportunuz ve kameranız aracılığıyla doğrulanır. Doğrulama tamamlanana kadar kameranın karşısında kalınız.',
      mrz: `${mrzName(f?.lastName)}<<${mrzName(f?.firstName)}`.padEnd(30, '<').slice(0, 30),
    };
  });

  /** D-2a pre-information: the consent tick. The button stays off until it is set; the API checks it too. */
  protected readonly consent = signal(false);

  protected readonly rules = KYC_RULES;

  /** D-2a "Telefonla devam et": the QR view is showing instead of the pre-information. */
  protected readonly phoneMode = signal(false);
  /** The link behind the QR code, with the time it has left. */
  protected readonly phoneLink = computed(() => {
    const l = this.store.app()?.phoneLink;
    if (!l) return null;
    const left = Date.parse(l.expiresAt) - this.store.now();
    const path = `/eligibility/phone/${l.token}`;
    return { url: location.origin + path, path, expired: left <= 0, left: clock(left) };
  });

  protected usePhone() {
    this.phoneMode.set(true);
    const l = this.phoneLink();
    if (!l || l.expired) void this.store.createPhoneLink();
  }

  protected renewPhoneLink() {
    void this.store.createPhoneLink();
  }

  protected useComputer() {
    this.store.clearError();
    this.phoneMode.set(false);
  }

  /** D-2a pre-information: "Doğrulamayı başlat". Until then `kyc()` is null and nothing runs. */
  protected startCheck() {
    void this.store.startEligibility(this.consent());
  }

  /** "Kamera çalışmıyor": Terminal AI answers in the side panel. */
  protected askCamera() {
    void this.assistant.ask('Kamera çalışmıyorsa ne yapılır?');
  }

  // ------------------------------------------------------------------- D-2d declaration

  /** The address document chosen on this screen; it is sent when the declaration is confirmed. */
  protected readonly addrFile = signal<{ name: string; size: number } | null>(null);
  protected readonly addrError = signal<string | null>(null);
  protected readonly addrDragging = signal(false);
  protected readonly declared = signal(false);

  protected readonly declaration = computed(() => {
    const a = this.store.app();
    const f = this.addrFile();
    return {
      address: a ? [a.contact.address, `${a.contact.postalCode} ${a.contact.country}`.trim()].filter(Boolean).join(', ') : '',
      funding: a ? FUNDING_LABELS[a.funding] : '',
      file: f ? { name: f.name, size: fileSize(f.size) } : null,
      ready: !!f && this.declared(),
    };
  });

  protected onAddrInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) this.takeAddr(f);
  }

  protected onAddrDrop(e: DragEvent) {
    e.preventDefault();
    this.addrDragging.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) this.takeAddr(f);
  }

  protected onAddrDragOver(e: DragEvent) {
    e.preventDefault();
    this.addrDragging.set(true);
  }

  /** The same two checks the API makes, so the founder hears about a wrong file at once. */
  private takeAddr(f: { name: string; size: number }) {
    this.store.clearError();
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return this.addrError.set('Adres belgesi PDF, JPG veya PNG biçiminde olmalıdır.');
    if (f.size > ADDRESS_DOC_MAX) return this.addrError.set('Dosya 10 MB’tan büyüktür. Daha küçük bir dosya yükleyiniz.');
    this.addrError.set(null);
    this.addrFile.set({ name: f.name, size: f.size });
  }

  /** Demo help, like "Test kartını doldur" on the payment screen. */
  protected useSampleAddr() {
    this.takeAddr({ name: 'adres-belgesi.pdf', size: 412_000 });
  }

  protected submitDeclaration() {
    void this.store.submitDeclaration({ file: this.addrFile(), declared: this.declared() });
  }

  // --------------------------------------------------------------------- D-2e list search

  private readonly events = computed(() => {
    const a = this.store.app();
    return a?.eligibility ? screeningEvents(a, DURATION.screening / this.demo.speed()) : null;
  });

  private readonly listTime = (iso?: string) => (iso ? hm(iso).concat(':', new Date(iso).getSeconds().toString().padStart(2, '0')) : '');

  protected readonly scr = computed(() => {
    const s = this.store.screening();
    const times = this.events()?.listTimes ?? [];
    const done = s?.listsDone ?? 0;
    return {
      done,
      lists: SCREENING_LISTS.map((n, i) => ({ n, st: i < done ? 'ok' : i === done ? 'now' : '', t: i < done ? this.listTime(times[i]) : '' })),
    };
  });

  // ---------------------------------------------------------------------- D-2b eligible

  protected readonly doneStages = computed(() => {
    const a = this.store.app();
    if (!a?.eligibility) return [];
    const doc = a.eligibility.address?.fileName;
    return [
      { t: 'Kimlik doğrulama', s: `Pasaport MRZ doğrulandı · canlılık eşleşmesi ${dec1(a.eligibility.score)}`, d: this.passportLine() },
      { t: 'Beyan', s: `${doc ? `Adres belgesi: ${doc}` : 'Adres belgesi alındı'} · fon kaynağı: ${FUNDING_LABELS[a.funding].toLocaleLowerCase('tr-TR')}`, d: `${a.contact.address}, ${a.contact.postalCode} ${a.contact.country}` },
    ];
  });

  protected readonly manualStages = computed(() => [
    ...this.doneStages(),
    { t: 'Yaptırım ve PEP taraması', s: '5/5 liste tarandı · eşleşme bulunmadı', d: '' },
  ]);

  protected readonly listsOpen = signal(true);

  protected readonly lists = computed(() => {
    const times = this.events()?.listTimes ?? [];
    return SCREENING_LISTS.map((n, i) => ({ n, t: this.listTime(times[i]) }));
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
