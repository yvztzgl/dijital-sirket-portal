import { Routes } from '@angular/router';
import { flowGuard } from '../core/flow.guard';

/** One entry per designed screen, in wizard order. Generated from the Claude Design canvases. */
export interface ScreenInfo {
  id: string;
  code: string;
  title: string;
  desc: string;
  path: string;
  group: string;
}

export const SCREEN_GROUPS: { id: string; title: string }[] = [
  { id: 'giris', title: 'Giriş ve kayıt' },
  { id: 'karsilama', title: 'Karşılama ve Adım 1 — Sunum' },
  { id: 'uygunluk', title: 'Adım 2–3 — Uygunluk ve ödeme' },
  { id: 'eimza', title: 'Adım 4–5 — e-İmza ve kuruluş' },
];

export const SCREENS: ScreenInfo[] = [
  { id: 'd0a', code: 'D-0a', title: 'Giriş', desc: 'Kayıtlı kurucu kaldığı adımdan devam eder. T.C. vatandaşları e-Devlet ile girer.', path: 'login', group: 'giris' },
  { id: 'd0b', code: 'D-0b', title: 'Kayıt', desc: 'İlk soru yolu belirler: yabancı kurucu e-posta ile, T.C. vatandaşı e-Devlet ile devam eder.', path: 'register', group: 'giris' },
  { id: 'd0c', code: 'D-0c', title: 'E-posta doğrulama', desc: '6 haneli kod. Doğrulanınca başvuru açılır ve Karşılama\'ya (D-00) geçilir.', path: 'verify-email', group: 'giris' },
  { id: 'd0d', code: 'D-0d', title: 'Şifre sıfırlama', desc: 'Bağlantı gönderildi durumu. Hesabın var olup olmadığını açıklamaz.', path: 'reset-password', group: 'giris' },
  { id: 'd0e', code: 'D-0e', title: 'Yeni şifre', desc: 'E-postadaki sıfırlama bağlantısıyla açılır: yeni şifre iki kez yazılır. Bağlantının anahtarı adres çubuğundan hemen silinir.', path: 'sifre-sifirla', group: 'giris' },
  { id: 'd00', code: 'D-00', title: 'Karşılama', desc: 'Başlık ve dünya haritası; şehirlerden İstanbul’a yaylar uzanır. Kaydırınca harita İstanbul’a yaklaşır ve beş adım açılır: solda adım listesi, sağda her adımın görseli ve ekranından bir parça.', path: '', group: 'karsilama' },
  { id: 'd1e', code: 'D-1e', title: 'Ön bilgiler', desc: 'Adım 1’in ilk ekranı. Sunumdan önce kurucu şirket adını, faaliyet alanını, sermaye kaynağını, uyruğunu, ülkesini ve telefonunu yazar; bunlar şirket formunda varsayılan değer olur. Sunum yüklenene kadar yeniden düzenlenebilir.', path: 'details', group: 'karsilama' },
  { id: 'd1a', code: 'D-1a', title: 'Sunum ve değerlendirme soruları', desc: 'Sunum (PDF, 3–40 sayfa, en fazla 25 MB) ve özgeçmiş (PDF, en fazla 5 MB), kısa özet, faaliyet grubu ve alanı (aranabilir), iş modeli, gelir modeli ve ürün türü; dış değerlendirme hizmetine aktarım için iki onay. Önceki değerlendirme olumsuz bittiyse üstte kısa bir not.', path: 'deck', group: 'karsilama' },
  { id: 'd1b', code: 'D-1b', title: 'Sunum değerlendiriliyor', desc: 'Bir şey istenmez: değerlendirme birkaç dakika sürer, sayfa kapatılabilir. Süre bilinmediği için ilerleme çubuğu yok; sonuç gelince kendiliğinden ilerler.', path: 'deck/evaluating', group: 'karsilama' },
  { id: 'd1g', code: 'D-1g', title: 'Ek bilgi gerekiyor', desc: 'Değerlendirme hizmeti ek soru sordu: kurucu her soruda bir seçenek seçer, gerekirse açıklama yazar ve yanıtları gönderir; değerlendirme kaldığı yerden devam eder.', path: 'deck/more-information', group: 'karsilama' },
  { id: 'd1c', code: 'D-1c', title: 'Şirket formu', desc: 'Kurucu şirket bilgilerini kendisi doldurur. Ön bilgilerden ve hesaptan gelen değerler “Ön bilgilerinizden” notuyla gösterilir; unvan marka adından, faaliyet kodları faaliyet alanından önerilir. Her bölüm yerinde düzenlenir.', path: 'deck/review', group: 'karsilama' },
  { id: 'titlecheck', code: 'D-1f', title: 'Unvan kontrolü', desc: 'Bir şey istenmez: onaylanan bilgiler, kontrolü süren unvan ve sonraki adım. Kontrolü personel yapar ve saatler sürebilir; sayfa kapatılabilir, sonuç gelince kendiliğinden ilerler.', path: 'deck/name-check', group: 'karsilama' },
  { id: 'rejection', code: 'D-1d', title: 'MERSİS ret durumu', desc: 'Tek istek: başka bir unvan. Seçilen ve kayıtlı unvan yan yana, üç öneri ve kendi unvanını yazma; seçilen yeniden kontrol edilir (D-1f). “Diğer bilgilere dön” D-1c’yi açar.', path: 'deck/name-rejected', group: 'karsilama' },
  { id: 'd2a', code: 'D-2a', title: 'Kimlik doğrulama', desc: 'Adım 2’nin ilk ekranı. Önce ön bilgilendirme: gerekenler, dikkat edilecekler, açık rıza onayı ve “Doğrulamayı başlat”; ya da “Telefonla devam et” ile QR kod. Başlayınca kamera alanı otomatik kontrolü izler: pasaport, yüz, bekleme.', path: 'eligibility', group: 'uygunluk' },
  { id: 'd2m', code: 'D-2a-m', title: 'Kimlik doğrulama · telefon', desc: 'D-2a’daki QR kodla telefonda açılan, yalnızca bu adıma ait sayfa: uyarılar, açık rıza, kamera kontrolü, “bilgisayarınıza dönünüz”. Oturum gerektirmez.', path: 'eligibility/phone', group: 'uygunluk' },
  { id: 'd2d', code: 'D-2d', title: 'Beyan', desc: 'Adım 2’nin ikinci ekranı. Tek istek: adres belgesi. Yükleme alanı, kabul edilen belgeler, beyan edilen adres ve fon kaynağı, doğruluk beyanı onayı.', path: 'eligibility/declaration', group: 'uygunluk' },
  { id: 'd2e', code: 'D-2e', title: 'Uygunluk taraması', desc: 'Adım 2’nin üçüncü ekranı. Bir şey istenmez: beş liste sırayla taranır, bitince sonuç ekranı açılır.', path: 'eligibility/screening', group: 'uygunluk' },
  { id: 'd2b', code: 'D-2b', title: 'Uygunluk · tamamlandı', desc: 'Üç aşama tek satıra kapandı; tarama satırları açılmış hâli gösteriliyor.', path: 'eligibility/result', group: 'uygunluk' },
  { id: 'd2c', code: 'D-2c', title: 'Manuel inceleme', desc: 'Steppe Trade örneği. Ret değil: nedenler açık, iki yol eşit görünür.', path: 'eligibility/manual-review', group: 'uygunluk' },
  { id: 'd3a', code: 'D-3a', title: 'Ödeme formu', desc: 'Tek kart: solda ücrete dahil olanlar ve toplam (hep açık), sağda kart formu.', path: 'payment', group: 'uygunluk' },
  { id: 'd3b', code: 'D-3b', title: '3D Secure', desc: 'Banka tarzı modal; platform kimliğinden ayrışır. Simüle SMS sağ üstte.', path: 'payment/3d-secure', group: 'uygunluk' },
  { id: 'd4a', code: 'D-4a', title: 'e-İmza · görüşme öncesi', desc: 'Önce ön bilgilendirme: gerekenler, dikkat edilecekler, onay kutusu ve “Devam et”. Sonra kamera önizlemesi ve cihaz kontrolü; tek eylem: operatörü ara.', path: 'e-signature', group: 'eimza' },
  { id: 'd4b', code: 'D-4b', title: 'e-İmza · görüşme sırasında', desc: 'Operatör ve siz yan yana, operatörün o anki cümlesi, mikrofon, kamera ve görüşmeyi bitirme düğmeleri.', path: 'e-signature/call', group: 'eimza' },
  { id: 'd4c', code: 'D-4c', title: 'e-İmza · hazır', desc: 'Sertifika kartı ve kalan süre. Altında belirgin uyarı: “Kuruluşu başlattığınızda belgeleriniz bu imzayla imzalanır” ve onay kutusu; onay verilmeden “Kuruluşu başlat” çalışmaz.', path: 'e-signature/ready', group: 'eimza' },
  { id: 'd4d', code: 'D-4d', title: 'e-İmza · TC vatandaşı', desc: 'Aynı adım, farklı yöntem: iki seçenek. “Devam et” e-imzayı doğrular ve D-4c’ye geçer; imzalama onayı orada verilir.', path: 'e-signature/turkish-citizen', group: 'eimza' },
  { id: 'd5a', code: 'D-5a', title: 'Şirketiniz kuruluyor', desc: 'Bir şey istenmez: tamamlanan işlem sayısı, ilerleme çubuğu ve kurum adımlarının durumu. Belgeler ve işlem kaydı panelde açılır.', path: 'setup', group: 'eimza' },
  { id: 'd5b', code: 'D-5b', title: 'Şirketiniz kuruldu', desc: 'Sakin kutlama: mühür halkası, tam unvan, kopyalanabilir sonuçlar, sonraki adımlar.', path: 'setup/complete', group: 'eimza' },
];

export const screenRoutes: Routes = [
  {
    path: 'login',
    title: 'Giriş · Terminal Şirket',
    data: { screen: 'd0a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./giris/d0a').then((m) => m.ScreenD0a),
  },
  {
    path: 'register',
    title: 'Kayıt · Terminal Şirket',
    data: { screen: 'd0b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./giris/d0b').then((m) => m.ScreenD0b),
  },
  {
    path: 'verify-email',
    title: 'E-posta doğrulama · Terminal Şirket',
    data: { screen: 'd0c' },
    canActivate: [flowGuard],
    loadComponent: () => import('./giris/d0c').then((m) => m.ScreenD0c),
  },
  {
    path: 'reset-password',
    title: 'Şifre sıfırlama · Terminal Şirket',
    data: { screen: 'd0d' },
    canActivate: [flowGuard],
    loadComponent: () => import('./giris/d0d').then((m) => m.ScreenD0d),
  },
  {
    // The address the API puts in the password-reset e-mail (`<portal>/sifre-sifirla?token=…`).
    path: 'sifre-sifirla',
    title: 'Yeni şifre · Terminal Şirket',
    data: { screen: 'd0e' },
    loadComponent: () => import('./giris/d0e').then((m) => m.ScreenD0e),
  },
  {
    path: '',
    title: 'Karşılama · Terminal Şirket',
    data: { screen: 'd00' },
    canActivate: [flowGuard],
    // The landing rebuilt from an empty page on 2026-11-16. The earlier one (karsilama/d00.*) was deleted on 2026-11-27.
    loadComponent: () => import('./karsilama/landing').then((m) => m.ScreenLanding),
  },
  {
    path: 'details',
    title: 'Ön bilgiler · Terminal Şirket',
    data: { screen: 'd1e' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/d1e').then((m) => m.ScreenD1e),
  },
  {
    path: 'deck',
    title: 'Sunum ve değerlendirme soruları · Terminal Şirket',
    data: { screen: 'd1a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/d1a').then((m) => m.ScreenD1a),
  },
  {
    path: 'deck/evaluating',
    title: 'Sunum değerlendiriliyor · Terminal Şirket',
    data: { screen: 'd1b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/d1b').then((m) => m.ScreenD1b),
  },
  {
    path: 'deck/more-information',
    title: 'Ek bilgi gerekiyor · Terminal Şirket',
    data: { screen: 'd1g' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/d1g').then((m) => m.ScreenD1g),
  },
  {
    path: 'deck/review',
    title: 'Şirket formu · Terminal Şirket',
    data: { screen: 'd1c' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/d1c').then((m) => m.ScreenD1c),
  },
  {
    path: 'deck/name-check',
    title: 'Unvan kontrolü · Terminal Şirket',
    data: { screen: 'titlecheck' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/title-check').then((m) => m.ScreenTitleCheck),
  },
  {
    path: 'deck/name-rejected',
    title: 'MERSİS ret durumu · Terminal Şirket',
    data: { screen: 'rejection' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/rejection').then((m) => m.ScreenRejection),
  },
  {
    path: 'eligibility',
    title: 'Kimlik doğrulama · Terminal Şirket',
    data: { screen: 'd2a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d2a').then((m) => m.ScreenD2a),
  },
  {
    path: 'eligibility/declaration',
    title: 'Beyan · Terminal Şirket',
    data: { screen: 'd2d' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d2d').then((m) => m.ScreenD2d),
  },
  {
    path: 'eligibility/screening',
    title: 'Uygunluk taraması · Terminal Şirket',
    data: { screen: 'd2e' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d2e').then((m) => m.ScreenD2e),
  },
  {
    // Opened on the founder's phone from the QR code on D-2a. Public: the link is its only key. The
    // token is in the URL fragment (`#…`), never in the path, so it is not sent to the server (d2m).
    path: 'eligibility/phone',
    title: 'Kimlik doğrulama · Terminal Şirket',
    data: { screen: 'd2m' },
    loadComponent: () => import('./uygunluk/d2m').then((m) => m.ScreenD2m),
  },
  {
    path: 'eligibility/result',
    title: 'Uygunluk · tamamlandı · Terminal Şirket',
    data: { screen: 'd2b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d2b').then((m) => m.ScreenD2b),
  },
  {
    path: 'eligibility/manual-review',
    title: 'Manuel inceleme · Terminal Şirket',
    data: { screen: 'd2c' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d2c').then((m) => m.ScreenD2c),
  },
  {
    // HTTP mode only: staff closed the application under manual review. Not in SCREENS: the mock cannot reach it.
    path: 'application-closed',
    title: 'Başvuru kapatıldı · Terminal Şirket',
    data: { screen: 'closed' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/closed').then((m) => m.ScreenClosed),
  },
  {
    path: 'payment',
    title: 'Ödeme formu · Terminal Şirket',
    data: { screen: 'd3a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d3a').then((m) => m.ScreenD3a),
  },
  {
    path: 'payment/3d-secure',
    title: '3D Secure · Terminal Şirket',
    data: { screen: 'd3b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d3b').then((m) => m.ScreenD3b),
  },
  {
    path: 'e-signature',
    title: 'e-İmza · görüşme öncesi · Terminal Şirket',
    data: { screen: 'd4a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d4a').then((m) => m.ScreenD4a),
  },
  {
    path: 'e-signature/call',
    title: 'e-İmza · görüşme sırasında · Terminal Şirket',
    data: { screen: 'd4b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d4b').then((m) => m.ScreenD4b),
  },
  {
    path: 'e-signature/ready',
    title: 'e-İmza · hazır · Terminal Şirket',
    data: { screen: 'd4c' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d4c').then((m) => m.ScreenD4c),
  },
  {
    path: 'e-signature/turkish-citizen',
    title: 'e-İmza · TC vatandaşı · Terminal Şirket',
    data: { screen: 'd4d' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d4d').then((m) => m.ScreenD4d),
  },
  {
    path: 'setup',
    title: 'Şirketiniz kuruluyor · Terminal Şirket',
    data: { screen: 'd5a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d5a').then((m) => m.ScreenD5a),
  },
  {
    path: 'setup/complete',
    title: 'Şirketiniz kuruldu · Terminal Şirket',
    data: { screen: 'd5b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d5b').then((m) => m.ScreenD5b),
  },
];
