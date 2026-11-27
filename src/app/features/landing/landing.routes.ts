import { Routes } from '@angular/router';
import { flowGuard } from '@core/flow/flow.guard';

export const landingRoutes: Routes = [
  {
    path: '',
    title: 'Karşılama · Terminal Şirket',
    data: { screen: 'd00' },
    canActivate: [flowGuard],
    // The landing rebuilt from an empty page on 2026-11-16. The earlier one (karsilama/d00.*) was deleted on 2026-11-27.
    loadComponent: () => import('@features/landing/pages/landing/landing').then((m) => m.LandingPage),
  },
];
