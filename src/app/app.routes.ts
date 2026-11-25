import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { Api } from './core/api';
import { screenRoutes } from './screens/screens';

export const routes: Routes = [
  ...screenRoutes,
  {
    path: 'screens',
    title: 'Ekranlar · Terminal Şirket',
    // The screen index is a demo tool: in HTTP mode the path does not match and falls through to '**'.
    canMatch: [() => !!inject(Api).demo],
    loadComponent: () => import('./shell/screen-index').then((m) => m.ScreenIndex),
  },
  // The landing as it was before the 2026-11-16 rebuild (navy İstanbul hero; `?hero=globe` for the globe).
  // Kept only for comparison: delete this route and karsilama/d00.* once the new landing is settled.
  {
    path: 'welcome-v1',
    title: 'Karşılama (önceki) · Terminal Şirket',
    loadComponent: () => import('./screens/karsilama/d00').then((m) => m.ScreenD00),
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
