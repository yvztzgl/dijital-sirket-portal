# Dijital Şirket Platformu — portal

This repository is the **product UI** (Angular 21). By default every screen runs on
`src/app/core/api/mock/mock-api.ts`, an in-browser stand-in that keeps its data in `localStorage`.
See [README.md](README.md) for how the data works, the demo account and the forced scenarios.
The `http` build configuration swaps the mock for the HTTP client of the real API (being connected
piece by piece since 2026-11-25); see [docs/api-client.md](docs/api-client.md).

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

## Restructuring in progress

The portal is being reorganised into feature folders, in phases: [docs/restructure-plan.md](docs/restructure-plan.md)
says what is done and what is next. Before handing work over, run `npm run lint` (0 errors
expected; the warnings are known and listed in the plan) and `npm test`.
`src/app/features/routes.spec.ts` opens every routed screen once; a new screen is covered as soon
as it is in `screenRoutes`.

## Things to know before editing

- The project is headed for a government contract: **audit logging and security come first** in
  any backend or data work.
- `Api` (`src/app/core/api/api.ts`) is the API contract; `MockApi` and `HttpApi` implement it and the
  build picks one (docs/api-client.md). Screens talk only to `ApplicationStore`
  (`src/app/core/state/application.store.ts`) and never import an implementation; pure checks they need
  live in `src/app/core/utils/rules.ts`. Demo tools (seed, reset, speed, `/screens`, the screen pill and
  demo panel) exist only in mock mode, through `Api.demo`. Separately, the `http-demo` build adds
  demo buttons and on-screen codes on top of the real API when it runs with `Demo:Enabled`
  (`DemoServerApi`, `DemoBar`, `DemoCodeHint`; docs/api-client.md, "Demo mode against the API").
- Templates under `src/app/features/*/pages/**.html` and `src/app/layout/*.html` were generated from
  design files and then wired by hand. Re-running the import with `--force` overwrites that
  wiring; see `tools/design-import/README.md`.
- The mock stores passwords in plain text in the browser. That is for the prototype only and
  must not be carried into a real API.
- Who is signed in is the API's business (an HttpOnly session cookie; in the mock, `MockApi.current`).
  `Api` methods take no e-mail as identity, and in HTTP mode nothing about the founder is written to
  the browser's storage; `dsp.session.v1` and `dsp.lastEmail` are mock-only. A 401
  `unauthenticated` from any call signs the founder out and opens `/login` (`ApplicationStore`).
  The shared `Account` has no password; the mock keeps it in its own `MockAccount`.
- All the wizard screens (D-1a to D-5b) were rebuilt by hand on 2026-11-17 in the "Odak"
  layout: they use `<app-step-page>` (`src/app/layout/step-page.ts`) and the `wz-*` classes in
  `src/wizard.scss`, not inline styles. The owner's rules for this look: **no `box-shadow`
  anywhere**, **formal but short Turkish** on screen (including what Terminal AI answers; its greeting
  "Selam …, sana nasıl yardımcı olabilirim?" is the owner's own wording and stays informal), one
  request per screen stated in the heading. The sign-in screens (D-0a to D-0d) still have the
  earlier look. The design import would overwrite the rebuilt templates.
- Step 1 starts with the profile form (D-1e `/details`, stage `profile`), then the deck upload
  (D-1a, stage `verified`), the scan (D-1b), the check (D-1c) and the trade-name check (D-1f
  `/deck/name-check`, stage `titleChecking`, done by staff on the API, so it can take hours), which
  ends in D-1d (refused) or step 2. Waiting stages are polled in HTTP mode (`Api.work`,
  docs/api-client.md). The form was removed on
  2026-11-20 and brought back on 2026-11-25 by the owner's decision, because the API requires a
  profile before the deck and compares the two (see Decisions in PROJECT_LOG.md). The profile can
  be saved again from D-1a ("Ön bilgileri düzenle") until the deck is uploaded; D-1e therefore
  accepts both `profile` and `verified`. On D-1c every difference between the profile and the deck
  (`crossCheck`, `match: false`) needs the founder's choice before the review can be submitted.
  Old mock data at `verified` without a profile is sent back to the form (`upgrade` in mock-api.ts).
- The deck upload needs two unticked boxes the founder ticks for that upload: privacy notice
  acknowledged and consent to AI processing (`app-deck-consents`, `src/app/features/company/components/deck-consents.ts`).
  D-1c's "Başka dosya yükle" asks for them again. The labels are placeholders until the legal
  wording is decided. Decks are PDF or PPTX, at most 25 MB (`deckFileError` in rules.ts, the API's
  rule); Keynote and 50 MB are gone.
- The deck follows our own format, not a form: `src/app/core/reference/deck-format.json` lists the 16
  required pages, their exact titles and what is read from each (it carries the integrator's
  evaluation fields from `1-basvuru.pdf`). The "Sunum formatı" dialog on D-1a
  (`src/app/features/company/components/deck-format-dialog.ts`) and the sample deck are both built from that file; after
  changing it, rebuild the sample with `tools/sample-deck/build.py`. Consents are never read from
  the deck; they are given on screen.
- Step 2 is three screens and a result: D-2a camera check (stage `eligibility`), D-2d declaration
  with the address-document upload (`declaration`), D-2e list search (`screening`), then D-2b or
  D-2c. Do not make the mock record a document, a consent or a declaration the founder did not
  actually give on screen.
- The identity step (D-2a) starts only on the founder's action, after a consent tick, and can be
  handed to a phone by QR code (`/eligibility/phone#<token>`, screen D-2a-m; the token is in the
  fragment so it never reaches a server). In the mock that
  phone page works only in the browser that made the code. The QR generator is our own
  (`src/app/core/utils/qr.ts`); do not add a package for it. What a real API must do for the link is
  written on `MockApi.createPhoneLink`.
- Never use the browser's `alert()`, `confirm()` or `prompt()`. Ask with the portal's own dialog:
  `await inject(Confirm).ask({...})` (`src/app/core/services/confirm.ts`, rendered by
  `src/app/layout/dialogs/confirm-dialog.ts`). Name the confirming button after the action, not "Tamam".
