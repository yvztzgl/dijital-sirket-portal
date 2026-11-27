# Portal restructuring plan

Written 2026-11-27 at the owner's request ("make it more readable with a better component system,
better foldering, all best practices of Angular"). **A plan only: no code was changed.** The folder
layout (feature folders) is decided; the old landing is deleted; names are English; two questions in "Decisions needed" at the end are open.

## What the code looks like today

Figures were measured on `main` at `80be2b7`.

### What is already sound (keep)

- Standalone components, `OnPush`, signal inputs, lazy routes, strict TypeScript and strict templates.
- The `Api` contract with two implementations (`MockApi`, `HttpApi`) chosen by the build.
- Screens talk to one store, never to an API implementation.
- 13 spec files, 194 tests, all on the core (API, mapper, store, guard).
- Services and reusable components do exist: `ApplicationStore`, `Assistant`, `Inbox`, `Confirm`,
  `Preferences`, and 24 components in `shared/` (select, phone input, OTP input, stepper, side panel…).

### What makes it hard to read

1. **Screens are empty shells.** 27 screen classes are `export class ScreenD4a extends EimzaData {}`.
   All state and logic of a whole group sits in four base classes under `screens/data/`:

   | Base class | Lines | Members | Screens that inherit it |
   |---|---|---|---|
   | `KarsilamaData` | 582 | 87 | 9 (landing, D-1a…D-1g) |
   | `EimzaData` | 519 | 70 | 6 (D-4a…D-5b) |
   | `UygunlukData` | 407 | 64 | 9 (D-2a…D-3b) |
   | `GirisData` | 201 | 25 | 5 (D-0a…D-0e) |

   To read one screen you open three files, and each screen builds every signal of its whole group
   (D-4a carries D-5b's). Inheritance is used only to share code.

2. **Names say nothing.** Files are design codes (`d4a.ts`, `d2e.html`), classes are `ScreenD2e`.
   Folders are Turkish and do not match the steps: `uygunluk/` also holds payment (D-3a, D-3b),
   `eimza/` also holds set-up (D-5a, D-5b), `karsilama/` holds all of step 1. Route paths are English.

3. **No components below the screen.** Each screen is one template (up to 181 lines) built from
   global `wz-*` classes in one 838-line `wizard.scss`. Repeated blocks are copied markup, e.g. the
   requirement tiles and the do/don't rules (D-2a, D-2a-m, D-4a), the consent tick, the waiting
   screens (D-1b, D-1f, D-2e), the meeting stage (D-4a, D-4b), the row-with-pencil editors of D-1c.

4. **`ApplicationStore` does everything** (938 lines): session, the application, server polling,
   the phone link, the second-factor dialog, reference data, documents, demo tools.

5. **`core/` is a flat folder of 31 files** that mixes the API layer, domain models, state, UI
   services, utilities and 1,200 lines of reference JSON. `shared/` mixes form controls, the page
   frame and landing-only pieces (`founder-globe.ts`, 571 lines). `shell/` mixes dialogs and demo tools.

6. **Forms are hand-made.** `@angular/forms` is not used: every field is
   `[value]` + `(input)="x.set($any($event.target).value)"`, and validation is spread over the base classes.

7. **Routes are written twice.** `screens/screens.ts` holds `SCREENS` (id, code, title, path) and
   then 28 route objects repeating the same title and path.

8. **No lint, no import rules.** There is no ESLint; imports are long relative paths
   (`../../core/…`); nothing stops a shared component from importing a screen.

9. **Left-overs.** The old landing (`d00.*`, route `welcome-v1`, 65 inline styles) is kept "for
   comparison". The sign-in screens (D-0a…D-0e) still carry 97 inline `style="…"` attributes.

10. **Only two screens have a test** (D-1a, D-1c).

## Target structure

Feature folders named after what the founder does, with the same sub-folders inside each feature.
File names follow the current Angular style guide (no `.component` suffix; the repo already does this).

```
src/app/
  core/                       app-wide, no UI
    api/                      api.ts (contract), api-error.ts
      http/                   http-api, api-mapper, api-types, status-poller
      mock/                   mock-api, timeline, nace, mock reference JSON
      demo/                   demo-server-api, demo-settings
      testing/                api-fixtures, captured/
    models/                   models.ts split by area (account, application, deck, eligibility, payment, signature, setup)
    state/                    session.store, application.store, server-sync, phone-link.store, step-up.store, reference.store
    flow/                     flow.guard, follow-flow, stage-routes
    services/                 confirm, inbox, doc-preview, preferences, assistant, clock
    utils/                    format, files, qr, rules, countries
  ui/                         reusable controls; never inject a store
    icon/ select/ search-select/ multi-select/ country-select/ phone-input/ otp-input/
    qr-code/ form-error/ checkbox/ chip/ file-drop/ tiles/ do-dont-list/ waiting-state/
  layout/                     the frame every page sits in
    step-page/ top-bar/ stepper/ side-panel/ header-tools/
    dialogs/                  confirm-dialog, doc-preview-dialog, step-up-dialog, inbox-toasts
  demo/                       mock-only tools: demo-bar, demo-panel, demo-nav, screen-index, screen-pill, demo-code-hint
  features/
    auth/                     login, register, verify-email, reset-password, new-password
    landing/                  landing page, founder-globe, arrivals, dot-engraving
    company/                  step 1: profile-form, deck-upload, deck-evaluating, evaluation-questions,
                              company-review, title-check, title-rejected
    eligibility/              step 2: identity-check, identity-phone, declaration, screening, eligible,
                              manual-review, application-closed
    payment/                  step 3: payment-form, three-d-secure
    e-signature/              step 4: call-lobby, call, signature-ready, resident-signature
    setup/                    step 5: setup-progress, setup-complete
```

(As built in phase 1, `ui/`, `layout/`, `demo/` and the `core/` sub-folders hold flat files, not one
folder per component; see "Phase 1 name map".)

Inside a feature:

```
features/e-signature/
  e-signature.routes.ts       this feature's routes, lazy-loaded from app.routes.ts
  call.state.ts               state shared by this feature's pages, provided on the route
  pages/
    call-lobby/               call-lobby.ts  .html  .scss  .spec.ts     (was D-4a)
    call/                     …                                         (was D-4b)
  components/
    meeting-stage/            used by call-lobby and call
    certificate-card/
```

The design code (D-4a) stays in the class comment and in the route's `data.screen`, so the design
canvases, the log and the demo tools still find the screen.

### Rules that come with it

- **A page** reads the store, owns its own UI state, and composes components. No base classes.
- **A component** gets data through `input()` and reports through `output()`. It injects no store.
- State used by several pages of one feature lives in an `@Injectable()` provided on that
  feature's route, not in a root singleton and not in a parent class.
- Import direction, enforced by lint: `features → layout → ui → core`. Features do not import each
  other. `demo/` is imported only where the mock build needs it.
- Template, styles and class in separate files once a template passes about 30 lines.
- Styles live with the component that owns the markup. Global: `tokens.scss`, base typography,
  and the few primitives used everywhere (`wz-btn`, `wz-input`, `wz-card`). Still no `box-shadow`.
- Path aliases: `@core/*`, `@ui/*`, `@layout/*`, `@features/*`.

## Phases

Each phase is its own branch and pull request, leaves the 194 tests green and both builds
(`ng build`, `ng build -c http`) working, and changes behaviour nowhere. Order matters: the safety
net first, the pure moves second, logic last.

| # | Phase | What happens | Risk |
|---|---|---|---|
| 0 | Safety net | Add `angular-eslint` with the import-direction rule switched on as warnings; path aliases; one render test per screen (seed the mock at the screen's stage, expect the heading), so 28 screens are covered before anything moves. Delete `d00.*` and `welcome-v1` if the owner agrees. | Low |
| 1 | Folders and names | Move and rename files to the target structure with `git mv`; split `screens.ts` into per-feature route files generated from one list. No logic changes; the diff is renames and import paths. Update `tools/design-import`, `tools/api-capture`, `AGENTS.md`, `README.md`, `docs/api-client.md`. | Low, large diff |
| 2 | Remove the four base classes | One feature per pull request, smallest first: auth (201 lines) → e-signature and set-up → eligibility and payment → company. Each member moves into the one page that uses it; members used by several pages move to the feature's state service. | Medium |
| 3 | Components out of templates | Extract the repeated blocks first (tiles, do/don't list, consent tick, waiting state, meeting stage, file drop), then cut long pages into sections (D-1c editors, D-1a questions, D-3a card form, D-5a step list). Their `wz-*` rules move from `wizard.scss` into the component. | Medium (visual) |
| 4 | Split `ApplicationStore` | Session, server sync/polling, phone link, second factor and reference data become their own stores. `ApplicationStore` keeps its public members and delegates, so pages change later and one at a time. | Medium, covered by `application.store.spec.ts` |
| 5 | Forms | Move field handling to typed Reactive Forms; the custom controls (`select`, `phone-input`, `otp-input`, `country-select`, `multi-select`) implement `ControlValueAccessor`; server `fieldErrors` map onto controls in one helper. | Medium |
| 6 | Sign-in screens | Remove the 97 inline styles from D-0a…D-0e by rebuilding them on the shared controls. This is a design change (they would take the "Odak" look), so it needs the owner's go-ahead. | Low |

**Status.** Phase 0 was done on 2026-11-27 on branch `chore/restructure-phase-0` (not committed
that day):

- `npm run lint` (`eslint.config.js`, angular-eslint 21). It reports 0 errors and 36 warnings: 25
  accessibility findings in templates, 10 unused names or style points, and 1 folder breach
  (`shared/header-tools.ts` imports `shell/screen-pill`). They are warnings on purpose; the rules
  that found them are named in the config.
- Path aliases in `tsconfig.json`: `@core/*` works today; `@ui/*`, `@layout/*`, `@features/*`,
  `@demo/*` point at the folders phase 1 creates. Existing imports were not rewritten: phase 1
  moves those files anyway.
- `src/app/screens/screens.spec.ts`: one render test per routed screen against the mock (27
  tests; `application-closed` is skipped because the mock cannot reach that stage).
- The old landing is deleted (decision 3): `screens/karsilama/d00.ts`, `d00.html`, the route
  `/welcome-v1`, and the two hero components only it used, `shared/arrivals.ts` and
  `shared/founder-globe.ts` (1,006 lines in all). Its `.d00-*` rules in `src/styles.scss` (about
  80 lines) now match nothing and are still there; remove them in phase 3 with the other styles.

**Phase 1 was done the same day on the same branch** (not committed that day), by the map below:
198 files moved with `git mv`, the 28 pages and four base classes renamed, routes split into one
file per feature, cross-folder imports switched to the aliases, and the lint folder rules pointed
at the new folders. Templates, styles and JSON are byte-for-byte the same.

- Checked after it: 224 tests pass, lint 0 errors and 40 warnings, the three builds complete, and
  each of the 27 screens was opened from `/screens` in the mock build with no console error.
- Lint's 5 new warnings are the cross-feature imports of the base classes (landing → `CompanyData`,
  payment → `EligibilityData`, set-up → `SignatureData`); phase 2 removes them.
- `tools/design-import` was **not** adapted: it still writes the old `screens/<group>/<id>` layout
  and says so at the top of its README. Do not run it.
- Imports inside one feature currently use `@features/<x>/…` too; relative paths would be more
  usual there. Tidy as phase 2 touches each file.

**Phases 0 and 1 were committed on 2026-11-27** on `chore/restructure-phase-0` (`6535366`,
`1fbfbc4`; local, not pushed).

**Phase 2, auth, was done the same day** on branch `refactor/phase-2-auth` (staged, not committed
that day). This is the pattern for the other three base classes:

1. Tests first: a spec per page, driven through the DOM against the real store over the mock,
   passing against the old code before anything else changes (37 tests for the five pages).
2. The base class is deleted. Each page declares only what its own template reads; templates do
   not change in this phase (`git diff --stat -- '*.html'` is empty).
3. Code two pages need becomes a small named piece in the feature folder, not a parent class:
   `features/auth/auth.rules.ts` (pure, with its own spec) and `features/auth/resend-timer.ts`.
4. Calls the base class made on every page (`clearError()`, `takeNotice()`) stay on every page,
   with a comment where the result is not shown.
5. Imports inside a feature are relative; a page's spec uses its own feature's routes.

Result for auth: 267 tests pass (224 + 43), lint unchanged (0 errors, 40 warnings), three builds
complete, the sign-in screens tried in the browser. Still to do in phase 2: e-signature and set-up
(`SignatureData`), eligibility and payment (`EligibilityData`), company and landing (`CompanyData`).

Found while reading the auth code, **not fixed** (behaviour kept as it was):

- Login: the "30 gün oturumu açık tut" tick is never sent anywhere.
- Login: the mock remembers the e-mail even after a failed sign-in.
- Register: after a failed attempt as a foreign founder, switching to "T.C. vatandaşı" can show
  "Geçerli bir e-posta adresi girin." although that path has no e-mail field.
- Verify e-mail: "resend" empties the code boxes before the request, even if it then fails.

Phases 0 and 1 give the readable folder tree. Phases 2 and 3 give the readable components and are
the bulk of the work. Phases 4 to 6 can each be postponed without blocking the others.

Each phase ends with a visual check of every touched screen in mock mode (`/screens` lists them all)
and an entry in `PROJECT_LOG.md`.

## Phase 1 name map

Phase 1 is a move: files change place and name, imports change path, and nothing else changes.
Folders hold flat files in `core/*`, `ui/`, `layout/` and `demo/`; a page gets a folder of its own.
The screen id in the route's `data.screen` (`d4a`) and in `SCREEN_STAGES` does **not** change: the
guard, `followFlow` and the demo tools use it.

### Pages (`src/app/screens/…` → `src/app/features/…`)

| Code | Old file (`screens/`) | New folder and file base (`features/`) | Class | Selector |
|---|---|---|---|---|
| D-0a | `giris/d0a` | `auth/pages/login/login` | `LoginPage` | `app-login-page` |
| D-0b | `giris/d0b` | `auth/pages/register/register` | `RegisterPage` | `app-register-page` |
| D-0c | `giris/d0c` | `auth/pages/verify-email/verify-email` | `VerifyEmailPage` | `app-verify-email-page` |
| D-0d | `giris/d0d` | `auth/pages/reset-password/reset-password` | `ResetPasswordPage` | `app-reset-password-page` |
| D-0e | `giris/d0e` | `auth/pages/new-password/new-password` | `NewPasswordPage` | `app-new-password-page` |
| D-00 | `karsilama/landing` | `landing/pages/landing/landing` | `LandingPage` | `app-landing-page` |
| D-1e | `karsilama/d1e` | `company/pages/profile-form/profile-form` | `ProfileFormPage` | `app-profile-form-page` |
| D-1a | `karsilama/d1a` | `company/pages/deck-upload/deck-upload` | `DeckUploadPage` | `app-deck-upload-page` |
| D-1b | `karsilama/d1b` | `company/pages/deck-evaluating/deck-evaluating` | `DeckEvaluatingPage` | `app-deck-evaluating-page` |
| D-1g | `karsilama/d1g` | `company/pages/evaluation-questions/evaluation-questions` | `EvaluationQuestionsPage` | `app-evaluation-questions-page` |
| D-1c | `karsilama/d1c` | `company/pages/company-review/company-review` | `CompanyReviewPage` | `app-company-review-page` |
| D-1f | `karsilama/title-check` | `company/pages/title-check/title-check` | `TitleCheckPage` | `app-title-check-page` |
| D-1d | `karsilama/rejection` | `company/pages/title-rejected/title-rejected` | `TitleRejectedPage` | `app-title-rejected-page` |
| D-2a | `uygunluk/d2a` | `eligibility/pages/identity-check/identity-check` | `IdentityCheckPage` | `app-identity-check-page` |
| D-2a-m | `uygunluk/d2m` | `eligibility/pages/identity-phone/identity-phone` | `IdentityPhonePage` | `app-identity-phone-page` |
| D-2d | `uygunluk/d2d` | `eligibility/pages/declaration/declaration` | `DeclarationPage` | `app-declaration-page` |
| D-2e | `uygunluk/d2e` | `eligibility/pages/screening/screening` | `ScreeningPage` | `app-screening-page` |
| D-2b | `uygunluk/d2b` | `eligibility/pages/eligible/eligible` | `EligiblePage` | `app-eligible-page` |
| D-2c | `uygunluk/d2c` | `eligibility/pages/manual-review/manual-review` | `ManualReviewPage` | `app-manual-review-page` |
| — | `uygunluk/closed` | `eligibility/pages/application-closed/application-closed` | `ApplicationClosedPage` | `app-application-closed-page` |
| D-3a | `uygunluk/d3a` | `payment/pages/payment-form/payment-form` | `PaymentFormPage` | `app-payment-form-page` |
| D-3b | `uygunluk/d3b` | `payment/pages/three-d-secure/three-d-secure` | `ThreeDSecurePage` | `app-three-d-secure-page` |
| D-4a | `eimza/d4a` | `e-signature/pages/call-lobby/call-lobby` | `CallLobbyPage` | `app-call-lobby-page` |
| D-4b | `eimza/d4b` | `e-signature/pages/call/call` | `CallPage` | `app-call-page` |
| D-4c | `eimza/d4c` | `e-signature/pages/signature-ready/signature-ready` | `SignatureReadyPage` | `app-signature-ready-page` |
| D-4d | `eimza/d4d` | `e-signature/pages/resident-signature/resident-signature` | `ResidentSignaturePage` | `app-resident-signature-page` |
| D-5a | `eimza/d5a` | `setup/pages/setup-progress/setup-progress` | `SetupProgressPage` | `app-setup-progress-page` |
| D-5b | `eimza/d5b` | `setup/pages/setup-complete/setup-complete` | `SetupCompletePage` | `app-setup-complete-page` |

Every file of a page moves with it (`.ts`, `.html`, `.scss`, `.spec.ts`).

### The four base classes (they stay until phase 2)

| Old | New | Class |
|---|---|---|
| `screens/data/giris.data.ts` | `features/auth/auth.data.ts` | `AuthData` |
| `screens/data/karsilama.data.ts` | `features/company/company.data.ts` | `CompanyData` |
| `screens/data/uygunluk.data.ts` | `features/eligibility/eligibility.data.ts` | `EligibilityData` |
| `screens/data/eimza.data.ts` | `features/e-signature/e-signature.data.ts` | `SignatureData` |

Three of them serve two features (landing reads `CompanyData`, payment reads `EligibilityData`,
set-up reads `SignatureData`). Those imports cross a feature border and lint warns about them
until phase 2 removes the classes.

### Routes and the screen list

| Old | New |
|---|---|
| `screens/screens.ts`, `screenRoutes` | one `features/<feature>/<feature>.routes.ts` per feature holding that feature's route objects unchanged, and `features/routes.ts` exporting `screenRoutes` (all of them, in today's order) |
| `screens/screens.ts`, `SCREENS`, `SCREEN_GROUPS`, `ScreenInfo` | `demo/screens.ts` (only the demo tools read them) |
| `screens/screens.spec.ts` | `features/routes.spec.ts` |

### `core/`

| New folder | Files (with their specs) |
|---|---|
| `core/api/` | `api`, `api-error` |
| `core/api/http/` | `http-api`, `api-mapper`, `api-types`, `status-poller` |
| `core/api/mock/` | `mock-api`, `evaluation-reference.json`, `evaluation-activity-groups.json` |
| `core/api/demo/` | `demo-server-api`, `demo-settings` |
| `core/api/testing/` | `testing/api-fixtures`, `testing/captured/` |
| `core/models/` | `models` (one file for now) |
| `core/state/` | `application.store` |
| `core/flow/` | `flow.guard`, `follow` |
| `core/services/` | `assistant`, `confirm`, `inbox`, `doc-preview`, `preferences`, `clock` |
| `core/reference/` | `countries`, `nace`, `timeline`, `deck-format.ts`, `deck-format.json` |
| `core/utils/` | `format`, `files`, `qr`, `rules` |

### `shared/` and `shell/`

| New place | Files |
|---|---|
| `ui/` (no store) | `icon`, `select`, `search-select`, `multi-select`, `country-select`, `country-list`, `phone-input`, `otp-input`, `qr-code` |
| `layout/` | `step-page`, `top-bar` + `topbar.html`, `stepper` + `stepper.html`, `side-panel` + `sidepanel.html`, `header-tools`, `form-error`, `bot`, `ai-card` + `aicard.html` |
| `layout/dialogs/` | `confirm-dialog`, `doc-preview-dialog`, `step-up-dialog`, `inbox-toasts` |
| `demo/` | `demo-bar`, `demo-code-hint`, `demo-nav`, `demo-panel`, `screen-index`, `screen-nav`, `screen-pill` |
| `features/auth/components/` | `dot-engraving`, `edevlet-dialog` |
| `features/company/components/` | `deck-consents`, `deck-format-dialog` |
| `features/landing/` | `founders.data`, `globe-data` |

`form-error` reads the store, so it is in `layout/`, not `ui/`. `ai-card` is imported by nothing
(checked 2026-11-27); it moves with the rest and the owner decides later whether to delete it.

## Not in this plan

- **Translation.** All on-screen Turkish is written in templates and classes, while the API already
  sends `translationKey`s. Smaller components make a later move to a translation layer easier, but
  that is its own project.
- **The design import.** After phase 1 `tools/design-import` can no longer write into the screens.
  The wizard was rebuilt by hand on 2026-11-17, so the plan treats the import as retired for screens
  that were rebuilt; say so if it is still needed.
- Any change to the `Api` contract, the mock's behaviour or the API.

## Decisions needed

1. ~~Feature folders or layer folders?~~ **Decided 2026-11-27 by the owner: feature folders**
   (`features/payment/pages`, `…/components`), as drawn in "Target structure". This differs on
   purpose from the API's classic layer folders (2026-11-24).
2. ~~English names for folders, files and classes?~~ **Decided 2026-11-27 by the owner: English
   names.** The map is in "Phase 1 name map".
3. ~~Delete the old landing (`d00.*`, `/welcome-v1`)?~~ **Decided and done 2026-11-27: deleted.**
4. **Forms:** Reactive Forms (stable) as planned. Angular 21's Signal Forms would fit the signal
   code better but are still marked experimental, so the plan does not use them.
5. **Sign-in screens:** restyle to the "Odak" look in phase 6, or only move their inline styles
   into classes and keep the look?
