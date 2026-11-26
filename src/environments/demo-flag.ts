/**
 * Demo controls against the real API (docs/api-client.md, "Demo mode against the API"). Off in every
 * build except `http-demo`, which replaces this file with demo-flag.on.ts. Even when on, the controls
 * show only in HTTP mode and only when the API answers `GET /api/demo` (see DemoServerApi).
 * Kept apart from environment.ts so the two switches can be swapped independently.
 */
export const isDemo = false;
