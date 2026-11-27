import { computed, inject, signal } from '@angular/core';
import { ApplicationStore } from '@core/state/application.store';
import { Assistant } from '@core/services/assistant';
import { Confirm } from '@core/services/confirm';
import { followFlow } from '@core/flow/follow';
import { clock, date, dateTime, tl0 } from '@core/utils/format';
import { saveBytes } from '@core/utils/files';
import { Inbox } from '@core/services/inbox';
import { SetupStep, SetupTask } from '@core/models/models';
import { AGENCIES, CALL_STEPS, DURATION } from '@core/reference/timeline';

/** Step 4 e-signature (ESHS call or T.C. e-imza) and step 5 company setup (Ekranlar 3). */
export class SignatureData {
  protected readonly store = inject(ApplicationStore);
  private readonly inbox = inject(Inbox);
  private readonly assistant = inject(Assistant);
  private readonly confirmDialog = inject(Confirm);

  /**
   * HTTP mode: the server reports the call's outcome, the certificate and the formation. The screens
   * then show only what it reports: no scripted set-up, no browser-made documents, no mock e-mails.
   */
  protected readonly serverDecides = this.store.serverDecides;

  constructor() {
    this.store.clearError();
    // D-5a stays for a moment after the last step so the finished building is seen, then moves to
    // "Şirketiniz kuruldu" with the "founded" animation (the company's logo travels from the roof sign).
    const founded = (screen: string, stage: string | null) => screen === 'd5a' && stage === 'done';
    followFlow({
      linger: (screen, stage) => (founded(screen, stage) ? SignatureData.FINISHED_HOLD : 0),
      transition: (screen, stage) => (founded(screen, stage) ? 'vt-founded' : null),
    });
  }

  // ------------------------------------------------------------------------ D-4a pre-call

  /** D-4a opens on a pre-information view until the founder has accepted the call's terms. */
  protected readonly briefed = computed(() => !!this.store.app()?.callConsentAt);
  protected readonly callConsent = signal(false);
  /**
   * What to do and not to do during the call. Placeholders until the e-signature provider's own
   * rules are known (PROJECT_LOG, 2026-11-17 twenty-sixth entry).
   */
  protected readonly callRules = {
    do: ['Pasaportunuzu yanınızda bulundurunuz.', 'Yüzünüzü açık ve tam görünür tutunuz.', 'Görüşme bitene kadar kameranın karşısında kalınız.'],
    dont: ['Görüşme sırasında başka bir kişiden yardım almayınız.', 'Güneş gözlüğü, şapka veya maske takmayınız.', 'Görüşme tamamlanmadan bağlantıyı kesmeyiniz.'],
  };

  /**
   * HTTP mode: the certificate has expired. The API then reports `signing` again with the old
   * certificate still in the view, and refuses the set-up; signing must be done again (D-4a / D-4d).
   */
  protected readonly expired = computed(() => {
    const a = this.store.app();
    return a?.stage === 'signing' && !!a.signature && Date.parse(a.signature.validUntil) <= this.store.now();
  });

  protected acceptCallTerms() {
    void this.store.acceptCallTerms(this.callConsent());
  }

  protected readonly mic = signal(true);
  protected readonly cam = signal(true);
  protected readonly faq = signal<'what' | 'how' | null>(null);
  protected readonly checks = computed(() => [
    this.cam() ? 'Kamera hazır' : 'Kamera kapalı',
    this.mic() ? 'Mikrofon hazır' : 'Mikrofon kapalı',
    'Bağlantı kalitesi iyi',
  ]);
  protected readonly devicesReady = computed(() => this.mic() && this.cam());
  /** The founder's initials, shown where the camera picture would be. */
  protected readonly initials = computed(() => {
    const f = this.store.app()?.founder;
    return `${f?.firstName?.[0] ?? ''}${f?.lastName?.[0] ?? ''}`.toLocaleUpperCase('tr-TR');
  });

  protected startCall() {
    if (!this.devicesReady()) {
      this.store.error.set('Görüşme için kamera ve mikrofon açık olmalıdır.');
      return;
    }
    void this.store.startCall();
  }

  // --------------------------------------------------------------------------- D-4b call

  /**
   * HTTP mode: the scripted call has ended and been reported (or the portal cannot tell whether a call
   * is open: no call start in the timeline); the provider is issuing the certificate and the page polls.
   * Also while the page gives way after `signed` arrived, so the call does not flash back for a frame.
   */
  protected readonly issuing = computed(() => {
    const a = this.store.app();
    return this.serverDecides && (a?.stage !== 'calling' || !a.call || !!a.call.completed);
  });

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
  /** What the call has just established about the founder, shown on their own picture (the latest one only). */
  protected readonly selfStatus = computed(() => ['', 'Pasaport algılandı', 'Yüz eşleşti', 'Onayınız alındı', 'Tutanak imzalandı', 'E-imza düzenlendi'][Math.min(this.store.call()?.step ?? 0, 5)]);
  protected readonly callSteps = computed(() => {
    const step = this.store.call()?.step ?? 0;
    return CALL_STEPS.map((t, i) => {
      const done = i < step;
      const cur = i === step;
      return { t, icon: done ? '✓' : cur ? '›' : String(i + 1), bar: done ? 'var(--bg-15803D)' : cur ? 'var(--bg-061262)' : 'var(--bg-E5E7EB)', color: done ? 'var(--fg-1F2A44)' : cur ? 'var(--fg-061262)' : 'var(--fg-5B6478)' };
    });
  });

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

  // ------------------------------------------------------------------------ D-4c ready

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
  protected readonly leftMs = computed(() => (this.sig() ? Math.max(0, Date.parse(this.sig()!.validUntil) - this.store.now()) : 0));
  /** "23:58" (hours and minutes) for the daily certificate; "364 gün" for one valid longer than two days. */
  protected readonly leftLabel = computed(() => (this.leftMs() > 48 * 3600_000 ? `${Math.floor(this.leftMs() / (24 * 3600_000))} gün` : clock(this.leftMs(), true)));
  /** The certificate's whole validity (24 hours for the daily one), for the bar on D-4c. */
  private readonly validMs = computed(() => {
    const s = this.sig();
    return s ? Math.max(1, Date.parse(s.validUntil) - Date.parse(s.issuedAt)) : 24 * 3600_000;
  });
  /** Share of the signature's validity still left, for the bar on D-4c. */
  protected readonly leftPct = computed(() => Math.round((this.leftMs() / this.validMs()) * 100));
  /** Countdown ring: 352 ≈ circumference of r=56. */
  protected readonly ringDash = computed(() => `${Math.round((this.leftMs() / this.validMs()) * 352)} 352`);
  protected readonly callSummary = computed(() => {
    const s = this.sig();
    if (!s) return '';
    if (s.method !== 'eshs') return '· e-İmzanız doğrulandı · taahhütname belgelerinize eklendi';
    return `· 5/5 adım · ${clock(DURATION.call / this.store.speed())} dk · tutanak belgelerinize eklendi`;
  });

  /** D-4c: "Kuruluş belgelerimin bu e-imza ile imzalanmasını onaylıyorum." The API checks it too. */
  protected readonly signConfirm = signal(false);

  protected startSetup() {
    void this.store.startSetup(this.signConfirm());
  }

  // ---------------------------------------------------------------- D-4d T.C. citizen

  protected readonly method = signal<'existing' | 'edevlet'>('existing');
  protected readonly resident = computed(() => {
    const a = this.store.app();
    return a ? `${a.founder.firstName} ${a.founder.lastName}` : '';
  });

  /**
   * D-4d: the chosen e-signature is verified; the founder then confirms the signing on D-4c like
   * everyone else. (Until 2026-11-17 this also started the formation at once.)
   */
  protected signResident() {
    void this.store.signResident(this.method());
  }

  /**
   * HTTP mode: the provider is verifying (or issuing) the resident's e-signature. The API reports
   * `calling` while its e-signature work item is open, though a resident has no call; D-4d shows a
   * waiting state and the page polls until `signed`. Which method was chosen is not in the view.
   * Also while the page gives way after `signed` arrived, so the choice does not flash back for a frame.
   */
  protected readonly verifying = computed(() => {
    const stage = this.store.app()?.stage;
    return stage === 'calling' || (this.serverDecides && !!stage && stage !== 'signing');
  });

  // ---------------------------------------------------------------------- D-5a setup

  /**
   * The picture, and the seven heights in it, in % of its height from the top: the ground line,
   * then the top of the slab above each of the six floors (the last is the top of the picture,
   * so the roof and its sign come with the sixth floor). Measured from the file; measure again
   * when the picture is replaced (art/README.md, "Building scene").
   */
  private static readonly BUILDING = { src: '/assets/illustrations/building.webp', levels: [97.9, 79.9, 66.4, 52.6, 38.2, 23.2, 0] };
  protected readonly building = SignatureData.BUILDING;

  /**
   * D-5a's illustration: a six-storey building, cut open, that rises as the company is founded.
   * The six agency steps that run on this screen (AGENCIES 4 to 9; the first three were finished
   * in earlier steps) are its six floors, from the ground up, and each floor shows a small scene
   * for its step: registry, tax office, financial seal, bank, social security and e-ledger,
   * accountant. The picture (generated by the owner, 2026-11-17) is shown twice: faint and
   * dotted as the plan, and in full up to the height built so far. While a step runs its floor
   * fills in from its own floor line to the slab above it. No step names appear on it.
   * (Before this the owner rejected a drawn "seal sheet", a take-off scene and a plain facade.)
   */
  protected readonly rise = computed(() => {
    if (this.serverDecides) return this.serverRise();
    const v = this.store.setup();
    const lens = AGENCIES.slice(3).map((a) => a.subs.length);
    // The height follows time, not finished sub-steps: where the run stands among all its sub-steps,
    // as a fraction, so the building rises without jumps at any demo speed.
    let pos = (v?.p ?? 0) * lens.reduce((s, n) => s + n, 0);
    let floor = 0;
    while (floor < 6 && pos >= lens[floor]) pos -= lens[floor++];
    const lv = SignatureData.BUILDING.levels;
    return {
      /** Floors finished: the count on the picture. Equals the agency steps finished. */
      done: floor,
      top: floor >= 6 ? lv[6] : lv[floor] + (pos / lens[floor]) * (lv[floor + 1] - lv[floor]),
      finished: floor >= 6,
    };
  });
  /**
   * HTTP mode: the building stands at the number of formation steps (4 to 9) the server reports
   * completed, a whole floor each; nothing rises with time. The floors stand for a count, not for a
   * particular step: on the server several steps run side by side.
   */
  private readonly serverRise = computed(() => {
    const steps = this.runSteps();
    const done = Math.min(6, steps.filter((s) => s.status === 'completed').length);
    const finished = this.store.stage() === 'done' || (steps.length > 0 && done >= steps.length);
    const lv = SignatureData.BUILDING.levels;
    return { done: finished ? 6 : done, top: lv[finished ? 6 : done], finished };
  });

  /** HTTP mode: the server's steps; undefined in the mock, null while the server has not created them. */
  protected readonly serverSteps = computed<SetupStep[] | null | undefined>(() => this.store.app()?.setup?.steps);
  /** HTTP mode, stage `setup`, no steps yet: "hazırlanıyor". */
  protected readonly preparing = computed(() => this.serverDecides && this.serverSteps() == null);
  /** The steps of the formation run itself (4 to 9); 1 to 3 were finished in the earlier wizard steps. */
  private readonly runSteps = computed(() => (this.serverSteps() ?? []).filter((s) => s.no >= 4).sort((a, b) => a.no - b.no));

  /** How long D-5a stays after the sixth floor is finished, in ms: long enough for the finishing moment below. */
  private static readonly FINISHED_HOLD = 3600;

  /**
   * The finishing moment's parts, drawn over the picture once the sixth floor is done (the order
   * and timing are in wizard.scss, "finishing moment"): a band of light for each floor, running
   * up the building, and a burst of paper from the roof in the picture's own colours.
   */
  protected readonly floorBands = SignatureData.BUILDING.levels.slice(0, 6).map((bottom, i) => ({ i, top: SignatureData.BUILDING.levels[i + 1], height: bottom - SignatureData.BUILDING.levels[i + 1] }));
  protected readonly confetti = Array.from({ length: 40 }, (_, i) => {
    // The same burst every time: a fixed pseudo-random spread, not Math.random.
    const r = (n: number) => {
      const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return {
      dx: Math.round((r(1) - 0.5) * 560),
      up: Math.round(40 + r(2) * 110),
      fall: Math.round(170 + r(3) * 220),
      rot: Math.round((r(4) - 0.5) * 1080),
      delay: (0.95 + r(5) * 0.22).toFixed(2) + 's',
      dur: (1.5 + r(6) * 0.9).toFixed(2) + 's',
      w: Math.round(5 + r(7) * 4),
      h: i % 4 === 0 ? Math.round(5 + r(7) * 4) : Math.round(9 + r(8) * 6),
      round: i % 4 === 0,
      color: ['#061262', '#9DB6FF', '#C7D5F7', '#E5484D', '#4F7CF0'][i % 5],
    };
  });
  /** "Detayı gör": the full list of steps and sub-steps under the illustration. */
  protected readonly listOpen = signal(this.store.serverDecides);

  protected readonly agency = computed(() => {
    if (this.serverDecides) return this.serverAgency();
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
        label: done ? 'Tamamlandı' : isCur ? 'İşlemde' : 'Sırada',
        bg: isCur ? 'var(--bg-F7F9FE)' : 'transparent',
        weight: isCur ? 600 : 500,
        color: done || isCur ? 'var(--fg-061262)' : 'var(--fg-5B6478)',
      };
    });
  });

  /**
   * HTTP mode: the rows of D-5a's list are the server's nine steps with their own titles and states.
   * The server leaves a step `pending` until one of its tasks is completed, even while a task is
   * already with the institution, so a step counts as running ("İşlemde") when the server says so or
   * when one of its tasks has started. No institution line under the title: the API sends none.
   */
  private readonly serverAgency = computed(() =>
    (this.serverSteps() ?? []).map((st) => {
      const done = st.status === 'completed';
      const cur = !done && (st.status === 'in_progress' || st.tasks.some((t) => t.status === 'waiting' || t.status === 'in_progress' || t.status === 'done'));
      const held = !done && !cur && st.status === 'other';
      return {
        n: String(st.no).padStart(2, '0'),
        t: st.title,
        ag: '',
        done,
        cur,
        up: !done && !cur,
        label: done ? 'Tamamlandı' : cur ? 'İşlemde' : held ? 'Beklemede' : 'Sırada',
        bg: cur ? 'var(--bg-F7F9FE)' : 'transparent',
        weight: cur ? 600 : 500,
        color: done || cur ? 'var(--fg-061262)' : 'var(--fg-5B6478)',
      };
    }),
  );

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

  /** Agency steps finished so far (HTTP mode: the server's completed steps). */
  protected readonly doneCount = computed(() =>
    this.serverDecides ? (this.serverSteps() ?? []).filter((s) => s.status === 'completed').length : Math.min(this.store.setup()?.agency ?? 0, AGENCIES.length),
  );

  /** "Belgeleri görüntüle" / "İşlem kaydını görüntüle": open that view in the side panel. */
  protected showPanel(tab: 'docs' | 'log') {
    this.assistant.show(tab);
  }

  protected readonly detailsOpen = signal(this.store.serverDecides);
  /** "Alt adımları göster (12 / 34)": sub-steps finished and in all (HTTP mode: the server's tasks; an exempt one counts as finished). */
  protected readonly subCount = computed(() => {
    if (!this.serverDecides) return { done: this.store.setup()?.done ?? 0, total: AGENCIES.reduce((s, a) => s + a.subs.length, 0) };
    const tasks = (this.serverSteps() ?? []).flatMap((s) => s.tasks);
    return { done: tasks.filter((t) => t.status === 'done' || t.status === 'exempt').length, total: tasks.length };
  });

  /** Sub-steps of the agencies still running or queued (shown under "Detayları göster"). */
  protected readonly details = computed(() => {
    if (this.serverDecides) return this.serverDetails();
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

  /** HTTP mode: the tasks of steps 4 to 9 as the server reports them; `waiting` reads "kurumda bekliyor". */
  private readonly serverDetails = computed(() =>
    this.runSteps().map((st) => ({
      n: String(st.no).padStart(2, '0'),
      t: st.title,
      subs: st.tasks.map((task) => {
        const [i, ic, color] = TASK_LOOK[task.status];
        return { i, ic, color, t: task.title + TASK_NOTE[task.status], exempt: task.status === 'exempt', deco: task.status === 'exempt' ? 'line-through' : 'none' };
      }),
    })),
  );

  /**
   * HTTP mode, D-5a: the company's numbers that have arrived so far (each comes when staff complete the
   * institution task that issues it), and on D-5b all of them. Only what the API sent.
   */
  protected readonly arrived = computed(() => {
    const r = this.store.app()?.results;
    if (!r) return [];
    return [
      { k: 'MERSİS no', v: r.mersis },
      { k: 'Ticaret sicili tescil no', v: r.registryNo },
      { k: 'Vergi kimlik no', v: r.vkn },
      { k: 'Vergi dairesi', v: r.taxOffice },
      { k: 'IBAN', v: r.iban },
      { k: 'e-Fatura kayıt no', v: r.eInvoiceNo },
      { k: 'SGK işyeri sicil no', v: r.sgkNo },
    ].filter((x): x is { k: string; v: string } => !!x.v);
  });

  // ------------------------------------------------------------------------ D-5b done

  protected readonly doneLine = computed(() => {
    const a = this.store.app();
    if (!a?.setup?.finishedAt) return '';
    const mins = Math.max(1, Math.round((Date.parse(a.setup.finishedAt) - Date.parse(a.setup.startedAt)) / 60_000));
    return `${AGENCIES.length}/${AGENCIES.length} KURUM ADIMI TAMAMLANDI · ${mins} DK`;
  });
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
      const mono = "600 18px/24px 'IBM Plex Mono',monospace";
      return [
        { k: 'Vergi kimlik no', v: r.vkn, s: r.taxOffice ?? '', a: 'Kopyala', font: mono },
        { k: 'MERSİS no', v: r.mersis, s: r.registryNo ? `Ticaret sicili tescil no ${r.registryNo}` : '', a: 'Kopyala', font: mono },
        { k: 'IBAN', v: r.iban, s: '', a: 'Kopyala', font: "600 16px/24px 'IBM Plex Mono',monospace" },
        { k: 'e-Fatura kayıt no', v: r.eInvoiceNo, s: '', a: 'Kopyala', font: mono },
        { k: 'SGK işyeri sicil no', v: r.sgkNo, s: '', a: 'Kopyala', font: "600 15px/24px 'IBM Plex Mono',monospace" },
      ].filter((x): x is typeof x & { v: string } => !!x.v);
    }
    const blocked = tl0((this.store.app()?.company.capital ?? 250_000) * 0.25);
    return [
      { k: 'Vergi kimlik no', v: r.vkn ?? '', s: r.taxOffice ?? '', a: 'Kopyala', font: "600 18px/24px 'IBM Plex Mono',monospace" },
      { k: 'MERSİS no', v: r.mersis ?? '', s: 'Ticaret sicili tescil edildi', a: 'Kopyala', font: "600 18px/24px 'IBM Plex Mono',monospace" },
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

  /** Mock only: the browser-made placeholder documents as one ZIP. Never offered in HTTP mode. */
  protected downloadAll() {
    saveBytes(this.store.documentsZip(), `${this.store.title().replace(/\s+/g, '-')}-belgeler.zip`, 'application/zip');
  }

  /** Mock only: sends a demo e-mail to the Inbox. Hidden in HTTP mode. */
  protected openPanel() {
    this.inbox.send({ kind: 'mail', from: 'no-reply@dijitalsirket.gov.tr', title: 'Şirket paneliniz hazırlanıyor', body: `${this.store.fullTitle()} paneline erişim bilgileri birkaç dakika içinde e-postanıza gönderilecek.` });
  }
}

/** How each server task state looks in D-5a's sub-step list: [mark, mark colour, text colour]. */
const TASK_LOOK: Record<SetupTask['status'], [string, string, string]> = {
  done: ['✓', 'var(--fg-15803D)', 'var(--fg-1F2A44)'],
  waiting: ['›', 'var(--fg-061262)', 'var(--fg-061262)'],
  in_progress: ['›', 'var(--fg-061262)', 'var(--fg-061262)'],
  pending: ['·', 'var(--fg-8A93A6)', 'var(--fg-5B6478)'],
  exempt: ['–', 'var(--fg-8A93A6)', 'var(--fg-5B6478)'],
  other: ['·', 'var(--fg-8A93A6)', 'var(--fg-5B6478)'],
};

/** What follows a server task's title in that list. */
const TASK_NOTE: Record<SetupTask['status'], string> = {
  done: '',
  waiting: ' · kurumda bekliyor',
  in_progress: ' · işlemde',
  pending: ' · sırada',
  exempt: '',
  other: ' · beklemede',
};
