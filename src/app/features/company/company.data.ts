import { computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ApplicationStore } from '@core/state/application.store';
import { REVIEW_INPUTS, REVIEW_ROWS } from '@core/api/http/api-mapper';
import { ReviewKey } from '@core/api/http/api-types';
import { followFlow } from '@core/flow/follow';
import { tl0 } from '@core/utils/format';
import { dateTime } from '@core/utils/format';
import { DECK_CONSENT_ERROR, EvaluationField, evaluationErrors } from '@core/utils/rules';
import { CAPITAL, EvaluationAnswers, EvaluationReason, FUNDING_LABELS, FundingSource, Profile } from '@core/models/models';
import { companyPurpose } from '@core/reference/nace';

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
type ProfileDraft = Omit<Profile, 'at' | 'funding'> & { funding: FundingSource | '' };

/** What D-1a says above the form when the last evaluation did not end well (the API is back at `verified`). */
const EVALUATION_ENDED: Record<'failed' | 'rejected' | 'cancelled', { title: string; text: string }> = {
  failed: { title: 'Önceki değerlendirme tamamlanamadı', text: 'Değerlendirme hizmeti başvurunuzu sonuçlandıramadı. Lütfen sunumunuzu ve özgeçmişinizi yeniden yükleyiniz.' },
  rejected: { title: 'Sunumunuz değerlendirmeye alınamadı', text: 'Lütfen sunumun 3 ile 40 sayfa arasında bir PDF dosyası olduğunu kontrol ederek yeniden yükleyiniz.' },
  cancelled: { title: 'Önceki değerlendirme iptal edildi', text: 'Devam etmek için sunumunuzu ve özgeçmişinizi yeniden yükleyiniz.' },
};

/**
 * A `rejected` evaluation whose reason the API knows gets its own words instead of the general
 * `rejected` notice. The brand is the profile's ("Ön bilgileri düzenle" below the form); the other
 * three are answers on this form.
 */
const EVALUATION_REJECTED_BECAUSE: Record<EvaluationReason, { title: string; text: string }> = {
  formDeckConflict: { title: 'Form yanıtlarınız sunumunuzla uyuşmuyor', text: 'Değerlendirme hizmeti, formdaki bilgileri sunumunuzdaki ürün veya faaliyet bilgileriyle uyumlu bulmadı. Marka adınızı (Ön bilgiler), kısa özet, faaliyet alanı ve gelir modeli yanıtlarınızı sunumunuza göre düzelterek yeniden yükleyiniz.' },
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

/**
 * STB's "Faaliyet grubu" is fixed to 1 "Yazılım ve BT" (owner, 2026-11-27): shown read-only on D-1a and
 * sent with every upload; "Faaliyet alanı" then lists that group's activities only.
 */
const FIXED_ACTIVITY_GROUP_ID = 1;

/** Welcome and step 1 — profile, deck and evaluation questions, the evaluation, the company form, MERSİS title conflict (Ekranlar 1). */
export class CompanyData {
  protected readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);

  constructor() {
    this.store.clearError();
    followFlow();
    // The choices offered on D-1e and D-1c are the API's own list (Api.reference); D-1a's, the evaluation service's.
    void this.store.loadReference();
    void this.store.loadEvaluationReference();
    // Once both ticks are given, the message asking for them has done its job.
    effect(() => {
      if (this.consentsGiven() && untracked(this.consentError)) this.consentError.set(null);
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

  /** D-1e's "Faaliyet alanı": the NACE list of `Api.reference`, by name only; the codes stay out of sight (API step 24). */
  protected readonly profileNaceOptions = computed(() => (this.store.reference()?.naceCodes ?? []).map((n) => ({ value: n.code, label: n.title })));
  /** The capital sources the API accepts, on D-1e and in D-1c's funding editor. */
  protected readonly fundingOptions = computed(() =>
    (this.store.reference()?.funding ?? []).map((v) => ({ value: v.key, label: v.label, hint: FUNDING_HINTS[v.key] })),
  );
  /** A refusal's message for one field, under the API's field name (only HTTP mode names fields). */
  protected fieldError(key: string): string | null {
    return this.store.fieldErrors()[key]?.[0] ?? null;
  }
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
        ? { brand: p.brand, naceCodes: [...p.naceCodes], funding: p.funding, nationality: p.nationality, phone: p.phone, country: p.country }
        : { brand: '', naceCodes: [], funding: '', nationality: '', phone: '', country: '' };
    })(),
  );
  protected readonly profileReady = computed(() => {
    const p = this.profileDraft();
    const digits = p.phone.replace(/\D/g, '').length;
    return p.brand.trim().length >= 2 && p.naceCodes.length > 0 && !!p.funding && !!p.nationality && !!p.country && digits >= 8 && digits <= 15;
  });

  protected setProfile(key: Exclude<keyof ProfileDraft, 'naceCodes'>, value: string) {
    this.profileDraft.update((p) => ({ ...p, [key]: value }));
  }

  protected setProfileNace(codes: string[]) {
    this.profileDraft.update((p) => ({ ...p, naceCodes: codes }));
  }

  /** Saving moves the stage to `verified`, which this screen also shows, so the move to D-1a is made here. */
  protected async submitProfile() {
    const p = this.profileDraft();
    if (!p.naceCodes.length || !p.funding) return;
    if (await this.store.submitProfile({ ...p, funding: p.funding as FundingSource })) void this.router.navigateByUrl('/deck');
  }

  /** Demo: values for the downloadable sample deck (Lumora Analytics). */
  protected useSampleProfile() {
    this.profileDraft.set({ brand: 'Lumora Analytics', naceCodes: ['62.10.00', '63.10.00'], funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya' });
  }

  // ------------------------------------------------------- D-1a deck, CV and the five answers

  /**
   * The profile can be changed at the upload step: before the first upload and, since API step 21,
   * again after an evaluation that ended without a result (the brand goes to the service as the
   * startup name, so a conflict may need it corrected). The API refuses it at every later stage.
   */
  protected readonly profileEditable = computed(() => this.store.stage() === 'verified');

  /** The last evaluation ended without a result; D-1a says so above the form and takes a new upload. */
  protected readonly evaluationEnded = computed(() => {
    const evaluation = this.store.stage() === 'verified' ? this.store.app()?.evaluation : undefined;
    const status = evaluation?.status;
    if (status === 'rejected' && evaluation?.reason) return EVALUATION_REJECTED_BECAUSE[evaluation.reason];
    return status === 'failed' || status === 'rejected' || status === 'cancelled' ? EVALUATION_ENDED[status] : null;
  });

  protected readonly limits = computed(() => this.store.evaluationReference()?.limits ?? null);
  /** The fixed activity group's label from STB's dictionary ("Yazılım ve BT"); the field is read-only. */
  protected readonly fixedGroupLabel = computed(
    () => this.store.evaluationReference()?.activityGroups.find((o) => o.id === FIXED_ACTIVITY_GROUP_ID)?.label ?? 'Yazılım ve BT',
  );
  protected readonly groupOptions = computed(() => (this.store.evaluationReference()?.activityGroups ?? []).map((o) => ({ value: String(o.id), label: o.label })));
  /**
   * Each activity's group, when the reference links them (`groupId`, our derived mapping, not from
   * STB); empty from an API built before it, and then group and activity stay independent.
   */
  private readonly groupOfActivity = computed(() => {
    const pairs = (this.store.evaluationReference()?.activities ?? []).flatMap((o) => (o.groupId === undefined ? [] : [[o.id, o.groupId] as const]));
    return new Map<number, number>(pairs);
  });
  /** A chosen group narrows the activities to its own; without a group (or without the link) all of them. */
  protected readonly activityOptions = computed(() => {
    const group = this.answers().activityGroupId;
    const linked = this.groupOfActivity().size > 0;
    return (this.store.evaluationReference()?.activities ?? [])
      .filter((o) => group === null || !linked || o.groupId === group)
      .map((o) => ({ value: String(o.id), label: o.label }));
  });
  /** A group's list is short (2 to 28), so it reads as a plain choice; the full list asks for a search. */
  protected readonly activityPlaceholder = computed(() =>
    this.answers().activityGroupId !== null && this.groupOfActivity().size > 0 ? 'Seçiniz' : 'Aramak için yazınız',
  );
  /** The three multiple choices, in the form's order, with the API's field names. */
  protected readonly multiChoices = computed(() => {
    const ref = this.store.evaluationReference();
    return [
      { key: 'businessModelIds' as const, title: 'İş modeli', options: ref?.businessModels ?? [] },
      { key: 'revenueModelIds' as const, title: 'Gelir modeli', options: ref?.revenueModels ?? [] },
      { key: 'productTypeIds' as const, title: 'Ürün türü', options: ref?.productTypes ?? [] },
    ].map((c) => ({ ...c, options: c.options.map((o) => ({ value: String(o.id), label: o.label })) }));
  });

  protected readonly deckFile = signal<File | null>(null);
  protected readonly cvFile = signal<File | null>(null);
  protected readonly answers = signal<EvaluationAnswers>({ summary: '', activityGroupId: FIXED_ACTIVITY_GROUP_ID, activityId: null, businessModelIds: [], revenueModelIds: [], productTypeIds: [] });
  /** The screen's own checks (`evaluationErrors`), shown at the fields like the API's refusals. */
  protected readonly formErrors = signal<Partial<Record<EvaluationField, string>>>({});
  protected readonly consentError = signal<string | null>(null);

  /** "120 / 2000 karakter · en az 50" under the summary. */
  protected readonly summaryHint = computed(() => {
    const l = this.limits();
    const n = this.answers().summary.trim().length;
    if (!l) return `${n} karakter`;
    return n < l.summaryMin ? `${n} / ${l.summaryMax} karakter · en az ${l.summaryMin}` : `${n} / ${l.summaryMax} karakter`;
  });
  protected readonly summaryOver = computed(() => this.answers().summary.trim().length > (this.limits()?.summaryMax ?? Infinity));

  /**
   * The two ticks the upload needs. They start unticked and are sent with this one upload only
   * (the API records both per upload); nothing is remembered from an earlier upload.
   */
  protected readonly noticeAcknowledged = signal(false);
  protected readonly aiConsent = signal(false);
  protected readonly consentsGiven = computed(() => this.noticeAcknowledged() && this.aiConsent());

  /** The message at a field: the screen's own check first, else the API's refusal. */
  protected deckFieldError(key: EvaluationField): string | null {
    return this.formErrors()[key] ?? this.fieldError(key);
  }

  private clearFieldError(key: EvaluationField) {
    if (!this.formErrors()[key]) return;
    const next = { ...this.formErrors() };
    delete next[key];
    this.formErrors.set(next);
  }

  protected setSummary(value: string) {
    this.answers.update((a) => ({ ...a, summary: value }));
    this.clearFieldError('summary');
  }

  /**
   * Group and activity are parent and child when the reference links them: an activity brings its
   * group with it, and a group that does not hold the chosen activity clears it (with its errors).
   */
  protected setChoice(key: 'activityGroupId' | 'activityId', value: string) {
    const id = value ? Number(value) : null;
    const groupOf = this.groupOfActivity();
    const a = this.answers();
    if (key === 'activityId') {
      const group = id === null ? undefined : groupOf.get(id);
      this.answers.set({ ...a, activityId: id, activityGroupId: group ?? a.activityGroupId });
      if (group !== undefined && group !== a.activityGroupId) this.clearChoiceError('activityGroupId');
    } else {
      const keep = a.activityId === null || id === null || !groupOf.has(a.activityId) || groupOf.get(a.activityId) === id;
      this.answers.set({ ...a, activityGroupId: id, activityId: keep ? a.activityId : null });
      if (!keep) this.clearChoiceError('activityId');
    }
    this.clearChoiceError(key);
  }

  /** The screen's own message and the API's refusal at one of the two choices. */
  private clearChoiceError(key: 'activityGroupId' | 'activityId') {
    this.clearFieldError(key);
    if (!this.store.fieldErrors()[key]) return;
    const { [key]: _, ...rest } = this.store.fieldErrors();
    this.store.fieldErrors.set(rest);
  }

  protected multiValue(key: 'businessModelIds' | 'revenueModelIds' | 'productTypeIds'): string[] {
    return this.answers()[key].map(String);
  }

  /** The multi-select hands back string values; the API takes the numeric ids. */
  protected setMulti(key: 'businessModelIds' | 'revenueModelIds' | 'productTypeIds', values: string[]) {
    this.answers.update((a) => ({ ...a, [key]: values.map(Number) }));
    this.clearFieldError(key);
  }

  protected onFilePicked(which: 'deck' | 'cv', e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = '';
    if (!f) return;
    (which === 'deck' ? this.deckFile : this.cvFile).set(f);
    // Say at once when the file itself is wrong (type, size); the other fields wait for "Gönder".
    const l = this.limits();
    const error = l ? evaluationErrors({ ...this.answers(), deck: this.deckFile(), cv: this.cvFile() }, l)[which] : undefined;
    this.formErrors.update((x) => {
      const next = { ...x };
      if (error) next[which] = error;
      else delete next[which];
      return next;
    });
  }

  /** Checks everything on screen, then sends the deck, the CV and the answers; the evaluation starts. */
  protected async submitDeck() {
    const l = this.limits();
    const ref = this.store.evaluationReference();
    if (!l || !ref) return;
    const errors = evaluationErrors({ ...this.answers(), deck: this.deckFile(), cv: this.cvFile() }, l, ref);
    this.formErrors.set(errors);
    this.consentError.set(this.consentsGiven() ? null : DECK_CONSENT_ERROR);
    if (Object.keys(errors).length || !this.consentsGiven()) return;
    await this.store.uploadDeck({ deck: this.deckFile()!, cv: this.cvFile()! }, this.answers(), { noticeAcknowledged: this.noticeAcknowledged(), aiConsent: this.aiConsent() });
  }

  // ------------------------------------------------------- D-1b the evaluation runs (waiting)

  // The service's retry count (`evaluation.attempt` / `maxAttempts`) is not shown to the founder
  // (owner's decision of 2026-11-26): only when the evaluation started.
  protected readonly evaluationSince = computed(() => {
    const at = this.store.app()?.evaluation?.startedAt;
    return at ? dateTime(at) : null;
  });
  protected readonly uploadedFiles = computed(() => {
    const a = this.store.app();
    return [a?.deck?.fileName, a?.cv?.fileName].filter(Boolean).join(' · ');
  });

  /** The brand stated on the profile, with the logo the founder chose on D-1c (mock only). */
  protected readonly brand = computed(() => {
    const c = this.store.app()?.company;
    const name = c?.brand ?? '';
    return { name, logo: c?.logo ?? '', initials: name.slice(0, 1).toLocaleUpperCase('tr-TR') };
  });

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

  protected readonly marks = computed(() => this.store.app()?.marks ?? {});
  protected readonly founderLabel = computed(() => (this.store.founderType() === 'resident' ? '◍ T.C. vatandaşı kurucu' : '◍ Yabancı kurucu'));

  protected setTitle(value: string) {
    const [root = '', ...rest] = value.replace(/\s+(A\.Ş\.|Anonim Şirketi)$/i, '').trim().split(/\s+/);
    void this.store.updateReview({ company: { root, activity: rest.join(' ') } }, ['title']);
  }

  /** The NACE codes the API accepts (Api.reference), code → title. */
  private readonly naceTitles = computed(() => new Map((this.store.reference()?.naceCodes ?? []).map((n) => [n.code, n.title])));
  /** A code the reference does not list (e.g. one of the retired four-digit codes) is shown as the code itself. */
  protected naceName(code: string) {
    return this.naceTitles().get(code) ?? code;
  }

  protected readonly naceChips = computed(() => (this.store.app()?.company.nace ?? []).map((code) => ({ code, name: this.naceName(code) })));

  /** Search results and suggestions, only among the codes the API accepts. */
  protected readonly naceOptions = computed(() => {
    const c = this.store.app()?.company;
    if (!c) return [];
    const allowed = this.naceTitles();
    const q = this.naceQuery().trim().toLocaleLowerCase('tr-TR');
    if (q) {
      return [...allowed]
        .filter(([code, name]) => !c.nace.includes(code) && (code.startsWith(q) || name.toLocaleLowerCase('tr-TR').includes(q)))
        .slice(0, 5)
        .map(([code, name]) => ({ code, name, suggested: false }));
    }
    // Without a search: the codes of the activity area stated on the profile.
    return c.suggestedNace
      .filter((x) => allowed.has(x) && !c.nace.includes(x))
      .map((code) => ({ code, name: this.naceName(code), suggested: true }))
      .slice(0, 3);
  });

  protected readonly purpose = computed(() => companyPurpose((this.store.app()?.company.nace ?? []).map((code) => ({ code, title: this.naceName(code) }))));

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
      const edited = keys.some((k) => m[k] === 'edited');
      return { id, t, edited, s, open: this.openCard() === id, fields };
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
        { key: 'funding', label: 'Sermaye nereden geliyor?', value: a.funding, wide: true, kind: 'select', options: this.fundingOptions() },
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

  /**
   * Every piece of information on the company form as one row: what it is, its value, which editor
   * its pencil opens (none for fixed facts), and whether it is a default from the profile or the
   * account (`profile`) or the founder's own value (`edited`).
   */
  protected readonly rows = computed(() => {
    const a = this.store.app();
    if (!a) return [];
    const m = a.marks;
    const name = `${a.founder.firstName} ${a.founder.lastName}`.trim();
    const row = (key: string, label: string, value: string, edit: Editor | null, mark = key, raw = value) => ({
      key, label, value: value || '—', raw, edit, fromProfile: m[mark] === 'profile', edited: m[mark] === 'edited',
    });
    return [
      row('title', 'Şirket unvanı', this.store.fullTitle(), 'title'),
      row('name', 'Kurucu', name, 'founder'),
      row('nace', 'Faaliyet', (a.company.nace ?? []).map((c) => this.naceName(c)).join(', '), 'nace'),
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

  /** A refusal's messages at the review rows (e.g. "Ad eksik." under Kurucu after "Onayla ve devam et"). */
  protected readonly rowErrors = computed(() => {
    const out: Record<string, string> = {};
    for (const [key, messages] of Object.entries(this.store.fieldErrors())) {
      const row = REVIEW_ROWS[key as ReviewKey];
      if (row && messages[0]) out[row] = out[row] ? `${out[row]} ${messages[0]}` : messages[0];
    }
    return out;
  });

  /** A refusal's message at an input of the open editor (founder, contact or funding). */
  protected readonly inputErrors = computed(() => {
    const out: Record<string, string> = {};
    for (const [key, messages] of Object.entries(this.store.fieldErrors())) {
      const input = REVIEW_INPUTS[key as ReviewKey];
      if (input && messages[0]) out[input] = messages[0];
    }
    return out;
  });
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

  /**
   * "Diğer bilgilere dön": after a refused title the API still takes changes to the review and a new
   * "Onayla ve devam et" (which asks for the review's trade name again), with no call that changes
   * the stage. So this only opens D-1c, which accepts `titleConflict` too.
   */
  protected editAgain() {
    void this.router.navigateByUrl('/deck/review');
  }

  /** D-1c opened from D-1d: back to the title choice. */
  protected backToTitles() {
    void this.router.navigateByUrl('/deck/name-rejected');
  }

  /** D-1c opened from D-1d: the title was refused. */
  protected readonly titleRefused = computed(() => this.store.stage() === 'titleConflict');

  // ------------------------------------------------------------- D-1f title being checked

  /** "Lumora Analitik Yazılım", the title waiting for its answer. */
  protected readonly checkingTitle = computed(() => this.store.app()?.titleCheck?.candidate ?? this.store.title());
  /** When it was asked, if known (the mock knows; the API does not send it). */
  protected readonly checkingSince = computed(() => {
    const at = this.store.app()?.titleCheck?.requestedAt;
    return at ? dateTime(at) : null;
  });

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
