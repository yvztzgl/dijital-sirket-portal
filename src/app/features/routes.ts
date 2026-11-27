import { Routes } from '@angular/router';
import { authRoutes } from '@features/auth/auth.routes';
import { landingRoutes } from '@features/landing/landing.routes';
import { companyRoutes } from '@features/company/company.routes';
import { eligibilityRoutes } from '@features/eligibility/eligibility.routes';
import { paymentRoutes } from '@features/payment/payment.routes';
import { eSignatureRoutes } from '@features/e-signature/e-signature.routes';
import { setupRoutes } from '@features/setup/setup.routes';

/** Every page route, in wizard order: each feature's routes, one feature after another. */
export const screenRoutes: Routes = [
  ...authRoutes,
  ...landingRoutes,
  ...companyRoutes,
  ...eligibilityRoutes,
  ...paymentRoutes,
  ...eSignatureRoutes,
  ...setupRoutes,
];
