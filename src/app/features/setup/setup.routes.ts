import { Routes } from '@angular/router';
import { flowGuard } from '@core/flow/flow.guard';

export const setupRoutes: Routes = [
  {
    path: 'setup',
    title: 'Şirketiniz kuruluyor · Terminal Şirket',
    data: { screen: 'd5a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/setup-progress/setup-progress').then((m) => m.SetupProgressPage),
  },
  {
    path: 'setup/complete',
    title: 'Şirketiniz kuruldu · Terminal Şirket',
    data: { screen: 'd5b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/setup-complete/setup-complete').then((m) => m.SetupCompletePage),
  },
];
