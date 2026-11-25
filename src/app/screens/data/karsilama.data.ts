import { computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ApplicationStore } from '../../core/application.store';
import { followFlow } from '../../core/follow';
import { tl0 } from '../../core/format';
import { DECK_CONSENT_ERROR, deckFileError, FUNDING_OPTIONS } from '../../core/rules';
import { CAPITAL, CrossKey, FUNDING_LABELS, FundingSource, Profile, Sector, SECTORS } from '../../core/models';
import { companyPurpose, naceName, searchNace } from '../../core/nace';

type CardId = 'founder' | 'contact' | 'funding';
/** What the pencil on a row of the confirm screen opens. */
type Editor = 'title' | 'nace' | CardId;
/** One-line explanation under each funding option in the picker. */
const FUNDING_HINTS: Record<string, string> = {
  'own-abroad': 'Kendi adınıza yurt dışındaki bir hesaptan',
  'own-turkey': 'Türkiye’de kendi adınıza açılmış bir hesaptan',
  investor: 'Yatırım sözleşmesiyle gelen sermaye',
  'third-party': 'Başka bir kişi veya şirketten · uyum ekibi elle inceler',
};

/** One line under each activity area in the D-1e picker. */
const SECTOR_HINTS: Record<Sector, string> = {
  software: 'Yazılım, veri işleme ve bulut hizmetleri',
  ecommerce: 'İnternet üzerinden ürün veya hizmet satışı',
  consulting: 'İşletme ve yönetim danışmanlığı',
  design: 'Tasarım, reklam ve iletişim',
  education: 'Eğitim ve kurs hizmetleri',
  other: 'Yukarıdakilerin dışında bir alan',
};

type ProfileDraft = Omit<Profile, 'at' | 'sector' | 'funding'> & { sector: Sector | ''; funding: FundingSource | '' };

/** Which review row a compared item stands for, so that a difference is not also listed as "kontrol edilmesi gereken". */
const CROSS_ROW: Record<CrossKey, string> = { brand: 'title', sector: 'nace', funding: 'funding', nationality: 'nationality', phone: 'phone', country: 'address' };

interface EditField {
  key: string;
  label: string;
  value: string;
  options?: { value: string; label: string; hint?: string }[];
  wide?: boolean;
  /** Rich control instead of a plain text box. */
  kind?: 'country' | 'phone' | 'select';
}

/** Welcome and step 1 — pitch deck upload, AI scan, review, MERSİS title conflict (Ekranlar 1). */
export class KarsilamaData {
  protected readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);

  constructor() {
    this.store.clearError();
    followFlow();
    // Once both ticks are given, the message asking for them has done its job.
    effect(() => {
      if (this.consentsGiven() && untracked(this.fileError) === DECK_CONSENT_ERROR) this.fileError.set(null);
    });
  }

  // --------------------------------------------------------------------------- D-00 welcome

  /** Primary CTA: continue an application, or start one. */
  protected start() {
    void this.router.navigateByUrl(this.store.signedIn() ? this.store.resumeRoute() : '/register');
  }

  protected readonly samples = [
    { k: '01', t: 'Şirket ve faaliyet', d: 'Şirket adı, ürün veya hizmetiniz, faaliyet alanınız.' },
    { k: '02', t: 'Kurucu bilgileri', d: 'Adınız, uyruğunuz ve pay sahipliği yapısı.' },
    { k: '03', t: 'İletişim ve fon kaynağı', d: 'E-posta, telefon, adres ve sermayenin kaynağı.' },
  ];

  // --------------------------------------------------------------------------- D-1e profile

  protected readonly sectorOptions = (Object.keys(SECTORS) as Sector[]).map((v) => ({ value: v, label: SECTORS[v].label, hint: SECTOR_HINTS[v] }));
  protected readonly founderName = computed(() => {
    const a = this.store.app();
    return a ? `${a.founder.firstName} ${a.founder.lastName}`.trim() : '';
  });
  /** True when the founder came back to change a profile they saved before. */
  protected readonly profileSaved = computed(() => !!this.store.app()?.profile);
  /** Starts from what was saved before, when the founder comes back to change it. */
  protected readonly profileDraft = signal<ProfileDraft>(
    (() => {
      const p = this.store.app()?.profile;
      return p
        ? { brand: p.brand, sector: p.sector, funding: p.funding, nationality: p.nationality, phone: p.phone, country: p.country }
        : { brand: '', sector: '', funding: '', nationality: '', phone: '', country: '' };
    })(),
  );
  protected readonly profileReady = computed(() => {
    const p = this.profileDraft();
    const digits = p.phone.replace(/\D/g, '').length;
    return p.brand.trim().length >= 2 && !!p.sector && !!p.funding && !!p.nationality && !!p.country && digits >= 8 && digits <= 15;
  });

  protected setProfile(key: keyof ProfileDraft, value: string) {
    this.profileDraft.update((p) => ({ ...p, [key]: value }));
  }

  /** Saving moves the stage to `verified`, which this screen also shows, so the move to D-1a is made here. */
  protected async submitProfile() {
    const p = this.profileDraft();
    if (!p.sector || !p.funding) return;
    if (await this.store.submitProfile({ ...p, sector: p.sector, funding: p.funding })) void this.router.navigateByUrl('/deck');
  }

  /**
   * Demo: values for the downloadable sample deck (Lumora Analytics). The phone number differs from
   * the one on the deck's contact page on purpose, so that D-1c shows how a difference is decided.
   */
  protected useSampleProfile() {
    this.profileDraft.set({ brand: 'Lumora Analytics', sector: 'software', funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya' });
  }

  // ---------------------------------------------------------------------------- D-1a upload

  protected readonly dragging = signal(false);
  protected readonly fileError = signal<string | null>(null);
  /**
   * The two ticks the upload needs. They start unticked on every screen and are sent with this one
   * upload only; "Başka dosya yükle" on D-1c asks for them again (the API records both per upload).
   */
  protected readonly noticeAcknowledged = signal(false);
  protected readonly aiConsent = signal(false);
  protected readonly consentsGiven = computed(() => this.noticeAcknowledged() && this.aiConsent());
  /** D-1c: the re-upload panel with its own ticks is open. */
  protected readonly reuploadOpen = signal(false);

  /** Opens the file picker only after both ticks; otherwise says what is missing. */
  protected pickFile(input: HTMLInputElement) {
    if (!this.consentsGiven()) return this.fileError.set(DECK_CONSENT_ERROR);
    this.fileError.set(null);
    input.click();
  }

  /** D-1c "Başka dosya yükle": opens the panel with both ticks cleared. */
  protected openReupload() {
    this.noticeAcknowledged.set(false);
    this.aiConsent.set(false);
    this.fileError.set(null);
    this.reuploadOpen.set(!this.reuploadOpen());
  }

  protected onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) void this.upload(f);
  }

  protected onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) void this.upload(f);
  }

  protected onDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(true);
  }

  private async upload(f: File) {
    if (!this.consentsGiven()) return this.fileError.set(DECK_CONSENT_ERROR);
    const error = deckFileError(f);
    if (error) return this.fileError.set(error);
    this.fileError.set(null);
    await this.store.uploadDeck(f, { noticeAcknowledged: this.noticeAcknowledged(), aiConsent: this.aiConsent() });
  }

  // ------------------------------------------------------------------------------ D-1b scan

  protected readonly scanFile = computed(() => this.store.app()?.deck?.fileName ?? '');

  protected readonly thumbs = computed(() => {
    const s = this.store.scan();
    const pages = s?.pages ?? 12;
    const curPage = s?.page ?? 1;
    return Array.from({ length: pages }, (_, i) => {
      const n = i + 1;
      const done = n < curPage;
      const cur = n === curPage;
      return {
        label: n,
        cur,
        op: done || cur ? 1 : 0.6,
        border: done ? 'var(--bd-86CFA0)' : cur ? 'var(--bd-061262)' : 'var(--bd-E5E7EB)',
        bg: done ? 'var(--bg-F0FDF4)' : cur ? 'var(--bg-F7F9FE)' : 'var(--bg-FAFBFD)',
        ink: done ? 'var(--bg-86CFA0)' : cur ? 'var(--bg-061262)' : 'var(--bg-DDE3EE)',
        ink2: done ? 'var(--bg-BBE5C8)' : cur ? 'var(--bg-C7D5F7)' : 'var(--bg-E8ECF3)',
        num: done ? 'var(--fg-15803D)' : cur ? 'var(--fg-061262)' : 'var(--fg-8A93A6)',
      };
    });
  });

  protected readonly scanFields = computed(() => {
    const fields = this.store.app()?.deck?.fields ?? [];
    const shown = this.store.scan()?.shown ?? 0;
    return fields.map((f, i) => {
      const done = i < shown;
      return { k: f.label, v: f.value, p: f.page ? `s. ${f.page}` : '…', done, pending: !done, op: done ? 1 : 0.7 };
    });
  });

  /** The company's logo and name as found in the deck (shown once the title has been read). */
  protected readonly brand = computed(() => {
    const c = this.store.app()?.company;
    return { name: c?.deckName ?? '', logo: c?.logo ?? '', initials: (c?.deckName ?? '').slice(0, 1).toLocaleUpperCase('tr-TR') };
  });
  protected readonly scanPages = computed(() => this.store.scan()?.pages ?? 0);

  /** The logo on the confirm screen can be replaced with the founder's own image file. */
  protected onLogoInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) return this.store.error.set('Logo için PNG, JPEG, SVG veya WebP biçiminde bir görsel seçiniz.');
    // The mock keeps the image in localStorage, so it has to stay small.
    if (f.size > 500 * 1024) return this.store.error.set('Görsel 500 KB’tan büyüktür. Daha küçük bir dosya seçiniz.');
    const reader = new FileReader();
    reader.onload = () => void this.store.updateReview({ company: { logo: String(reader.result) } }, []);
    reader.readAsDataURL(f);
  }

  // ---------------------------------------------------------------------------- D-1c review

  protected readonly companyOpen = signal(true);
  protected readonly fixedOpen = signal(true);
  protected readonly naceQuery = signal('');
  protected readonly openCard = signal<CardId | null>(null);
  protected readonly draft = signal<Partial<Record<string, string>>>({});
  private readonly deckInput = signal<HTMLInputElement | null>(null);

  protected readonly marks = computed(() => this.store.app()?.marks ?? {});
  protected readonly checkCount = computed(() => Object.values(this.marks()).filter((m) => m === 'check').length);
  protected readonly editedCount = computed(() => ['title', 'nace'].filter((k) => this.marks()[k] === 'edited').length);
  protected readonly reviewHint = computed(() => {
    const m = this.marks();
    const checks = [m['funding'] === 'check' && 'fon kaynağını', m['phone'] === 'check' && 'telefon numarasını'].filter(Boolean) as string[];
    return checks.length
      ? {
          title: `${checks.join(' ve ').replace(/^./, (c) => c.toLocaleUpperCase('tr-TR'))} kontrol edin`,
          reason: [m['funding'] === 'check' && 'Fon kaynağı sunumda dolaylı ifade edilmiş (s. 10)', m['phone'] === 'check' && 'telefonun ülke kodu tahmin edildi (s. 12)'].filter(Boolean).join('; ') + '.',
        }
      : { title: 'Sunumunuzdaki bilgiler eksiksiz okundu', reason: 'Unvan önerimi ve faaliyet kodlarını gözden geçirin; her şey doğruysa devam edebilirsiniz.' };
  });
  protected readonly founderLabel = computed(() => (this.store.founderType() === 'resident' ? '◍ T.C. vatandaşı kurucu' : '◍ Yabancı kurucu'));

  protected setTitle(value: string) {
    const [root = '', ...rest] = value.replace(/\s+(A\.Ş\.|Anonim Şirketi)$/i, '').trim().split(/\s+/);
    void this.store.updateReview({ company: { root, activity: rest.join(' ') } }, ['title']);
  }

  protected readonly nameSugs = computed(() => {
    const root = this.store.app()?.company.root || 'Şirket';
    const current = this.store.title();
    return [
      [root, 'Bulut Bilişim'],
      [root, 'Yazılım ve Bulut Hizmetleri'],
      [`${root}way`, 'Bilişim Teknolojileri'],
    ].map(([r, act]) => {
      const on = `${r} ${act}` === current;
      return { root: r, act, full: `${r} ${act}`, border: on ? 'var(--bd-061262)' : 'var(--bd-D6DEEE)', bg: on ? 'var(--bg-EFF4FF)' : 'var(--bg-FFFFFF)' };
    });
  });

  protected readonly naceChips = computed(() => (this.store.app()?.company.nace ?? []).map((code) => ({ code, name: naceName(code) })));

  protected readonly naceOptions = computed(() => {
    const c = this.store.app()?.company;
    if (!c) return [];
    const q = this.naceQuery();
    if (q.trim()) return searchNace(q, c.nace).map((o) => ({ ...o, ai: false }));
    const suggested = c.suggestedNace.filter((x) => !c.nace.includes(x)).map((code) => ({ code, name: naceName(code), ai: true }));
    const related = ['63.12', '62.09'].filter((x) => !c.nace.includes(x) && !c.suggestedNace.includes(x)).map((code) => ({ code, name: naceName(code), ai: false }));
    return [...suggested, ...related].slice(0, 3);
  });

  protected readonly purpose = computed(() => companyPurpose(this.store.app()?.company.nace ?? []));

  protected addNace(code: string) {
    const c = this.store.app()!.company;
    if (c.nace.includes(code)) return;
    this.naceQuery.set('');
    void this.store.updateReview({ company: { nace: [...c.nace, code] } }, ['nace']);
  }

  protected removeNace(code: string) {
    const c = this.store.app()!.company;
    void this.store.updateReview({ company: { nace: c.nace.filter((x) => x !== code) } }, ['nace']);
  }

  protected readonly fixed = computed(() => [
    { k: 'Şirket türü', v: 'Tek pay sahipli anonim şirket' },
    { k: 'Sermaye', v: `${tl0(this.store.app()?.company.capital ?? CAPITAL)} · %25'i banka hesabında bloke edilir` },
    { k: 'Merkez adresi', v: 'Terminal İstanbul sanal ofisi · Muallimköy Mah. Deniz Cad. No:143/6, Gebze / Kocaeli' },
  ]);

  /** The three summary cards below the company card, each editable inline. */
  protected readonly collapsedCards = computed(() => {
    const a = this.store.app();
    if (!a) return [];
    const m = a.marks;
    const card = (id: CardId, t: string, keys: string[], s: string, fields: EditField[]) => {
      const warnN = keys.filter((k) => m[k] === 'check').length;
      const edited = keys.some((k) => m[k] === 'edited');
      return { id, t, ok: warnN === 0, okText: edited ? '✎ Düzenlendi' : '✓ AI okudu', warn: warnN > 0, warnText: `${warnN} alanı kontrol ediniz`, s, open: this.openCard() === id, fields };
    };
    return [
      card('founder', 'Kurucu', ['name'], `${a.founder.firstName} ${a.founder.lastName} · ${a.founder.nationality || '—'} · Kimlik 2. adımda doğrulanır`, [
        { key: 'firstName', label: 'Ad', value: a.founder.firstName },
        { key: 'lastName', label: 'Soyad', value: a.founder.lastName },
        { key: 'nationality', label: 'Uyruk', value: a.founder.nationality, wide: true, kind: 'country' },
      ]),
      card('contact', 'İletişim ve adres', ['phone', 'address', 'email'], [a.contact.email, a.contact.phone, `${a.contact.address} ${a.contact.postalCode}, ${a.contact.country}`].filter((x) => x.trim()).join(' · '), [
        { key: 'email', label: 'E-posta', value: a.contact.email },
        { key: 'phone', label: 'Telefon', value: a.contact.phone, kind: 'phone' },
        { key: 'address', label: 'Adres', value: a.contact.address, wide: true },
        { key: 'postalCode', label: 'Posta kodu', value: a.contact.postalCode },
        { key: 'country', label: 'Ülke', value: a.contact.country, kind: 'country' },
      ]),
      card('funding', 'Fon kaynağı', ['funding'], FUNDING_LABELS[a.funding], [
        { key: 'funding', label: 'Sermaye nereden geliyor?', value: a.funding, wide: true, kind: 'select', options: FUNDING_OPTIONS.map((v) => ({ value: v, label: FUNDING_LABELS[v], hint: FUNDING_HINTS[v] })) },
      ]),
    ];
  });

  protected toggleCard(id: CardId) {
    const open = this.openCard() === id ? null : id;
    this.openCard.set(open);
    const c = this.collapsedCards().find((x) => x.id === id);
    this.draft.set(Object.fromEntries((c?.fields ?? []).map((f) => [f.key, f.value])));
  }

  protected setDraftValue(key: string, v: string) {
    this.draft.update((d) => ({ ...d, [key]: v }));
  }

  protected setDraft(key: string, e: Event) {
    const v = (e.target as HTMLInputElement | HTMLSelectElement).value;
    this.draft.update((d) => ({ ...d, [key]: v }));
  }

  protected async saveCard(id: CardId) {
    const d = this.draft();
    const ok =
      id === 'founder'
        ? await this.store.updateReview({ founder: { firstName: d['firstName'], lastName: d['lastName'], nationality: d['nationality'] } }, ['name'])
        : id === 'contact'
          ? await this.store.updateReview({ contact: { email: d['email'], phone: d['phone'], address: d['address'], postalCode: d['postalCode'], country: d['country'] } }, ['phone', 'address', 'email'])
          : await this.store.updateReview({ funding: d['funding'] as FundingSource }, ['funding']);
    if (ok) this.openCard.set(null);
    return ok;
  }

  // ------------------------------------------------ D-1c in the Odak layout (flat rows)

  /** Which editor is open under the rows; one at a time. */
  protected readonly editor = signal<Editor | null>(null);
  /** Values typed into the "kontrol edilmesi gereken" block before they are saved. */
  protected readonly flagDraft = signal<Partial<Record<string, string>>>({});

  /**
   * Every piece of information on the confirm screen as one row: what it is, its value, which
   * editor its pencil opens (none for fixed facts) and whether the scan flagged it for checking.
   */
  protected readonly rows = computed(() => {
    const a = this.store.app();
    if (!a) return [];
    const m = a.marks;
    const name = `${a.founder.firstName} ${a.founder.lastName}`.trim();
    const row = (key: string, label: string, value: string, edit: Editor | null, mark = key, raw = value) => ({
      key, label, value: value || '—', raw, edit, flag: m[mark] === 'check', edited: m[mark] === 'edited',
    });
    return [
      row('title', 'Şirket unvanı', this.store.fullTitle(), 'title'),
      row('name', 'Kurucu', name, 'founder'),
      row('nace', 'Faaliyet', (a.company.nace ?? []).map((c) => naceName(c)).join(', '), 'nace'),
      row('nationality', 'Uyruk', a.founder.nationality, 'founder', 'name'),
      row('type', 'Şirket türü', 'Tek pay sahipli anonim şirket', null),
      row('share', 'Pay sahipliği', `%100, ${name}`, null),
      row('capital', 'Sermaye', tl0(a.company.capital ?? CAPITAL), null),
      row('funding', 'Sermaye kaynağı', FUNDING_LABELS[a.funding], 'funding', 'funding', a.funding),
      row('email', 'E-posta', a.contact.email, 'contact'),
      row('phone', 'Telefon', a.contact.phone, 'contact'),
      row('address', 'Adres', [a.contact.address, a.contact.postalCode, a.contact.country].filter((x) => x?.trim()).join(', '), 'contact', 'address', a.contact.address),
      row('office', 'Merkez adresi', 'Terminal İstanbul sanal ofisi, Gebze / Kocaeli', null),
    ];
  });
  protected readonly okRows = computed(() => this.rows().filter((r) => !r.flag));
  /** Flagged rows, less those already asked about as a difference from the profile. */
  protected readonly flagRows = computed(() => {
    const asked = new Set(this.crossOpen().map((c) => CROSS_ROW[c.key]));
    return this.rows().filter((r) => r.flag && !asked.has(r.key));
  });

  // ------------------------------------------- D-1c: the profile (D-1e) compared with the deck

  protected readonly cross = computed(() => this.store.app()?.crossCheck ?? []);
  protected readonly crossMatched = computed(() => this.cross().filter((c) => c.match));
  /** Differences, each with the deck page its value was read from. */
  protected readonly crossDiffs = computed(() => {
    const fields = this.store.app()?.deck?.fields ?? [];
    const field: Record<CrossKey, string> = { brand: 'title', sector: 'nace', funding: 'funding', nationality: 'nationality', phone: 'phone', country: 'postal' };
    return this.cross()
      .filter((c) => !c.match)
      .map((c) => ({ ...c, page: fields.find((f) => f.key === field[c.key])?.page ?? null }));
  });
  /** Differences still waiting for the founder's choice; the review cannot be submitted while any remain. */
  protected readonly crossOpen = computed(() => this.crossDiffs().filter((c) => !c.choice));

  protected resolveCross(key: CrossKey, choice: 'stated' | 'read') {
    void this.store.resolveCrossCheck(key, choice);
  }

  protected readonly fundingOptions = FUNDING_OPTIONS.map((v) => ({ value: v, label: FUNDING_LABELS[v], hint: FUNDING_HINTS[v] }));

  /** The founder / contact / funding form shown when that editor is open. */
  protected readonly editorCard = computed(() => this.collapsedCards().find((c) => c.id === this.editor()) ?? null);

  protected openEditor(e: Editor | null) {
    if (!e || this.editor() === e) return this.editor.set(null);
    this.editor.set(e);
    const card = this.collapsedCards().find((c) => c.id === e);
    if (card) this.draft.set(Object.fromEntries(card.fields.map((f) => [f.key, f.value])));
  }

  protected async saveEditor() {
    const e = this.editor();
    if (e && e !== 'title' && e !== 'nace' && (await this.saveCard(e))) this.editor.set(null);
  }

  protected setFlag(key: string, v: string) {
    this.flagDraft.update((d) => ({ ...d, [key]: v }));
  }

  /** Saves the values in the "kontrol edilmesi gereken" block; saving a flagged value clears its flag. */
  protected async saveFlags() {
    const d = this.flagDraft();
    const rows = this.flagRows();
    const val = (key: string) => d[key] ?? rows.find((r) => r.key === key)?.raw;
    const has = (key: string) => rows.some((r) => r.key === key);
    const contact = { ...(has('phone') ? { phone: val('phone') } : {}), ...(has('address') ? { address: val('address') } : {}), ...(has('email') ? { email: val('email') } : {}) };
    const ok = await this.store.updateReview(
      { ...(Object.keys(contact).length ? { contact } : {}), ...(has('funding') ? { funding: val('funding') as FundingSource } : {}) },
      rows.map((r) => r.key).filter((k) => ['phone', 'address', 'email', 'funding'].includes(k)),
    );
    if (ok) this.flagDraft.set({});
  }

  /** "Başka sunum": pick a new deck and scan again. */
  protected registerDeckInput(el: HTMLInputElement) {
    this.deckInput.set(el);
  }

  protected chooseOtherDeck() {
    this.deckInput()?.click();
  }

  protected submitReview() {
    void this.store.submitReview();
  }

  // ---------------------------------------------------------------------- D-1d MERSİS ret

  protected readonly titleCheck = computed(() => this.store.app()?.titleCheck);
  protected readonly alternatives = computed(() =>
    (this.titleCheck()?.alternatives ?? []).map((t, i) => {
      const words = t.split(' ');
      return { full: t, head: words.slice(0, -1).join(' '), tail: words.at(-1)!, first: i === 0 };
    }),
  );
  protected readonly customOpen = signal(false);
  protected readonly customTitle = signal('');

  protected chooseTitle(t: string) {
    if (!t.trim()) return;
    void this.store.chooseTitle(t);
  }

  protected editAgain() {
    void this.store.backToReview();
  }

  protected readonly collapsedOk = computed(() => {
    const a = this.store.app();
    if (!a) return [];
    return [
      { t: 'Kurucu', s: `${a.founder.firstName} ${a.founder.lastName} · ${a.founder.nationality}` },
      { t: 'İletişim ve adres', s: `${a.contact.email} · ${a.contact.phone} · ${a.contact.address}` },
      { t: 'Fon kaynağı', s: FUNDING_LABELS[a.funding] },
    ];
  });
}
