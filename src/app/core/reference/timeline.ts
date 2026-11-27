import { Application, DocItem, LogEntry } from '@core/models/models';

/**
 * Time-based simulations. Each long-running process is a pure function of its progress p (0–1),
 * so screens can render live state from `startedAt` and survive reloads; on completion the
 * same events are persisted by the mock API with identical timestamps.
 */

/**
 * Simulated durations in the mock at 1× speed (ms). `evaluation` stands for the outside evaluation
 * service, which takes minutes on the real API; `titleCheck` for staff work that takes hours.
 */
export const DURATION = { evaluation: 6_000, titleCheck: 4_000, identity: 6_000, screening: 5_000, call: 20_000, setup: 45_000 };

export const progress = (startedAt: string | undefined, duration: number, now: number) =>
  startedAt ? Math.min(1, Math.max(0, (now - Date.parse(startedAt)) / duration)) : 0;

/**
 * Progress for work whose end only the server knows (HTTP mode): it moves with time like `progress`
 * but slows down and never passes `cap`, so the screen never shows 100% before the server says so.
 * About 63% of `cap` after one `duration`, 86% after two.
 */
export const openEndedProgress = (startedAt: string | undefined, duration: number, now: number, cap = 0.95) =>
  startedAt ? cap * (1 - Math.exp(-Math.max(0, now - Date.parse(startedAt)) / duration)) : 0;

const at = (startedAt: string, duration: number, f: number) => new Date(Date.parse(startedAt) + f * duration).toISOString();

const doc = (group: string, name: string, sizeKb: number, when: string): DocItem => ({ group, name, sizeKb, at: when });

// ------------------------------------------------- step 2: identity (D-2a) and screening (D-2e)

export const SCREENING_LISTS = [
  'BM Güvenlik Konseyi yaptırım listesi',
  'AB konsolide yaptırım listesi',
  'OFAC SDN listesi',
  'Ulusal malvarlığı dondurma listesi',
  'PEP (siyasi nüfuz sahibi kişiler)',
];
export const LIVENESS = ['Başınızı çevirin', 'Göz kırpın', 'Gülümseyin'];

/** The camera check (stage `eligibility`): the passport is read, then three liveness prompts. */
export function identityView(p: number) {
  const passportRead = p >= 0.25;
  const liveness = p < 0.25 ? -1 : p >= 1 ? 3 : Math.floor((p - 0.25) / 0.25); // index of the current prompt
  return { p, passportRead, liveness, identityDone: p >= 1 };
}

/** The mock's lines for the camera check (the mock always sets `startedAt`; HTTP mode does not call this). */
export function identityEvents(app: Application, d = DURATION.identity): LogEntry[] {
  const s = app.eligibility!.startedAt!;
  return [
    { at: at(s, d, 0.25), text: 'Pasaport MRZ doğrulandı', who: 's' },
    { at: at(s, d, 1), text: `Canlılık kontrolü · eşleşme ${String(app.eligibility!.score).replace('.', ',')}`, who: 's' },
  ];
}

/** The list search (stage `screening`): the five lists one after the other. */
export function screeningView(p: number) {
  return { p, listsDone: Math.min(5, Math.floor(p * 5 + 1e-9)) };
}

export function screeningEvents(app: Application, d = DURATION.screening): { logs: LogEntry[]; docs: DocItem[]; listTimes: string[] } {
  // Applications finished before the step was split (2026-11-17) have no separate screening start.
  const s = (app.eligibility!.screeningStartedAt ?? app.eligibility!.startedAt)!;
  const listTimes = SCREENING_LISTS.map((_, i) => at(s, d, (i + 1) / 5));
  const manual = app.eligibility!.result === 'manual';
  const logs: LogEntry[] = [
    { at: listTimes[4], text: 'Yaptırım ve PEP taraması: eşleşme yok', who: 's' },
    {
      at: listTimes[4],
      text: manual ? 'Uygunluk sonucu: manuel incelemeye alındı' : 'Uygunluk sonucu: dijital kuruluşa uygun',
      who: 's',
    },
  ];
  const docs = [
    doc('1 · Başvuru & Uygunluk', 'Başvuru formu', 142, listTimes[4]),
    doc('1 · Başvuru & Uygunluk', 'AML tarama raporu', 88, listTimes[4]),
    doc('1 · Başvuru & Uygunluk', 'Kimlik doğrulama tutanağı', 61, listTimes[4]),
  ];
  return { logs, docs, listTimes };
}

// ------------------------------------------------------------------------------ call (D-4b)

export const CALL_STEPS = [
  'Kimlik kameraya gösterildi',
  'Yüz eşleşmesi onaylanıyor',
  'Sözlü onay',
  'Kayıt imzalandı',
  'Günlük e-imza düzenlendi',
];

export function callView(p: number, firstName: string) {
  const step = Math.min(5, Math.floor(p * 5)); // index of current step (5 = all done)
  const captions = [
    `Merhaba ${firstName} Bey/Hanım, ben Elif. Pasaportunuzun fotoğraflı sayfasını kameraya gösterir misiniz?`,
    'Teşekkürler. Şimdi yüzünüzü çerçevenin ortasında tutun, eşleşmeyi onaylıyorum.',
    'Şirket kuruluş belgelerinizin e-imzayla imzalanmasını onaylıyor musunuz? Lütfen “onaylıyorum” deyin.',
    'Onayınız kaydedildi. Görüşme tutanağını imzalıyorum.',
    'Günlük e-imzanız düzenleniyor. Birazdan hazır olacak.',
    'Görüşme tamamlandı. İyi günler dilerim.',
  ];
  return { p, step, caption: captions[step], elapsedFraction: p };
}

export function signatureDocs(when: string): DocItem[] {
  return [doc('3 · e-İmza', 'ESHS görüşme tutanağı', 73, when), doc('3 · e-İmza', 'e-İmza taahhütnamesi', 39, when)];
}

export function titleDocs(when: string): DocItem[] {
  return [
    doc('2 · Unvan & Adres', 'Unvan rezervasyon belgesi', 54, when),
    doc('2 · Unvan & Adres', 'Sanal ofis hizmet sözleşmesi', 120, when),
  ];
}

// ----------------------------------------------------------------------------- setup (D-5a)

type Sub = { t: string; kind?: 'exempt' };
export interface Agency {
  t: string;
  ag: string;
  subs: Sub[];
  docs: [string, number][];
  log?: string;
}

export const AGENCIES: Agency[] = [
  { t: 'Başvuru & Uygunluk Kontrolü', ag: 'Terminal Şirket', subs: [{ t: 'Başvuru formu oluşturuldu' }, { t: 'Kimlik doğrulandı' }, { t: 'Beyan onaylandı' }, { t: 'Yaptırım taraması tamamlandı' }], docs: [] },
  { t: 'Unvan Rezervasyonu & Adres Ataması', ag: 'MERSİS · Terminal İstanbul', subs: [{ t: 'Unvan sorgulandı' }, { t: 'Unvan rezerve edildi' }, { t: 'Sanal ofis adresi atandı' }], docs: [] },
  { t: 'e-İmza', ag: 'ESHS', subs: [{ t: 'Görüntülü görüşme yapıldı' }, { t: 'Sözlü onay alındı' }, { t: 'Günlük e-imza düzenlendi' }], docs: [] },
  {
    t: 'MERSİS, Tescil, Oda Kaydı & Defter Tasdiki',
    ag: 'Ticaret Sicili · Gebze Ticaret Odası',
    subs: [{ t: 'Esas sözleşme e-imzalandı' }, { t: 'MERSİS tescil başvurusu gönderildi' }, { t: 'Ticaret sicili tescil edildi' }, { t: 'Oda kaydı oluşturuldu' }, { t: 'Defterler elektronik ortamda tasdik edildi' }],
    docs: [['Esas sözleşme', 216], ['Kuruluş beyannamesi', 97], ['Yönetim kurulu kararı', 48], ['İmza beyannamesi', 52], ['Oda kayıt belgesi', 66], ['Defter tasdik şerhi', 41]],
    log: 'Ticaret sicili tescil edildi',
  },
  {
    t: 'Mükellefiyet Açılışı & Vergi Levhası',
    ag: 'Gelir İdaresi Başkanlığı',
    subs: [{ t: 'Vergi mükellefiyeti açıldı' }, { t: 'İnteraktif Vergi Dairesi erişimi açıldı' }, { t: 'Yoklama tutanağı (sanal ofis)', kind: 'exempt' }, { t: 'Vergi levhası oluşturuldu' }],
    docs: [['Vergi levhası', 58], ['İşe başlama tutanağı', 63]],
    log: 'Vergi mükellefiyeti açıldı',
  },
  { t: 'Mali Mühür', ag: 'TÜBİTAK Kamu SM', subs: [{ t: 'Mali mühür başvurusu gönderildi' }, { t: 'Sertifika yüklendi' }], docs: [['Mali mühür başvurusu', 35]], log: 'Mali mühür başvurusu gönderildi' },
  { t: 'Halkbank Hesap Açılışı', ag: 'Halkbank', subs: [{ t: 'Müşteri kaydı oluşturuldu' }, { t: 'Hesap açıldı' }, { t: 'IBAN tanımlandı' }, { t: 'Sermaye blokajı kuruldu' }], docs: [['Hesap açılış sözleşmesi', 131], ['Sermaye blokaj mektubu', 44]], log: 'Halkbank hesabı açıldı' },
  {
    t: 'e-Belge, SGK & e-Defter',
    ag: 'GİB · SGK',
    subs: [{ t: 'e-Fatura başvurusu yapıldı' }, { t: 'e-Arşiv tanımlandı' }, { t: 'e-Defter kaydı yapıldı' }, { t: 'SGK işyeri tescil edildi' }, { t: 'Portal erişimleri gönderildi' }],
    docs: [['e-Fatura başvurusu', 57], ['SGK işyeri tescil belgesi', 69]],
    log: 'e-Fatura ve SGK kayıtları tamamlandı',
  },
  { t: 'Müşavir Yönlendirme', ag: 'Terminal İstanbul', subs: [{ t: 'Müşavir eşleştirildi' }, { t: 'Yetki devri tanımlandı' }, { t: 'Tanışma daveti gönderildi' }, { t: 'Şirket paneli açıldı' }], docs: [], log: 'Mali müşavir atandı' },
];

const TOTAL_SUBS = AGENCIES.reduce((s, a) => s + a.subs.length, 0); // 34
const PRE_DONE = AGENCIES.slice(0, 3).reduce((s, a) => s + a.subs.length, 0); // finished before setup starts
const RUN_SUBS = TOTAL_SUBS - PRE_DONE;

/** Fraction of the setup run at which absolute sub-step index k completes. */
const subDoneAt = (k: number) => (k + 1 - PRE_DONE) / RUN_SUBS;

export function setupView(p: number) {
  const done = Math.min(TOTAL_SUBS, PRE_DONE + Math.floor(p * RUN_SUBS + 1e-9));
  let k = 0;
  let agency = AGENCIES.length;
  let sub = 0;
  for (let i = 0; i < AGENCIES.length; i++) {
    if (done < k + AGENCIES[i].subs.length) {
      agency = i;
      sub = done - k;
      break;
    }
    k += AGENCIES[i].subs.length;
  }
  return { p, done, total: TOTAL_SUBS, percent: Math.round((done / TOTAL_SUBS) * 100), agency, sub };
}

/** Logs and documents produced by the setup run up to progress p. */
export function setupEvents(app: Application, p: number, d = DURATION.setup): { logs: LogEntry[]; docs: DocItem[] } {
  const s = app.setup!.startedAt;
  const logs: LogEntry[] = [];
  const docs: DocItem[] = [];
  let k = 0;
  AGENCIES.forEach((a, i) => {
    const first = k;
    k += a.subs.length;
    if (i < 3) return;
    const startF = subDoneAt(first - 1);
    const endF = subDoneAt(k - 1);
    if (p >= startF && i === 3) logs.push({ at: at(s, d, 0.01), text: 'Esas sözleşme e-imzalandı', who: 's' });
    if (i === 3 && p >= subDoneAt(first + 1)) logs.push({ at: at(s, d, subDoneAt(first + 1)), text: 'MERSİS tescil başvurusu gönderildi', who: 's' });
    if (p >= endF) {
      if (a.log) logs.push({ at: at(s, d, endF), text: a.log, who: i === 8 ? 's' : 'k' });
      a.docs.forEach(([n, kb]) => docs.push(doc(`${i + 1} · ${groupName(i)}`, n, kb, at(s, d, endF))));
    }
  });
  if (p >= 1) logs.push({ at: at(s, d, 1), text: 'Şirket kuruldu', who: 's' });
  return { logs, docs };
}

function groupName(i: number) {
  return ['Başvuru & Uygunluk', 'Unvan & Adres', 'e-İmza', 'Tescil & Oda', 'Vergi', 'Mali Mühür', 'Banka', 'e-Belge & SGK', 'Müşavir'][i];
}
