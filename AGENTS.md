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
- All the wizard screens (D-1a to D-5b) were rebuilt by hand on 2026-11-17 in the "Odak"
  layout: they use `<app-step-page>` (`src/app/shared/step-page.ts`) and the `wz-*` classes in
  `src/wizard.scss`, not inline styles. The owner's rules for this look: **no `box-shadow`
  anywhere**, **formal but short Turkish** on screen (including what Terminal AI answers; its greeting
  "Selam …, sana nasıl yardımcı olabilirim?" is the owner's own wording and stays informal), one
  request per screen stated in the heading. The sign-in screens (D-0a to D-0d) still have the
  earlier look. The design import would overwrite the rebuilt templates.
- Step 1 starts at the deck upload (D-1a, stage `verified`), then the scan (D-1b) and the check
  (D-1c). The profile form D-1e and its comparison with the deck were removed on 2026-11-20,
  because the deck format now carries everything the form asked; do not add a form back in front
  of the deck. Applications saved at the old `profile` stage continue at D-1a (`upgrade` in
  mock-api.ts).
- The deck follows our own format, not a form: `src/app/core/deck-format.json` lists the 16
  required pages, their exact titles and what is read from each (it carries the integrator's
  evaluation fields from `1-basvuru.pdf`). The "Sunum formatı" dialog on D-1a
  (`src/app/shared/deck-format-dialog.ts`) and the sample deck are both built from that file; after
  changing it, rebuild the sample with `tools/sample-deck/build.py`. Consents are never read from
  the deck; they are given on screen.
- Step 2 is three screens and a result: D-2a camera check (stage `eligibility`), D-2d declaration
  with the address-document upload (`declaration`), D-2e list search (`screening`), then D-2b or
  D-2c. Do not make the mock record a document, a consent or a declaration the founder did not
  actually give on screen.
- The identity step (D-2a) starts only on the founder's action, after a consent tick, and can be
  handed to a phone by QR code (`/eligibility/phone/<token>`, screen D-2a-m). In the mock that
  phone page works only in the browser that made the code. The QR generator is our own
  (`src/app/core/qr.ts`); do not add a package for it. What a real API must do for the link is
  written on `MockApi.createPhoneLink`.
- Never use the browser's `alert()`, `confirm()` or `prompt()`. Ask with the portal's own dialog:
  `await inject(Confirm).ask({...})` (`src/app/core/confirm.ts`, rendered by
  `src/app/shell/confirm-dialog.ts`). Name the confirming button after the action, not "Tamam".
