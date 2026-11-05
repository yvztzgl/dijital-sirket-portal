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
  { id: 'd00', code: 'D-00', title: 'Karşılama', desc: 'Giriş/kayıt ile aynı dil: lacivert zemin, gravür. Tek karar: başvuruya başla.', path: '', group: 'karsilama' },
  { id: 'd1a', code: 'D-1a', title: 'Proje sunumu yükleme', desc: 'Büyük bırakma alanı; örnek sunumlar ikincil.', path: 'deck', group: 'karsilama' },
  { id: 'd1b', code: 'D-1b', title: 'AI taraması', desc: '~4,5 sn. Sayfa şeridi + alanların kaynağıyla birlikte tek tek belirmesi.', path: 'deck/scan', group: 'karsilama' },
  { id: 'd1c', code: 'D-1c', title: 'Bulunanları inceleyin', desc: 'Şirket kartı açık; diğerleri tek satır özet. Rozetler: AI · Kontrol edin · Düzenlendi.', path: 'deck/review', group: 'karsilama' },
  { id: 'rejection', code: 'D-1d', title: 'MERSİS ret durumu', desc: 'Panel alt çubuğun yerini alır; alternatif bir tıkla seçilir ve yeniden sorgulanır.', path: 'deck/name-rejected', group: 'karsilama' },
  { id: 'd2a', code: 'D-2a', title: 'Uygunluk · yarı yolda', desc: 'Pasaport okundu, canlılık kontrolü sürüyor. Sonraki aşamalar soluk.', path: 'eligibility', group: 'uygunluk' },
  { id: 'd2b', code: 'D-2b', title: 'Uygunluk · tamamlandı', desc: 'Üç aşama tek satıra kapandı; tarama satırları açılmış hâli gösteriliyor.', path: 'eligibility/result', group: 'uygunluk' },
  { id: 'd2c', code: 'D-2c', title: 'Manuel inceleme', desc: 'Steppe Trade örneği. Ret değil: nedenler açık, iki yol eşit görünür.', path: 'eligibility/manual-review', group: 'uygunluk' },
  { id: 'd3a', code: 'D-3a', title: 'Ödeme formu', desc: 'Özet yalnızca toplamı gösterir; 4 kalem dökümü kapalı.', path: 'payment', group: 'uygunluk' },
  { id: 'd3b', code: 'D-3b', title: '3D Secure', desc: 'Banka tarzı modal; platform kimliğinden ayrışır. Simüle SMS sağ üstte.', path: 'payment/3d-secure', group: 'uygunluk' },
  { id: 'd4a', code: 'D-4a', title: 'e-İmza · görüşme öncesi', desc: 'Kamera açıldı, önizleme hazır. Tek eylem: operatörü ara.', path: 'e-signature', group: 'eimza' },
  { id: 'd4b', code: 'D-4b', title: 'e-İmza · görüşme sırasında', desc: 'Operatör + siz yan yana, altyazı, canlı kontrol listesi.', path: 'e-signature/call', group: 'eimza' },
  { id: 'd4c', code: 'D-4c', title: 'e-İmza · hazır', desc: 'Sertifika kartı + 24 saatlik geri sayım halkası.', path: 'e-signature/ready', group: 'eimza' },
  { id: 'd4d', code: 'D-4d', title: 'e-İmza · TC vatandaşı', desc: 'Aynı adım, farklı yöntem: iki seçenek kartı. (Yalnızca içerik alanı)', path: 'e-signature/turkish-citizen', group: 'eimza' },
  { id: 'd5a', code: 'D-5a', title: 'Şirketiniz kuruluyor', desc: 'Durum kartı + 9 kurum adımı. Belgeler sekmesi canlı doluyor.', path: 'setup', group: 'eimza' },
  { id: 'd5b', code: 'D-5b', title: 'Şirketiniz kuruldu', desc: 'Sakin kutlama: mühür halkası, tam unvan, kopyalanabilir sonuçlar, sonraki adımlar.', path: 'setup/complete', group: 'eimza' },
];

export const screenRoutes: Routes = [
  {
    path: 'login',
    title: 'Giriş · Dijital Şirket Platformu',
    data: { screen: 'd0a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./giris/d0a').then((m) => m.ScreenD0a),
  },
  {
    path: 'register',
    title: 'Kayıt · Dijital Şirket Platformu',
    data: { screen: 'd0b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./giris/d0b').then((m) => m.ScreenD0b),
  },
  {
    path: 'verify-email',
    title: 'E-posta doğrulama · Dijital Şirket Platformu',
    data: { screen: 'd0c' },
    canActivate: [flowGuard],
    loadComponent: () => import('./giris/d0c').then((m) => m.ScreenD0c),
  },
  {
    path: 'reset-password',
    title: 'Şifre sıfırlama · Dijital Şirket Platformu',
    data: { screen: 'd0d' },
    canActivate: [flowGuard],
    loadComponent: () => import('./giris/d0d').then((m) => m.ScreenD0d),
  },
  {
    path: '',
    title: 'Karşılama · Dijital Şirket Platformu',
    data: { screen: 'd00' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/d00').then((m) => m.ScreenD00),
  },
  {
    path: 'deck',
    title: 'Proje sunumu yükleme · Dijital Şirket Platformu',
    data: { screen: 'd1a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/d1a').then((m) => m.ScreenD1a),
  },
  {
    path: 'deck/scan',
    title: 'AI taraması · Dijital Şirket Platformu',
    data: { screen: 'd1b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/d1b').then((m) => m.ScreenD1b),
  },
  {
    path: 'deck/review',
    title: 'Bulunanları inceleyin · Dijital Şirket Platformu',
    data: { screen: 'd1c' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/d1c').then((m) => m.ScreenD1c),
  },
  {
    path: 'deck/name-rejected',
    title: 'MERSİS ret durumu · Dijital Şirket Platformu',
    data: { screen: 'rejection' },
    canActivate: [flowGuard],
    loadComponent: () => import('./karsilama/rejection').then((m) => m.ScreenRejection),
  },
  {
    path: 'eligibility',
    title: 'Uygunluk · yarı yolda · Dijital Şirket Platformu',
    data: { screen: 'd2a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d2a').then((m) => m.ScreenD2a),
  },
  {
    path: 'eligibility/result',
    title: 'Uygunluk · tamamlandı · Dijital Şirket Platformu',
    data: { screen: 'd2b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d2b').then((m) => m.ScreenD2b),
  },
  {
    path: 'eligibility/manual-review',
    title: 'Manuel inceleme · Dijital Şirket Platformu',
    data: { screen: 'd2c' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d2c').then((m) => m.ScreenD2c),
  },
  {
    path: 'payment',
    title: 'Ödeme formu · Dijital Şirket Platformu',
    data: { screen: 'd3a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d3a').then((m) => m.ScreenD3a),
  },
  {
    path: 'payment/3d-secure',
    title: '3D Secure · Dijital Şirket Platformu',
    data: { screen: 'd3b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./uygunluk/d3b').then((m) => m.ScreenD3b),
  },
  {
    path: 'e-signature',
    title: 'e-İmza · görüşme öncesi · Dijital Şirket Platformu',
    data: { screen: 'd4a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d4a').then((m) => m.ScreenD4a),
  },
  {
    path: 'e-signature/call',
    title: 'e-İmza · görüşme sırasında · Dijital Şirket Platformu',
    data: { screen: 'd4b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d4b').then((m) => m.ScreenD4b),
  },
  {
    path: 'e-signature/ready',
    title: 'e-İmza · hazır · Dijital Şirket Platformu',
    data: { screen: 'd4c' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d4c').then((m) => m.ScreenD4c),
  },
  {
    path: 'e-signature/turkish-citizen',
    title: 'e-İmza · TC vatandaşı · Dijital Şirket Platformu',
    data: { screen: 'd4d' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d4d').then((m) => m.ScreenD4d),
  },
  {
    path: 'setup',
    title: 'Şirketiniz kuruluyor · Dijital Şirket Platformu',
    data: { screen: 'd5a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d5a').then((m) => m.ScreenD5a),
  },
  {
    path: 'setup/complete',
    title: 'Şirketiniz kuruldu · Dijital Şirket Platformu',
    data: { screen: 'd5b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./eimza/d5b').then((m) => m.ScreenD5b),
  },
];
