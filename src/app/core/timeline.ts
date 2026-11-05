import { Application, DocItem, LogEntry } from './models';

/**
 * Time-based simulations. Each long-running process is a pure function of its progress p (0–1),
 * so screens can render live state from `startedAt` and survive reloads; on completion the
 * same events are persisted by the mock API with identical timestamps.
 */

/** Base durations at 1× speed (ms). */
export const DURATION = { scan: 5_000, eligibility: 10_000, call: 20_000, setup: 45_000 };

export const progress = (startedAt: string | undefined, duration: number, now: number) =>
  startedAt ? Math.min(1, Math.max(0, (now - Date.parse(startedAt)) / duration)) : 0;

const at = (startedAt: string, duration: number, f: number) => new Date(Date.parse(startedAt) + f * duration).toISOString();

const doc = (group: string, name: string, sizeKb: number, when: string): DocItem => ({ group, name, sizeKb, at: when });

// ---------------------------------------------------------------------------------- scan (D-1b)

export function scanView(app: Application, p: number) {
  const fields = app.deck?.fields ?? [];
  const pages = app.deck?.pages ?? 12;
  const shown = Math.min(fields.length, Math.floor(p * (fields.length + 1)));
  return {
    p,
    percent: Math.round(p * 100),
    page: Math.min(pages, Math.max(1, Math.ceil(p * pages))),
    pages,
    shown,
    total: fields.length + 3, // a few fields come from defaults (type, capital, address) — "13 alan"
  };
}

// ------------------------------------------------------------------------- eligibility (D-2a)

export const SCREENING_LISTS = [
  'BM Güvenlik Konseyi yaptırım listesi',
  'AB konsolide yaptırım listesi',
  'OFAC SDN listesi',
  'Ulusal malvarlığı dondurma listesi',
  'PEP (siyasi nüfuz sahibi kişiler)',
];
export const LIVENESS = ['Başınızı çevirin', 'Göz kırpın', 'Gülümseyin'];

export function eligibilityView(p: number) {
  const passportRead = p >= 0.12;
  const liveness = p < 0.12 ? -1 : p >= 0.45 ? 3 : Math.floor((p - 0.12) / 0.11); // index of current prompt
  const identityDone = p >= 0.45;
  const declarationDone = p >= 0.6;
  const listsDone = p < 0.6 ? 0 : Math.min(5, Math.floor((p - 0.6) / 0.08));
  const stage = !identityDone ? 0 : !declarationDone ? 1 : listsDone < 5 ? 2 : 3;
  return { p, passportRead, liveness, identityDone, declarationDone, listsDone, stage };
}

export function eligibilityEvents(app: Application, d = DURATION.eligibility): { logs: LogEntry[]; docs: DocItem[]; listTimes: string[] } {
  const s = app.eligibility!.startedAt;
  const listTimes = SCREENING_LISTS.map((_, i) => at(s, d, 0.6 + (i + 1) * 0.08));
  const manual = app.eligibility!.result === 'manual';
  const logs: LogEntry[] = [
    { at: at(s, d, 0.12), text: 'Pasaport MRZ doğrulandı', who: 's' },
    { at: at(s, d, 0.45), text: `Canlılık kontrolü · eşleşme ${String(app.eligibility!.score).replace('.', ',')}`, who: 's' },
    { at: at(s, d, 0.5), text: 'Adres belgesi alındı', who: 'u' },
    { at: at(s, d, 0.6), text: 'Beyan onaylandı', who: 'u' },
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
  { t: 'Başvuru & Uygunluk Kontrolü', ag: 'Dijital Şirket Platformu', subs: [{ t: 'Başvuru formu oluşturuldu' }, { t: 'Kimlik doğrulandı' }, { t: 'Beyan onaylandı' }, { t: 'Yaptırım taraması tamamlandı' }], docs: [] },
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
