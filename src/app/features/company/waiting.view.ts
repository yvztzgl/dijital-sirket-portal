import { Application } from '@core/models/models';
import { dateTime } from '@core/utils/format';

/** "Lumora Sunum.pdf · Ozgecmis.pdf": what was received, on D-1b and D-1g. */
export function uploadedFiles(app: Application | null): string {
  return [app?.deck?.fileName, app?.cv?.fileName].filter(Boolean).join(' · ');
}

/** A waiting screen's start as the founder reads it, or null when it is not known. */
export function since(at: string | undefined): string | null {
  return at ? dateTime(at) : null;
}
