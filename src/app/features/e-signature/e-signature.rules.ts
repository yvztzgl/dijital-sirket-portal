import { Application } from '@core/models/models';

/**
 * HTTP mode: the certificate has expired. The API then reports `signing` again with the old
 * certificate still in the view, and refuses the set-up; signing must be done again (D-4a / D-4d).
 */
export function signatureExpired(app: Application | null, now: number) {
  return app?.stage === 'signing' && !!app.signature && Date.parse(app.signature.validUntil) <= now;
}

/** The founder's initials, shown where the camera picture would be (D-4a, D-4b). */
export function founderInitials(app: Application | null) {
  const f = app?.founder;
  return `${f?.firstName?.[0] ?? ''}${f?.lastName?.[0] ?? ''}`.toLocaleUpperCase('tr-TR');
}
