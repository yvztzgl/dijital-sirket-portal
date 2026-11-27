import { Application } from '@core/models/models';

/** D-1d's suggestions after a refused title; the first is shown as Terminal AI's. */
export function titleSuggestions(check: Application['titleCheck']) {
  return (check?.alternatives ?? []).map((full, i) => ({ full, first: i === 0 }));
}
