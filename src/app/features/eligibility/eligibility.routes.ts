import { Routes } from '@angular/router';
import { flowGuard } from '@core/flow/flow.guard';

export const eligibilityRoutes: Routes = [
  {
    path: 'eligibility',
    title: 'Kimlik doğrulama · Terminal Şirket',
    data: { screen: 'd2a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/identity-check/identity-check').then((m) => m.IdentityCheckPage),
  },
  {
    path: 'eligibility/declaration',
    title: 'Beyan · Terminal Şirket',
    data: { screen: 'd2d' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/declaration/declaration').then((m) => m.DeclarationPage),
  },
  {
    path: 'eligibility/screening',
    title: 'Uygunluk taraması · Terminal Şirket',
    data: { screen: 'd2e' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/screening/screening').then((m) => m.ScreeningPage),
  },
  {
    // Opened on the founder's phone from the QR code on D-2a. Public: the link is its only key. The
    // token is in the URL fragment (`#…`), never in the path, so it is not sent to the server (d2m).
    path: 'eligibility/phone',
    title: 'Kimlik doğrulama · Terminal Şirket',
    data: { screen: 'd2m' },
    loadComponent: () => import('./pages/identity-phone/identity-phone').then((m) => m.IdentityPhonePage),
  },
  {
    path: 'eligibility/result',
    title: 'Uygunluk · tamamlandı · Terminal Şirket',
    data: { screen: 'd2b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/eligible/eligible').then((m) => m.EligiblePage),
  },
  {
    path: 'eligibility/manual-review',
    title: 'Manuel inceleme · Terminal Şirket',
    data: { screen: 'd2c' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/manual-review/manual-review').then((m) => m.ManualReviewPage),
  },
  {
    // HTTP mode only: staff closed the application under manual review. Not in SCREENS: the mock cannot reach it.
    path: 'application-closed',
    title: 'Başvuru kapatıldı · Terminal Şirket',
    data: { screen: 'closed' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/application-closed/application-closed').then((m) => m.ApplicationClosedPage),
  },
];
