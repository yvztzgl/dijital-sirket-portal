/**
 * An error the API reports on purpose. `message` is a Turkish sentence meant to be shown to the
 * founder as is; the store shows it next to the action that failed.
 *
 * The mock sets only the message. The HTTP client also fills the rest from the API's problem
 * response (see `toApiError` in http-api.ts):
 * - `code`: the stable machine code, e.g. `validation_failed`, `unauthenticated`, `wrong_stage`.
 * - `status`: the HTTP status.
 * - `fields`: with `validation_failed`, the messages per form field.
 */
export class ApiError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly fields?: Record<string, string[]>;

  constructor(message: string, details: { code?: string; status?: number; fields?: Record<string, string[]> } = {}) {
    super(message);
    this.code = details.code;
    this.status = details.status;
    this.fields = details.fields;
  }
}
