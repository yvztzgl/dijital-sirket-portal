import { Application, FEES } from '@core/models/models';

/**
 * The fee lines (D-3a) and the total (D-3a, D-3b). In HTTP mode they are the API's
 * (`Application.fees`, from `payment.fees`, and the payment's own amount once started); the mock
 * has no `fees` and uses the portal's `FEES`.
 */
export function feeLines(app: Application | null) {
  return app?.fees ?? FEES;
}

export function feeTotal(app: Application | null) {
  return app?.payment?.amount ?? feeLines(app).reduce((s, f) => s + f.amount, 0);
}
