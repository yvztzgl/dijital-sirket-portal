import { Routes } from '@angular/router';
import { screenRoutes } from './screens/screens';

export const routes: Routes = [
  ...screenRoutes,
  {
    path: 'screens',
    title: 'Ekranlar · Dijital Şirket Platformu',
    loadComponent: () => import('./shell/screen-index').then((m) => m.ScreenIndex),
  },
  // Old Turkish URLs (bookmarks, shared links) keep working.
  { path: 'giris', redirectTo: 'login' },
  { path: 'kayit', redirectTo: 'register' },
  { path: 'eposta-dogrulama', redirectTo: 'verify-email' },
  { path: 'sifre-sifirlama', redirectTo: 'reset-password' },
  { path: 'sunum', redirectTo: 'deck' },
  { path: 'sunum/tarama', redirectTo: 'deck/scan' },
  { path: 'sunum/inceleme', redirectTo: 'deck/review' },
  { path: 'sunum/mersis-ret', redirectTo: 'deck/name-rejected' },
  { path: 'uygunluk', redirectTo: 'eligibility' },
  { path: 'uygunluk/sonuc', redirectTo: 'eligibility/result' },
  { path: 'uygunluk/manuel-inceleme', redirectTo: 'eligibility/manual-review' },
  { path: 'odeme', redirectTo: 'payment' },
  { path: 'odeme/3d-secure', redirectTo: 'payment/3d-secure' },
  { path: 'e-imza', redirectTo: 'e-signature' },
  { path: 'e-imza/gorusme', redirectTo: 'e-signature/call' },
  { path: 'e-imza/hazir', redirectTo: 'e-signature/ready' },
  { path: 'e-imza/tc-vatandasi', redirectTo: 'e-signature/turkish-citizen' },
  { path: 'kurulus', redirectTo: 'setup' },
  { path: 'kurulus/tamamlandi', redirectTo: 'setup/complete' },
  { path: 'ekranlar', redirectTo: 'screens' },
  { path: '**', redirectTo: '' },
];
