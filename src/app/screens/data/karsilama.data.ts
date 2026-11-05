import { computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApplicationStore } from '../../core/application.store';
import { followFlow } from '../../core/follow';
import { tl0 } from '../../core/format';
import { FUNDING_OPTIONS } from '../../core/mock-api';
import { CAPITAL, FUNDING_LABELS, FundingSource } from '../../core/models';
import { companyPurpose, naceName, searchNace } from '../../core/nace';

const ACCEPT = /\.(pdf|pptx|key)$/i;
const MAX_BYTES = 50 * 1024 * 1024;

type CardId = 'founder' | 'contact' | 'funding';
/** One-line explanation under each funding option in the picker. */
const FUNDING_HINTS: Record<string, string> = {
  'own-abroad': 'Kendi adınıza yurt dışındaki bir hesaptan',
  'own-turkey': 'Türkiye’de kendi adınıza açılmış bir hesaptan',
  investor: 'Yatırım sözleşmesiyle gelen sermaye',
  'third-party': 'Başka bir kişi veya şirketten · uyum ekibi elle inceler',
};

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

  // ---------------------------------------------------------------------------- D-1a upload

  protected readonly dragging = signal(false);
  protected readonly fileError = signal<string | null>(null);

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
    if (!ACCEPT.test(f.name)) return this.fileError.set('Yalnızca PDF, PowerPoint (.pptx) veya Keynote (.key) dosyası yükleyebilirsiniz.');
    if (f.size > MAX_BYTES) return this.fileError.set('Dosya 50 MB’tan büyük. Daha küçük bir sürüm yükleyin.');
    this.fileError.set(null);
    await this.store.uploadDeck({ name: f.name, size: f.size });
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
      return { id, t, ok: warnN === 0, okText: edited ? '✎ Düzenlendi' : '✓ AI okudu', warn: warnN > 0, warnText: `${warnN} alanı kontrol edin`, s, open: this.openCard() === id, fields };
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
