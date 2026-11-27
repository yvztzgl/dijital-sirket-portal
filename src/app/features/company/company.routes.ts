import { Routes } from '@angular/router';
import { flowGuard } from '@core/flow/flow.guard';

export const companyRoutes: Routes = [
  {
    path: 'details',
    title: 'Ön bilgiler · Terminal Şirket',
    data: { screen: 'd1e' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/profile-form/profile-form').then((m) => m.ProfileFormPage),
  },
  {
    path: 'deck',
    title: 'Sunum ve değerlendirme soruları · Terminal Şirket',
    data: { screen: 'd1a' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/deck-upload/deck-upload').then((m) => m.DeckUploadPage),
  },
  {
    path: 'deck/evaluating',
    title: 'Sunum değerlendiriliyor · Terminal Şirket',
    data: { screen: 'd1b' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/deck-evaluating/deck-evaluating').then((m) => m.DeckEvaluatingPage),
  },
  {
    path: 'deck/more-information',
    title: 'Ek bilgi gerekiyor · Terminal Şirket',
    data: { screen: 'd1g' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/evaluation-questions/evaluation-questions').then((m) => m.EvaluationQuestionsPage),
  },
  {
    path: 'deck/review',
    title: 'Şirket formu · Terminal Şirket',
    data: { screen: 'd1c' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/company-review/company-review').then((m) => m.CompanyReviewPage),
  },
  {
    path: 'deck/name-check',
    title: 'Unvan kontrolü · Terminal Şirket',
    data: { screen: 'titlecheck' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/title-check/title-check').then((m) => m.TitleCheckPage),
  },
  {
    path: 'deck/name-rejected',
    title: 'MERSİS ret durumu · Terminal Şirket',
    data: { screen: 'rejection' },
    canActivate: [flowGuard],
    loadComponent: () => import('./pages/title-rejected/title-rejected').then((m) => m.TitleRejectedPage),
  },
];
