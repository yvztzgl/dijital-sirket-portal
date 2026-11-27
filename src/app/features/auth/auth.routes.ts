import { Routes } from '@angular/router';
import { flowGuard } from '@core/flow/flow.guard';

export const authRoutes: Routes = [
  {
    path: 'login',
    title: 'Giriş · Terminal Şirket',
    data: { screen: 'd0a' },
    canActivate: [flowGuard],
    loadComponent: () => import('@features/auth/pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'Kayıt · Terminal Şirket',
    data: { screen: 'd0b' },
    canActivate: [flowGuard],
    loadComponent: () => import('@features/auth/pages/register/register').then((m) => m.RegisterPage),
  },
  {
    path: 'verify-email',
    title: 'E-posta doğrulama · Terminal Şirket',
    data: { screen: 'd0c' },
    canActivate: [flowGuard],
    loadComponent: () => import('@features/auth/pages/verify-email/verify-email').then((m) => m.VerifyEmailPage),
  },
  {
    path: 'reset-password',
    title: 'Şifre sıfırlama · Terminal Şirket',
    data: { screen: 'd0d' },
    canActivate: [flowGuard],
    loadComponent: () => import('@features/auth/pages/reset-password/reset-password').then((m) => m.ResetPasswordPage),
  },
  {
    // The address the API puts in the password-reset e-mail (`<portal>/sifre-sifirla?token=…`).
    path: 'sifre-sifirla',
    title: 'Yeni şifre · Terminal Şirket',
    data: { screen: 'd0e' },
    loadComponent: () => import('@features/auth/pages/new-password/new-password').then((m) => m.NewPasswordPage),
  },
];
