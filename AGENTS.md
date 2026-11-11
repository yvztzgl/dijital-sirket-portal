# Dijital Şirket Platformu — portal

This repository is the **product UI** (Angular 21). There is **no backend yet**: every screen
runs on `src/app/core/mock-api.ts`, an in-browser stand-in that keeps its data in `localStorage`.
See [README.md](README.md) for how the data works, the demo account and the forced scenarios.

## Read this first

The project log, the decisions made so far and the database design are kept in the sibling
repository `dijital-sirket-kurulusu` (GitHub: `jestiyon-dev/dijital-sirket-kurulusu`), normally
checked out next to this one:

- `../dijital-sirket-kurulusu/docs/PROJECT_LOG.md` — where the project stands, what was decided
  and why, what each session did, and the known gaps between this portal and the database design.
- `../dijital-sirket-kurulusu/docs/db-schema.md` — the current database schema with full DDL.
  Its §22.2 maps this portal's `models.ts` to tables, and notes that the schema calls the
  e-Devlet flow `tc` where this portal says `resident`.

If that folder is not present, ask for it before making backend or data-model decisions.

## Documentation rule

Document every step so that a fresh agent or a new team member can continue without the
conversation history. At the end of every piece of work, add a dated entry to the **Log** in
`PROJECT_LOG.md` (what was done, what was verified and how, what was left undone, which files
changed in which repository) and keep its **Where we are now** section true. Do not leave
anything a later reader needs in a temporary directory or only in chat.

## Things to know before editing

- The project is headed for a government contract: **audit logging and security come first** in
  any backend or data work.
- `MockApi` is the working API contract. The README says screens talk only to `ApplicationStore`
  (`src/app/core/application.store.ts`) so that a real HTTP client can replace the mock.
- Templates under `src/app/screens/**.html` and `src/app/shared/*.html` were generated from
  design files and then wired by hand. Re-running the import with `--force` overwrites that
  wiring; see `tools/design-import/README.md`.
- The mock stores passwords in plain text in the browser. That is for the prototype only and
  must not be carried into a real API.
