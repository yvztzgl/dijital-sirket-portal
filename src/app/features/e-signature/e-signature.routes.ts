import { Routes } from '@angular/router';
import { flowGuard } from '@core/flow/flow.guard';

export const eSignatureRoutes: Routes = [
  {
    path: 'e-signature',
    title: 'e-İmza · görüşme öncesi · Terminal Şirket',
    data: { screen: 'd4a' },
    canActivate: [flowGuard],
    loadComponent: () => import('@features/e-signature/pages/call-lobby/call-lobby').then((m) => m.CallLobbyPage),
  },
  {
    path: 'e-signature/call',
    title: 'e-İmza · görüşme sırasında · Terminal Şirket',
    data: { screen: 'd4b' },
    canActivate: [flowGuard],
    loadComponent: () => import('@features/e-signature/pages/call/call').then((m) => m.CallPage),
  },
  {
    path: 'e-signature/ready',
    title: 'e-İmza · hazır · Terminal Şirket',
    data: { screen: 'd4c' },
    canActivate: [flowGuard],
    loadComponent: () => import('@features/e-signature/pages/signature-ready/signature-ready').then((m) => m.SignatureReadyPage),
  },
  {
    path: 'e-signature/turkish-citizen',
    title: 'e-İmza · TC vatandaşı · Terminal Şirket',
    data: { screen: 'd4d' },
    canActivate: [flowGuard],
    loadComponent: () => import('@features/e-signature/pages/resident-signature/resident-signature').then((m) => m.ResidentSignaturePage),
  },
];
