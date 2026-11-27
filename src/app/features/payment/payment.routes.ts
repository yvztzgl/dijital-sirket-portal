import { Routes } from '@angular/router';
import { flowGuard } from '@core/flow/flow.guard';

export const paymentRoutes: Routes = [
  {
    path: 'payment',
    title: 'Ödeme formu · Terminal Şirket',
    data: { screen: 'd3a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/payment-form/payment-form').then((m) => m.PaymentFormPage),
  },
  {
    path: 'payment/3d-secure',
    title: '3D Secure · Terminal Şirket',
    data: { screen: 'd3b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/three-d-secure/three-d-secure').then((m) => m.ThreeDSecurePage),
  },
];
