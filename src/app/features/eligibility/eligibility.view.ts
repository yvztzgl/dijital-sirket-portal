import { Application, FUNDING_LABELS } from '@core/models/models';
import { DURATION, screeningEvents } from '@core/reference/timeline';
import { dec1, hm } from '@core/utils/format';

/**
 * When each of the five lists was searched (the mock's simulated times); empty with the server,
 * which reports none. `speed` is the mock's simulation speed (`ApplicationStore.speed()`).
 */
export function screeningListTimes(app: Application | null, serverDecides: boolean, speed: number): string[] {
  return app?.eligibility && !serverDecides ? screeningEvents(app, DURATION.screening / speed).listTimes : [];
}

/** "14:20:11", or empty without a time. */
export const listTime = (iso?: string) => (iso ? hm(iso).concat(':', new Date(iso).getSeconds().toString().padStart(2, '0')) : '');

/** "Almanya · Pasaport no ●●●●1234 · Son geçerlilik 11/2031" (the mock's passport). */
export function passportLine(app: Application | null) {
  const f = app?.founder;
  if (!app || !f) return '';
  const exp = new Date(app.createdAt);
  return `${f.nationality || '—'} · Pasaport no ●●●●${f.passportNo.slice(-4)} · Son geçerlilik ${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear() + 5}`;
}

/**
 * The finished parts of step 2 (D-2b, D-2c). The mock's score and MRZ line are left out when the
 * server decides: the API sends neither, and nothing is shown that it did not say.
 */
export function doneStages(app: Application | null, serverDecides: boolean) {
  if (!app?.eligibility) return [];
  const doc = app.eligibility.address?.fileName;
  const score = app.eligibility.score;
  return [
    {
      t: 'Kimlik doğrulama',
      s: score === undefined ? 'Kimliğiniz doğrulandı' : `Pasaport MRZ doğrulandı · canlılık eşleşmesi ${dec1(score)}`,
      d: serverDecides ? '' : passportLine(app),
    },
    { t: 'Beyan', s: `${doc ? `Adres belgesi: ${doc}` : 'Adres belgesi alındı'} · fon kaynağı: ${FUNDING_LABELS[app.funding].toLocaleLowerCase('tr-TR')}`, d: `${app.contact.address}, ${app.contact.postalCode} ${app.contact.country}` },
  ];
}
