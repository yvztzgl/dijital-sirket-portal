# API client

How the portal talks to the platform API, and how to run it against the mock or the real API.
This note grows with each piece of the API connection; the dated history is in
`../dijital-sirket-kurulusu/docs/PROJECT_LOG.md`.

## Shape

```
screens ─► ApplicationStore ─► Api (abstract class, used as the injection token)
                                ├─ MockApi   (in-browser stand-in; demo tools exist only here)
                                └─ HttpApi ─► HttpClient ─► /api/*   (dev: Angular proxy ─► http://localhost:5149)
```

| File | What it is |
| --- | --- |
| `src/app/core/api.ts` | `Api`: every call the store and Terminal AI make, all async. Also `Session`, `ReviewPatch`, `DemoTools`. |
| `src/app/core/api-error.ts` | `ApiError`: `message` (Turkish, shown as is), optional `code`, `status`, `fields`. |
| `src/app/core/mock-api.ts` | `MockApi implements Api`: data in `localStorage` (`dsp.db.v1`), simulated delays, demo tools. |
| `src/app/core/http-api.ts` | `HttpApi implements Api`, the `request()` helper, `toApiError()`, the `markApiWrites` interceptor. |
| `src/app/core/api-types.ts` | The API's JSON as it arrives (`MeWire`, `ApplicationWire`, …), written from the API's `Models/` records. |
| `src/app/core/api-mapper.ts` | `toAccount(me)`, `toApplication(view, account)`, `toStage`: wire → portal model. Pure functions. |
| `src/app/core/testing/api-fixtures.ts` | Literal API answers the specs use: a few built by hand, and `CAPTURED` (below). |
| `src/app/core/evaluation-reference.json` | The outside evaluation service's dictionary saved on 2026-11-25 (17 activity groups, 216 activities, 4 business models, 8 revenue models, 4 product types) and the upload limits, in the shape of `GET /api/reference/evaluation`. The mock's answer and the specs' fixture; not in the http bundle. |
| `src/app/core/evaluation-activity-groups.json` | Which activity belongs to which group: a verbatim copy of the API's `stb-activity-groups-derived-2026-11-26.json`. **Derived by us from the labels and the id order, not from STB, to be confirmed** (its `note`; the uncertain cases are in the API repo's `docs/steps/19-activity-groups.md`). The mock adds it as `groupId` to each activity of its reference answer; not in the http bundle. |
| `src/app/core/testing/captured/*.json` | `GET /api/application` as the running API answered it at each stage of steps 1 to 5 (the deck-reader stages `scanning`, `review-open`, `review-decided` were removed with the reader on 2026-11-25; the later files still carry its `crossCheck` and deck fields, which the mapper ignores), plus the status read, the reference data, the phone routes, the closed application's 404 and the refusals of steps 3 and 4 (2026-11-25). Made-up founders, e-mail addresses and the phone token replaced; the card is only ever a development token; no T.C. kimlik no. |
| `tools/api-capture/capture.sh` | Re-captures those files against a running stack (`capture.sh [step1\|step2\|step3\|step45\|all]`; needs `../dijital-sirket-api/dev/staff.sh` for the title, review and set-up steps and `dev/last-code.sh` for the second factor). |
| `src/app/shell/step-up-dialog.ts` | `StepUpDialog`: the second-factor dialog, rendered once by the app shell; its state and logic are in `ApplicationStore` (below). |
| `src/app/core/status-poller.ts` | `StatusPoller` and `pollDelay`: the pacing of the status poll in HTTP mode. |
| `src/app/core/rules.ts` | Pure checks the screens use (card, T.C. kimlik no, password strength, address document size, the deck upload's checks `evaluationErrors`, funding options, title suffix and title suggestions). Not part of either implementation. |
| `src/environments/environment.ts` | Default (mock) mode: names `MockApi`, no extra providers. |
| `src/environments/environment.http.ts` | HTTP mode: names `HttpApi`, provides `HttpClient` with the interceptor. |
| `proxy.conf.json` | Dev server: `/api` → `http://localhost:5149`. |
| `src/environments/demo-flag.ts` / `demo-flag.on.ts` | `isDemo`: off, and on in the `http-demo` build (see "Demo mode against the API"). |
| `src/app/core/demo-server-api.ts` | `DemoServerApi`: the API's `/api/demo/*` routes and `available`; not part of `Api`. |
| `src/app/shell/demo-bar.ts`, `demo-code-hint.ts` | The demo strip on the waiting screens and the on-screen code / link line. |

Screens never import an implementation. `mock-api.ts` still re-exports `ApiError`, `ReviewPatch`
and the rules so older imports and `mock-api.spec.ts` keep working; new code imports from
`api.ts`, `api-error.ts` and `rules.ts`.

## How the mode is chosen

`Api` is `providedIn: 'root'` with `useFactory: () => inject(environment.api)`. The default
`environment.ts` names `MockApi`; the `http` configuration in `angular.json` replaces that file
with `environment.http.ts` (`fileReplacements`), which names `HttpApi`. So:

- each build contains only its own implementation (checked: the http build has no trace of
  `mock-api.ts`, e.g. the `dsp.db.v1` key, the demo password or the MERSİS list; the default
  build has no `HttpClient` and no interceptor);
- tests run on the default environment, so existing specs get the mock without extra setup.

`MockApi` and `HttpApi` use `implements Api`, not `extends`: `api.ts` imports the environment,
which imports the implementation, and an `extends` would import `api.ts` back at runtime.

## Demo tools exist only in mock mode

Seeded founders (`seed`), reset, the demo panel's speed and forced scenarios, the `/screens` index,
the screen pill and the demo panel are demo tools. They hang off one property: `Api.demo`
(`DemoTools`), which the mock sets and `HttpApi` leaves `null`.

- `ApplicationStore.seed()` / `resetAll()` refuse without it; `store.speed()` is 1 without it.
- The header's screen pill, the floating screen navigator and the `/screens` route
  (`canMatch`) appear only when `Api.demo` is set.
- Two mock-mode conveniences hang off it too: `onExternalChange` (another tab changed the mock's
  data) and `rememberedEmail` / `rememberEmail` (the last e-mail typed on a sign-in screen,
  `dsp.lastEmail`). Without demo tools nothing about the founder is kept in the browser.

`DemoSettings` (speed, forced scenarios) is read only through the mock. Its class is still in the
http bundle because the demo panel is imported by the screen pill, but nothing creates it there.

## Running each mode

| | Mock (default) | HTTP |
| --- | --- | --- |
| Serve | `npx ng serve` | `npx ng serve --configuration http` (the API must run on `http://localhost:5149`; see below) |
| Build | `npx ng build` | `npx ng build --configuration production,http` (`--configuration http` alone also builds, without output hashing and budgets) |
| Test | `npx ng test --watch=false` | same; `http-api.spec.ts` tests `HttpApi` with `HttpTestingController` |
| `.claude/launch.json` | `portal` | `portal-http` (`portal-http-demo` for demo mode) |

Development is same-origin: the browser only ever talks to `localhost:4200`, and the dev server
forwards `/api/*` to the API. That is why no `withCredentials` and no CORS setup are needed. How
production serves the portal and the API is still open (open decision 6 in the project log).

## Running HTTP mode locally

1. In `../dijital-sirket-api`: `dev/up.sh` (database), then `dev/run.sh` (Api, Worker, BackOffice;
   `run.sh api` starts the Api alone). Details: that repository's `docs/steps/13-run-locally.md`.
2. Here: `npx ng serve --configuration http --port 4200` and open `http://localhost:4200`.
3. E-mails do not go out in development. The code for D-0c: `dev/last-code.sh <address>` in the API
   repository. The password-reset link: the newest file in `dev/outbox/` for that address
   (`jq -r .body`). It points at `http://localhost:4200/sifre-sifirla?token=…`, so serve the portal on
   4200 or change the port in the link by hand.
4. e-Devlet: the dialog takes any T.C. kimlik no with valid check digits, e.g. `10000000146`.

The portal never shows, prefills or hints at a code in this mode: codes go only by e-mail (the
Inbox toasts belong to the mock, and nothing in HTTP mode sends to the Inbox). The one exception is
the `http-demo` build against an API started with `Demo:Enabled` (next section).

## Demo mode against the API (since 2026-11-26)

Plan: `../dijital-sirket-kurulusu/docs/plans/demo-mode.md`. Owner's choices: **buttons only** (nothing
moves on its own), **local machines only**, the mock and its demo panel stay as they are. Demo mode
adds controls on top of the real API so a walkthrough does not stall where a founder waits for staff,
the Worker or an outside service, and shows the codes that otherwise sit in the API's `dev/outbox/`.

### How to run

1. In `../dijital-sirket-api`: `dev/up.sh`, then start the Api and the Worker with `Demo:Enabled=true`
   (the API's demo launch profile / `appsettings.Development.json`; see that repository's
   `docs/steps/20-demo-mode.md`). The API refuses to start with it outside Development/Testing.
2. Here: `npx ng serve --configuration http-demo --port 4200` (`.claude/launch.json`: `portal-http-demo`).
   Build check: `npx ng build --configuration http-demo`.

### When the controls show

`isDemo` is a separate file from `environment.ts` (`src/environments/demo-flag.ts`, `false`), replaced
by `demo-flag.on.ts` (`true`) only in the `http-demo` configuration, which also swaps in
`environment.http.ts`. `DemoServerApi.available()` is true only when **all three** hold: the flag is on,
the portal is in HTTP mode (`Api.demo === null`), and `GET /api/demo` answered `{"enabled": true}`
(404, when the API runs without demo, or any error means no). The question is asked once, the first
time something injects `DemoServerApi` (a demo strip, a code line, the e-Devlet dialog). The mock build
never asks: there is no flag, and it has demo tools.

`DemoServerApi` uses the app's `HttpClient` (loaded with a dynamic import, since the mock build provides
none), so its writes carry `X-DSP-Request` (`markApiWrites`), and errors are `ApiError`s (`toApiError`):
a 409 `demo_wrong_stage` shows the API's own sentence.

### The buttons (`DemoBar`, `src/app/shell/demo-bar.ts`)

A dashed strip labelled "Demo" on the waiting screens. It picks its buttons from the current stage and
renders nothing at other stages. While a request is in flight the buttons are disabled; an error shows
under them for 6 s. After every click (success or refusal) the store's `checkServerNow()` reads the
application and starts the **existing** status poll's pace over (every 2 s again), so the stage the
Worker sets a moment later arrives by itself. No new polling loop.

| Screen (stage) | Buttons | Request |
| --- | --- | --- |
| D-1b (`evaluating`) | Tamamlandı · Soru var · Başarısız · Reddedildi | `POST /api/demo/evaluation {outcome: done\|questions\|failed\|rejected}` |
| D-1g (`evaluationQuestions`) | Tamamlandı | `POST /api/demo/evaluation {outcome: "done"}` |
| D-1f (`titleChecking`) | Rezerve et · Reddet | `POST /api/demo/title {result: reserved\|rejected}` |
| D-2c (`manual`, HTTP branch) | Onayla · Reddet | `POST /api/demo/review {decision: approve\|reject}` |
| D-5a (`setup`) | Sıradaki kurumu tamamla | `POST /api/demo/setup/next` → `{completed, remaining}`, shown as "… tamamlandı · kalan N" |

D-5a: 409 `demo_nothing_open` (the Worker has not opened a task yet) is shown as "Kurum görevleri henüz
açılmadı, birkaç saniye sonra tekrar deneyin."

### The codes (`DemoCodeHint`, `src/app/shell/demo-code-hint.ts`)

A line "Demo: kod 123456" with "Doldur" (fills the code boxes; the founder still presses the button),
read from `GET /api/demo/codes?email=` (the newest development e-mail to that address; no sign-in), with
"Yenile" because the e-mail can be written a moment after the send was answered.

| Where | Address | Read again when |
| --- | --- | --- |
| D-0c e-mail verify | the address waiting for its code (`pendingEmail`) | "Kodu tekrar gönder" |
| D-0d password reset | the address typed, after "Bağlantı gönder"; shows "Bağlantıyı aç", which opens the link's path in this portal (any port) | "Tekrar gönder" |
| Step-up dialog | the signed-in account's e-mail, once the code was sent | "Kodu yeniden gönder" |
| D-3b 3-D Secure | none: the fixed `threeDsCode` from `GET /api/demo` | — |

D-0e (the set-new-password screen) needs no hint: it is opened by the link itself. The e-Devlet dialog's
"Demo için geçerli bir numara: 10000000146" now shows only in mock mode or when demo is available; its
"Simülasyon" badge stays in both modes.

### Not covered

- The slow steps' outcomes (rows 8, 9, 12 of the plan: identity pass/fail, screening hit, shorter call),
  documents (D-5b, the side panel) and Terminal AI: later, by the owner's choice.
- "Expire now" for the certificate (D-4c).
- A walk against an API with demo enabled: the API routes were built in parallel and were **not running
  when this was written**. Checked: unit tests (`demo-server-api.spec.ts`: off in mock mode, off without
  the flag, off on 404, on when enabled, the write header and `demo_wrong_stage`; `demo-bar.spec.ts`:
  hidden when not available, the title check's buttons when available), `ng build --configuration
  http-demo`, and the http-demo build served on port 4310 with no API: `GET /api/demo` is asked once
  when the e-Devlet dialog opens, fails, and the demo T.C. hint stays hidden.

## The deck step: outside evaluation (since 2026-11-25, piece 9)

Owner's decision of 2026-11-25: "Replace the deck step with the STB evaluation." The AI deck reader,
the scanning screen and the comparison with the profile (cross-check) are gone. The founder uploads the
deck **and a CV**, answers five questions, and an outside evaluation service (STB) evaluates them for
**minutes**. Afterwards the founder fills the company form (D-1c) themselves, with defaults from the
profile and the account. The text of step 1 below that speaks of `scanning`, deck fields and
cross-checks describes the state before this piece.

**Written against the contract, then checked against the API** (joined check below). The choices the
portal made before the API existed, all confirmed by the API as built:

- the deck's multipart part stays `file` (the name of the first deck upload); the CV is `cv`;
- `activityGroupId` and `activityId` are sent only when chosen; each multiple choice is one repeated
  field per id (`businessModelIds=1`, `businessModelIds=2`);
- the summary's length is counted after trimming;
- the consent refusal's sentence (`DECK_CONSENT_ERROR`) is the portal's own wording; the API answers a
  missing consent alone as `errors.consent`, before any other field, with its own sentence (shown in the
  banner; the screen does not send without both ticks anyway);
- `evaluationQuestions` is polled like `manual` (slowest pace), in case the server moves on by itself;
- after the evaluation `trade_name` and `nace_codes` may arrive as absent or as an empty value with any
  mark: an empty value gets no mark on screen (since 2026-11-26 they normally arrive filled, see
  "Proposed title and codes" below);
- the document type of the CV in `documents` is taken to be `cv` ("Özgeçmiş").

Also as built: an oversize file is refused alone (`errors.deck` or `errors.cv`); an upload while an
evaluation is queued, running, has questions or is done answers 409 `wrong_stage` (the store re-reads);
`review` is `{}` until the evaluation is done, and then has no `trade_name` / `nace_codes` keys
(as captured on 2026-11-25; superseded by the next section).

### Proposed title and codes (owner's decision of 2026-11-26)

At stage `review` the API sends `review.trade_name` and `review.nace_codes` as defaults with
`mark: "profile"`, in the same `{label, value, mark}` shape as the other review fields; after the
founder changes one its mark is `edited`. The portal needed **no change in HTTP mode** for this: the
mapper turns any non-empty field marked `profile` into `marks.title` / `marks.nace` = `profile` and
D-1c shows it filled with "Ön bilgilerinizden", like Kurucu or E-posta (`edited` / `entered` show
"Kontrol edildi").

- Proposed title: the profile's brand trimmed; kept as it is when it already ends with "Anonim Şirketi"
  or "A.Ş." (any case), otherwise brand + " Anonim Şirketi"; no default when that would fail the title
  check. The portal's copy of the rule is `rules.proposedTitle`; its "title check" is the D-1d rule
  (3–160 characters before the suffix), since the API's own check was not visible when this was
  written. The suffix is stripped for display (`withoutSuffix`), so the row reads "Lumora Anonim
  Şirketi" either way.
- Proposed codes: the NACE codes of the profile's sector (`SECTORS[sector].nace`, the codes the NACE
  editor lists as "Faaliyet alanınıza uygun"); none for "Diğer".
- `MockApi.completeEvaluation` gives the same two defaults with the same marks; submitting without
  touching them sends the proposed title to the title check. Mock applications saved at `review`
  before this change keep their empty title and codes.
- D-1c's lead asks the founder to check the proposed title and codes and correct them if needed.

### Joined check (2026-11-25, HTTP mode on port 4330 against the API worktree on 5150)

- Founder 1 (registered by e-mail): code → D-1e (demo values) → D-1a with a real 3-page PDF deck and a
  1-page PDF CV (attached by page script), the five answers and both ticks → D-1b "Sunumunuz
  değerlendiriliyor" (status reads only) → about 10 s later D-1c with "Ön bilgilerinizden" on Kurucu,
  Uyruk, Sermaye kaynağı, E-posta, Telefon and Adres (country), title and Faaliyet "—" → title typed,
  62.01 added from "Faaliyet alanınıza uygun" → "Onayla ve devam et" → D-1f (`titleChecking`).
- Founder 2 (e-Devlet, test T.C. no): profile → D-1a with a deck named `sunum-questions.pdf` → D-1b →
  D-1g "Değerlendirme için ek bilgi gerekiyor"; polling went on with status reads only.
- Found and fixed: D-1c's title field saved on both Enter and `change`, which Chrome fires together on
  Enter, so the same PATCH went twice and the second got 409 ("Bu işlem zaten yapılmış."). It now saves
  on `change` only. The register screen's step list still said "AI bilgilerinizi okur".
- Console: only the expected 401 (`/api/me` before sign-in) and 404 (`no_application` before it is
  created), and the 409 above before the fix.
- Not walked: `failed` / `rejected` notices on D-1a against the API (captured and mapped instead), a
  refused upload's field errors from the API, the oversize refusal, a reload during the evaluation.

### Requests

```
Reference   GET  /api/reference/evaluation → {activityGroups, businessModels, revenueModels,
                 productTypes: [{id,label}], activities: [{id,label,groupId?}],
                 limits:{deckMaxMb,cvMaxMb,deckMinPages,deckMaxPages,summaryMin,summaryMax}}
                 once per session (cached in HttpApi, dropped on sign-out). groupId (2026-11-26) is the
                 activity's group, a derived mapping not from STB, to be confirmed; an API built before
                 it sends none, and D-1a then keeps group and activity independent (no filtering)
Upload      POST /api/application/deck  multipart: file (deck, PDF), cv (PDF), summary, activityGroupId,
                 activityId, businessModelIds*, revenueModelIds*, productTypeIds*, noticeAcknowledged, aiConsent   202
                 400 validation_failed with errors.<deck|cv|summary|activityGroupId|activityId|businessModelIds|
                 revenueModelIds|productTypeIds>, shown at the fields on D-1a; an activity outside the
                 chosen group: errors.activityId = ["Seçilen faaliyet alanı, seçilen faaliyet grubuna ait
                 değildir."] (rules.ACTIVITY_NOT_IN_GROUP; the screen and the mock check it too)
Polling     GET  /api/application/status (then GET /api/application only when it changed)
```

### Stages

| API stage (+ `evaluation.status`) | Screen | Polled? | What ends it |
| --- | --- | --- | --- |
| `verified`, `evaluation` null | D-1a `/deck` | no | the upload |
| `evaluating` (`queued` / `running`) | D-1b `/deck/evaluating` | yes | the service: `review`, `evaluationQuestions`, or `verified` |
| `evaluationQuestions` (`questions`) | D-1g `/deck/more-information` (new) | yes (slow) | the founder: answers the questions on D-1g (API step 22), then `evaluating` |
| `verified` + `failed` / `rejected` / `cancelled` | D-1a with a notice above the form (for `rejected`, worded by `evaluation.reason`) | no | a new upload, a new evaluation |
| `review` (`done`) | D-1c `/deck/review` (company form) | no | submit |

`/deck/scan` and the old `/sunum/tarama` redirect to `/deck/evaluating`.

### Screens

- **D-1a** (`/deck`): deck (PDF, 3–40 pages, 25 MB) and CV (PDF, 5 MB) pickers; the summary with a live
  length hint; the activity group (`Select`) and the activity (`SearchSelect`, new in
  `shared/search-select.ts`: a text box that filters the 216 options); business model, revenue model
  and product type as tick boxes; the two consents, unticked. The screen's own checks
  (`rules.evaluationErrors`, the same ones the mock refuses with) and the API's `errors` are shown at
  their fields. The page count cannot be checked in the browser; the service ends the evaluation
  `rejected`. A notice above the form after `failed`, `rejected` (with "3 ile 40 sayfa arasında bir PDF")
  or `cancelled`. **Since API step 21 (2026-11-26)** `evaluation.reason` says why a `rejected`
  evaluation was rejected: with `formDeckConflict` (the service found that the form does not describe
  the deck) the notice is "Form yanıtlarınız sunumunuzla uyuşmuyor" and asks to correct the summary,
  the activity and the revenue model; with no reason, or one this build does not know, the page-count
  notice stays. The service's own code and message never reach the portal. The mock never sets a
  reason. The wording is to confirm. "Ön bilgileri düzenle" whenever the stage is `verified`: before
  the first upload and, since API step 21, again after an evaluation that ended without a result (the
  brand is sent to the service as the startup name, so a conflict may need it corrected).
- **D-1b** (`/deck/evaluating`): a status page like D-1f. Says the evaluation takes a few minutes, that
  the page may be closed, and updates itself; when the evaluation started. The retry count
  (`attempt` / `maxAttempts`) is mapped but never shown to the founder (owner, 2026-11-26). No
  progress bar: the duration is not known.
- **D-1g** (`/deck/more-information`): a stop state. The evaluation needs more information and the
  founder will be contacted; no form (the question format is not known, and no question content reaches
  the founder).
- **D-1c** (company form): no AI badges, page references, cross-check block, flagged-values block,
  "Terminal AI" title suggestions or "Başka dosya yükle" (a new deck no longer fills the form). Values
  marked `profile` carry a quiet "Ön bilgilerinizden"; the founder's own still say "Kontrol edildi".
  The NACE editor offers the profile's activity area's codes ("Faaliyet alanınıza uygun"). Title and
  codes are proposed from the profile since 2026-11-26 (see "Proposed title and codes"); the mock
  still refuses a submit without a title ("Şirket unvanını yazınız.") or without a code.
- **D-1f** and **D-1e**: wording no longer speaks of reading or comparing the deck.

### The mock

`MockApi.uploadDeck` refuses like the API (both ticks, a profile, `validation_failed` with fields), keeps
the files' names and sizes, and counts the deck's pages when it can read them (uncompressed PDFs, like
the sample deck): outside 3–40 the evaluation ends `rejected`. Otherwise the demo panel's new
"Sunum değerlendirmesi nasıl bitsin?" decides (`done` by default; `questions`, `failed`, `rejected`). The
evaluation is a 6-second timer (`DURATION.evaluation`). Seeding `review` or later fills the title and
codes itself. Saved mock data from before is upgraded: an application at `scanning` goes back to
`verified` without its deck; `crossCheck`, `ai` / `check` marks and `deckName` are dropped.

### Wording to be confirmed by the owner

- The two consent labels (`shared/deck-consents.ts`): **placeholders**; the notice text does not exist
  and the evaluation service is not named.
- D-1a's lead and the three notices after `failed`, `rejected`, `cancelled`; D-1b's and D-1g's texts;
  D-1c's lead and the "Ön bilgilerinizden" hint.
- Terminal AI's answers on the deck step (mock only).

## Step 1 over HTTP (since 2026-11-25, piece 5)

**Connected:** `submitProfile`, `uploadDeck`, `updateReview`, `submitReview`,
`chooseTitle`, `reference`, `evaluationReference` (piece 9; `resolveCrossCheck` was removed with the
cross-check), and the background-work capability `work` (polling). Every write answers
with an empty body (204/202); `HttpApi` then reads the application again (`fresh()`: the status read,
then `GET /api/application`, mapped). Step 2 came in piece 6, step 3 with the second factor in
piece 7, and steps 4 and 5 in piece 8 (below).

### Requests of step 1

```
Profile (D-1e)    PUT  /api/application/profile {brand,sector,funding,nationality,phone,country}  204
Deck (D-1a)       POST /api/application/deck  multipart (see "The deck step: outside evaluation")     202
                  (FormData; the browser sets the multipart Content-Type; the ticks are sent as given)
Review edit       PATCH /api/application/review {fields:{<key>: value}}                              204
                  only the fields that differ from the last read review (toReviewFields); nothing
                  is sent when nothing differs (the API refuses an empty change)
Submit            POST /api/application/review/submit                                                202
New title (D-1d)  POST /api/application/title {title}  (without "A.Ş."; the server adds it)          202
Questions (D-1g)  GET  /api/application/evaluation/questions  {answerable, receivedAt, cards[]}       200 / 404 no_questions
Answers (D-1g)    POST /api/application/evaluation/answers {answers:[{targetFactId, optionId, explanation}]}  202 (then evaluating)
Reference         GET  /api/reference/wizard   once per session (cached in HttpApi, dropped on sign-out)
Polling           GET  /api/application/status  → {stage, changedAt}
```

### Stage table for step 1

| API stage | Portal stage | Screen | What ends it |
| --- | --- | --- | --- |
| `profile` | `profile` | D-1e `/details` | the founder saves the profile |
| `verified` | `verified` | D-1a `/deck` (D-1e still open) | the founder uploads the deck, the CV and the answers |
| `evaluating`, `evaluationQuestions`, `verified` + an ended evaluation | see "The deck step: outside evaluation" | | |
| `review` | `review` | D-1c `/deck/review` | the founder submits |
| `titleChecking` (`titleCheck.status: "checking"`) | `titleChecking` | D-1f `/deck/name-check` (new) | staff: `titleConflict`, or `eligibility` (foreign) / `declaration` (resident) (polled) |
| `titleConflict` (`titleCheck: {status:"conflict", candidate, reason}`) | `titleConflict` | D-1d `/deck/name-rejected`; D-1c also opens | the founder chooses a title (back to `titleChecking`) or submits the review again |

### How polling works

`Api.work` says how work that runs without the founder reaches the portal:

- **`simulated`** (MockApi): nothing runs anywhere. The store derives progress from the step's start
  time and calls `work.complete(stage)` when the simulated time is up. `completeScan`,
  `completeTitleCheck`, `completeScreening` and `completeSetup` are MockApi's own methods now, not part
  of `Api` (the API has no such routes); `completeIdentity` and `completeCall` stay on `Api` because
  the API has founder routes of those names (later pieces).
- **`server`** (HttpApi): `status()`, `application()` and `seen()`. While the stage is in
  `SERVER_WAITING_STAGES` (`evaluating`, `evaluationQuestions`, `titleChecking`; later pieces add more) and someone is signed in,
  the store runs a `StatusPoller`. Each tick reads `GET /api/application/status`; only when its `stage`
  or `changedAt` differs from `seen()` does it read `GET /api/application`.
  - **Why:** the full read decrypts the founder's data and writes `audit.data_access` rows on every
    call; the status read decrypts nothing and writes nothing (API step 14). Polling the full read
    would fill the founder's access log with reads that say nothing.
  - **`seen()`** is the status read made *just before* the last full read (every `fresh()` reads the
    status first). So the remembered status is never newer than the application the portal shows;
    anything that changes in between appears as a different `changedAt` at the next poll.
  - **Pacing** (`pollDelay`): every 2 s for the first 30 s, every 5 s until 5 minutes, then every
    15 s. No timers while the tab is hidden; a tick at once when it becomes visible. One tick at a
    time. The pace starts over each time a waiting stage begins.
  - **Stops** when the stage is no longer a waiting one, on sign-out, and on a 401 (which signs out
    through `sessionLost`). Other errors are logged (code only) and the next tick tries again.
  - A poll answer that started before one of the founder's own writes is dropped (the write wins).
- **The evaluation** (D-1b): a status page with no progress at all; only the server's next stage ends
  it. `completeEvaluation` is the mock's own (HttpApi does not have it).
- **409 `wrong_stage`** from any write: the store reads the application again, so the screen moves to
  where the application really is; the refusal's sentence stays on screen.

### Each screen action and what it does in HTTP mode

| Screen | Action | HTTP mode | Why |
| --- | --- | --- | --- |
| D-1e | Save | connected | |
| D-1e | Sector and funding choices | from `Api.reference()` | exactly what the API accepts |
| D-1e | "Demo: örnek bilgileri doldur" | still shown (fills the form only) | not gated before; left as it was |
| D-1a | Upload (deck, CV, answers) | connected (piece 9; walked against the API's stand-in evaluator) | |
| D-1a | "Ön bilgileri düzenle" | shown at `verified` (both modes), also after an ended evaluation (API step 21) | the API refuses a profile while an evaluation runs or waits on questions, and after a done one (409 `wrong_stage`) |
| D-1a | notice after an ended evaluation | shown when `evaluation.status` is `failed`, `rejected` or `cancelled` at `verified`; `rejected` + `reason: formDeckConflict` has its own text (API step 21) | not walked against the API: unit tests only (`d1a.spec.ts`, `api-mapper.spec.ts`) |
| D-1c | Title, NACE, founder, contact, funding editors | connected; only changed fields sent | API refuses empty changes and empty values |
| D-1c | NACE search and suggestions | only codes from `Api.reference()` (10 today) | |
| D-1c | Logo replacement | offered only when a logo exists (the mock's); hidden in HTTP mode | the API keeps no logo |
| D-1c | "Başka unvan seç" | shown only after a refused title; back to D-1d | |
| D-1c | Submit | connected | |
| D-1d | Suggestions and own title | connected (`chooseTitle`) | suggestions are the portal's own (`titleAlternatives`), not the API's |
| D-1d | "Diğer bilgilere dön" | **navigates to D-1c** (both modes), no API call | the API takes review edits and a new submit after a refusal, but has no call that changes the stage; D-1c accepts `titleConflict` |
| D-1f | (nothing to do) | polled | |

`Api.backToReview` stays `not_connected` in HTTP mode, and its only entry point (D-2c) is hidden there (piece 6).

### Errors at fields

A refusal with `errors` sets `ApplicationStore.fieldErrors` (API field names). D-1e shows each message
under its field (`brand`, `sector`, `funding`, `nationality`, `country`, `phone`); D-1a under its fields
(`deck`, `cv`, `summary`, `activityGroupId`, `activityId`, `businessModelIds`, `revenueModelIds`,
`productTypeIds`); D-1c shows them
under the review row (`REVIEW_ROWS`: e.g. "Ad eksik. Soyad eksik." under Kurucu after a submit) and
under the inputs of the open editor (`REVIEW_INPUTS`); D-1d under the own-title field (`title`). The
banner shows the field's sentence when there is exactly one, the problem's title otherwise ("Eksik
bilgileri tamamlayınız."). The mock names fields only for the deck upload; elsewhere mock mode shows only the banner.

## What HttpApi did first (since 2026-11-25, piece 3)

**Connected: sign-in.** `register`, `resendEmailCode`, `verifyEmail`, `login`, `logout`,
`requestPasswordReset`, `confirmPasswordReset`, `edevlet`, `restore`. Everything else still rejects
with `ApiError('Bu işlem henüz sunucuya bağlanmadı.')`, code `not_connected`. After this piece a
founder can register, confirm the code, sign out and in, reset the password, use the e-Devlet
dialog, reload and stay signed in, and lands on the profile form (D-1e, stage `profile`). Saving the
profile is the next piece.

### Who is signed in

`Api` takes no e-mail as identity any more. The session is the server's `HttpOnly` cookie
(`dsp_session` in development); the portal never sees it and keeps nothing about the founder in
`localStorage` or `sessionStorage` (checked in the browser: only `dsp.prefs.v1`, theme and
language). The e-mail arguments that remain (`register`, `login`, `resendEmailCode`, `verifyEmail`,
`requestPasswordReset`) are what the founder typed.

The mock plays the same part with `MockApi.current` (the signed-in e-mail), set by `verifyEmail`,
`login`, `edevlet`, `seed` and `restore`, cleared by `logout`, `reset` and a password change. It
writes that e-mail to `dsp.session.v1` so a reload or another tab finds it; that key and
`dsp.lastEmail` exist only in mock mode. Every wizard call without a session rejects with code
`unauthenticated`, status 401, like the API.

### Requests at sign-in and at page load

```
Register        POST /api/auth/register {firstName,lastName,email,password}   202
                → D-0c; the address is kept in memory only (ApplicationStore.pendingEmail)
Code            POST /api/auth/verify-email {email,code}                       204 + cookie
                → session (below)
Login           POST /api/auth/login {email,password}                          204 + cookie
                → session (below)
                403 email_not_verified → D-0c with the server's sentence ("…Size yeni bir kod gönderdik.")
e-Devlet        GET  /api/auth/edevlet/start → {redirectUrl:"/edevlet-test?state=…"} + state cookie
                POST /api/auth/edevlet {code:<T.C. kimlik no>, state}           204 + cookie
                → session (below)
Session         GET  /api/me                          → Account (toAccount)
                GET  /api/application                 → Application (toApplication)
                  404 no_application → POST /api/application (204, idempotent), GET again
Page load       ApplicationStore.restore() → Api.restore() = the same "Session" reads;
                401 on /api/me → signed out (null). The flow guard waits for it (store.restored).
Sign-out        POST /api/auth/logout                                           204
Reset           POST /api/auth/password-reset {email}                           202 always
                (e-mail link) /sifre-sifirla?token=<id>.<token> → D-0e
                POST /api/auth/password-reset/confirm {token,password}          204, no sign-in
                → /login with "Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz."
```

The e-Devlet dialog is a development stand-in for the real redirect: the real flow sends the
browser to `redirectUrl` and e-Devlet comes back with `code` and `state`. `HttpApi.edevlet(tckn)`
plays that return trip; it goes when the real integration exists.

### Where each behaviour lives

| Behaviour | Where | Why there |
| --- | --- | --- |
| 404 `no_application` → create, read again | `HttpApi.session()` | A wire detail; the mock creates the application at verification. |
| 401 on restore → "nobody signed in" | `HttpApi.restore()` | Only the HTTP client knows a 401 means "no cookie". |
| 429 → "Çok fazla deneme yapıldı. Lütfen bir dakika sonra yeniden deneyiniz." | `toApiError()` | The API's 429 title ("İstek karşılanamadı.") says nothing useful; code stays `http_429`. |
| 401 `unauthenticated` from any later call → forget the founder, go to `/login` | `ApplicationStore.sessionLost()` (from `run()` and the time-based completions) | The store holds the session state and the router; both implementations answer `unauthenticated` the same way, so there is no mode branch. |
| `email_not_verified` → D-0c with the server's sentence | `ApplicationStore.login()` sets `pendingEmail` and a one-time notice; `GirisData.login()` navigates | The notice survives the screen change (`takeNotice()`), the error banner would not. |
| A `validation_failed` refusal shows its field's sentence (a wrong code: "Kod hatalı veya süresi dolmuş. Yeni kod isteyiniz.") | `shownMessage()` in the store | The API's title for it is general ("Gönderdiğiniz bilgiler eksik veya hatalıdır."). |
| Remembering the last typed e-mail | `DemoTools.rememberEmail` (mock only) | HTTP mode keeps no e-mail in the browser. |
| One code check at a time | `GirisData.verify()` returns while the store is busy | Found in the E2E walk: the code boxes can report "complete" again while a check runs, and parallel checks of one code got 409 from the API. |

### The set-new-password screen (D-0e, `/sifre-sifirla`)

`src/app/screens/giris/d0e.ts`. Reads `token` from the query string once, then replaces the
history entry with `/sifre-sifirla` (`Location.replaceState`), so the token stays neither in the
address bar nor in history. Asks for the password twice (same strength rule as registration),
calls `confirmPasswordReset`, and on success goes to `/login` with a short confirmation. Refusals
are shown as the server words them (422 `link_invalid`: "Bağlantı geçersiz veya süresi dolmuş.
Yeniden şifre sıfırlama isteyiniz."). Without a token it says the link is invalid and offers a new
one. In the mock, `requestPasswordReset` puts a working link in the Inbox e-mail (30 minutes,
single use, kept in `dsp.db.v1` under `resets`), and `confirmPasswordReset` changes the mock
password and signs that founder out.

### What the mapper cannot fill yet

`toApplication` maps what maps cleanly: reference number (as `id`), stage, founder type, dates,
profile, cross-check, deck, the review values into `company` / `founder` / `contact` / `funding` /
`marks`, title check, payment fees (new optional `Application.fees`, in TL), payment, signature,
call consent and logs. `toReviewFields` maps the other way (D-1c's changes → the API's keys). Checked
against JSON captured from the running API on 2026-11-25 (`api-mapper.spec.ts`, "captured API
answers"). What the captured JSON corrected in the first mapper:

- `titleChecking` is its own stage (was shown as `review`); the title check's `checking` is kept
  (was dropped), and the candidate loses its " A.Ş." (the screens add "Anonim Şirketi" themselves;
  D-1d showed "… A.Ş. Anonim Şirketi").
- After a new title on D-1d the API keeps the review's `trade_name` as it was; the title being
  checked or reserved is the reservation's `candidate`. The company title now follows the candidate
  while it is `checking` or `ok`, the review's trade name otherwise.
- Deck fields come under the portal's keys (`trade_name` → `title`, `nace_codes` → `nace`, …) so D-1b
  and D-1c find them; `deck.status` is carried (`reading` / `read` / `failed`); `pages` is null until
  read (and stays null with the development reader).
- The funding is stated as a label but read as a key ("own-abroad"): the read side, in the deck field
  and in the cross-check, is shown as its label too.
- The country is compared with the deck's whole address line (an API rule): a deck address that
  names a city but not the country is a difference.
- A title conflict has `reason` (the staff member's text), shown on D-1d instead of a registered
  title; suggestions come from `titleAlternatives` (rules.ts, moved from mock-api.ts).
- Choosing "read" for a difference writes no claim: the review's mark stays `ai`.

Left neutral, not invented:

| Portal field | Value | Why |
| --- | --- | --- |
| `titleCheck.requestedAt` | absent | The API does not send when the title was asked; D-1f shows the time only in the mock. |
| `founder.passportNo`, `founder.tckn` | `''` / absent | The API does not send them. |
| `company.logo`, `company.suggestedNace` | absent / `[]` | Not in the view. |
| `company.capital` | `CAPITAL` (250 000) | The legal minimum the mock also uses; the API sends no capital. |
| `funding` with no review value | profile's, else `'own-abroad'` | `Application.funding` is required. |
| `marks` | `ai` / `edited` (`entered` counts as edited) / `check` when the deck field's confidence is not `high` | The portal has no "entered" badge. |
| `deck.noticeAt`, `deck.aiConsentAt` | absent | Consent rows are not in the view. |
| `deck.fields[].key` | the portal's keys; `given_name` and `family_name` are both `name` | The mock reads one "Ad / Soyad" field. |
| `titleCheck.conflictWith` | absent | The API sends a `reason`, not the clashing title. |
| `company.root` / `activity` | first word / the rest of the title | The API keeps one string; joined again nothing is lost. |
| `eligibility` | mapped since piece 6 (see "Step 2 over HTTP") | no score; times from the timeline |
| `payment.holder`, `payment.last4` | what this page typed for this application (`HttpApi` memory), else `''` | Not in the view (`last4` is always null); see "Step 3 over HTTP" |
| `signature.method` | `nes_daily` → `eshs`, `nes_existing` → `existing`, `nes_standard` → `edevlet` (piece 8) | the kinds the development provider issues |
| `signature.holder` | the account's first and last name | the API sends no holder |
| `setup`, `results`, `call` | mapped since piece 8 (see "Steps 4 and 5 over HTTP") | |
| `phoneLink` | only in `HttpApi`'s memory while the QR code is shown | the API gives the token once, in the answer to `POST /phone-link` |
| `docs[].group`, `docs[].name` | `deck` → "Sunum", `address_proof` → "Adres belgesi" (both "1 · Başvuru & Uygunluk"), and Turkish names for the other types the schema names (`DOC_NAMES`); any other type: "Diğer belgeler" and the type | The view gives a type code, not a group and title. |

To refresh the captured JSON: run the stack, then `tools/api-capture/capture.sh` (it registers a new
made-up founder each time and uses `dev/staff.sh -a <reference> title reject|reserve`).

## Step 2 over HTTP (since 2026-11-25, piece 6)

**Connected:** `startEligibility`, `completeIdentity`, `createPhoneLink`, `submitDeclaration`,
`phoneLinkStatus`, `startEligibilityByPhone`, `completeIdentityByPhone`, and polling of step 2's
waiting points. `proceedToPayment` is client-side only; `backToReview` stays `not_connected`.

### Requests of step 2

```
Start (D-2a)       POST /api/application/identity/start {consent}       204, then fresh()
                   consent exactly as ticked; idempotent while a check is open; revokes an unused phone link
                   409 already_verified, 409 identity_review (after too many failures)
Camera ended       POST /api/application/identity/complete               202, then fresh()   (computer)
QR code            POST /api/application/phone-link                      200 {token, expiresInSeconds:600}
                   409 identity_started while a check is open
Declaration (D-2d) POST /api/application/declaration  multipart: file, declared        202, then fresh()
                   the File itself; PDF, JPG or PNG, 10 MB (the API checks the bytes)
Phone page         GET  /api/phone/status          header X-DSP-Phone-Token   {state, expiresAt, startedAt}
                   POST /api/phone/start {consent} same header (+ X-DSP-Request)  204, then the status
                   POST /api/phone/complete        same header (+ X-DSP-Request)  202, then the status
```

`markApiWrites` adds `X-DSP-Request: 1` to the phone writes as to every `/api/` write (tested).
The phone routes have no session; the token is sent in the header only.

### The phone handoff

```
computer (signed in)                         phone (no session)                       API / Worker
D-2a "Telefonla devam et"
  POST /phone-link ─────────────────────────────────────────────────────────────────► token (once)
  token kept in HttpApi memory, QR code shows
  <origin>/eligibility/phone#<token>
  polls /application/status (QR shown)
                                             opens the link; d2m reads the fragment once,
                                             replaces the URL with /eligibility/phone
                                             GET /phone/status (header) ──────────────► ready
                                             consent tick, "Doğrulamayı başlat"
                                             POST /phone/start {consent} ─────────────► check waiting,
                                                                                         timeline "…telefondan başlatıldı"
  changedAt moved → full read: running, via phone
  token dropped; "Doğrulama telefonunuzda sürüyor"
                                             camera animation (the portal's own)
                                             POST /phone/complete ────────────────────► Worker decides
                                             GET /phone/status every 6 s until done
  stage declaration → D-2d                   "Doğrulama tamamlandı" (polling stops)
```

- **Token in the fragment.** `/eligibility/phone#<token>` in both modes (the route has no token
  parameter any more; the old `/eligibility/phone/<token>` no longer exists). Browsers do not send the
  fragment, so the token is in no request line and no server log (checked: none of the API logs
  contained it; no request URL of the walk contained it). d2m reads it once from
  `ActivatedRoute.snapshot.fragment`, then `Location.replaceState('/eligibility/phone')`, so it leaves
  the address bar and the history entry. It lives in `ApplicationStore.phoneToken` (memory) only.
- **On the computer** the token is kept in `HttpApi.phoneLink` (memory) and put on the mapped
  application as `phoneLink` while the QR code is shown. It is dropped when the founder presses
  "Bu bilgisayarla devam et" (`Api.forgetPhoneLink`, new; the mock's is a no-op because its link lives
  in its data), when the check starts on either device, when the stage moves on, and on sign-out.
  The "Demo: telefon sayfasını aç" link is shown in mock mode only.
- **Rate limit.** The phone routes share the API's sign-in limit (20 requests a minute per address).
  The phone page polls `phone/status` every 6 s (`PHONE_POLL_MS`) while the state can still change
  (looking up, `ready`, `running`), not while the tab is hidden, and stops at `invalid`, `expired` and
  `done`. Walked: 8 phone requests in 18 s for a whole check (status, start, status, complete,
  status and polls), none after `done`.
- **The camera is still simulated** in both modes: there is no identity vendor yet. When the portal's
  animation ends, HTTP mode reports it (`identity/complete` on the computer, once per check, keyed by
  its start time; `phone/complete` on the phone, once per token) and shows "Doğrulama sonucu
  bekleniyor" until the Worker decides (the mock still says "Kimliğiniz doğrulandı", as before). The
  development identity provider always passes.
- `phone/status` answers `done` also after a failed check (the API does not tell the phone the
  result); the phone page therefore says "sonuç … bilgisayarınızdaki sayfada gösterilir".

### Stage table for step 2

| API stage (+ view) | Portal stage | Screen | Polled? | What ends it |
| --- | --- | --- | --- | --- |
| `eligibility`, nothing running | `eligibility` | D-2a pre-information | no | the founder starts (computer or phone) |
| `eligibility`, QR code shown on this computer | `eligibility` | D-2a QR view | **yes** | the phone starts the check (computer sees `running`, via phone) |
| `eligibility`, `running` | `eligibility` | D-2a camera (or "telefonunuzda sürüyor") | **yes** | the Worker: `declaration`, or `eligibility` + `identityError`, or `manual` (second failure) |
| `eligibility`, `identityError: "identity_failed"` | `eligibility` | D-2a pre-information with "Kimliğiniz doğrulanamadı." | no | the founder starts again (`identity/start`) |
| `declaration` | `declaration` | D-2d | no | the founder uploads the document and declares |
| `screening` | `screening` | D-2e (every list "Taranıyor…", bar never reaches the end by itself) | **yes** | the Worker: `payment` (result `eligible`) or `manual` |
| `payment`, result `eligible`, no payment, not seen, not after a review | **`eligible`** | D-2b (one-time) | no | "Ödemeye geç" (client-side) |
| `manual` | `manual` | D-2c status page | **yes**, settles at every 15 s | staff: approve → `payment` (straight to D-3a); reject → 404 → `closed` |
| (404 `no_application` while holding an application) | **`closed`** (new, HTTP only) | `/application-closed` | no | sign-out |

`SERVER_WAITING_STAGES` is now `scanning`, `titleChecking`, `screening`, `manual`; `waitsForServer(app)`
adds the identity step while a check is open or the QR code is shown. Pacing is unchanged
(`pollDelay`: 2 s, then 5 s, then 15 s after 5 minutes), so manual review, which can take days, settles
at one status read every 15 s, and none while the tab is hidden.

### What the mapper does with `eligibility` (toEligibility)

| Portal | From | Note |
| --- | --- | --- |
| `running`, `consentAt`, `declaredAt`, `result` | the view's fields | `result` stays empty until the list search ends |
| `identityError` | `identityError === "identity_failed"` | other codes are ignored |
| `startedAt`, `via: 'phone'` | the newest timeline line "Kimlik doğrulama başlatıldı" / "Kimlik doğrulama telefondan başlatıldı", only while `running` | the camera animation runs from it; `via` makes the computer follow instead of finishing |
| `screeningStartedAt` | `declaredAt` | the API queues the list search in the same request |
| `finishedAt` | the timeline line "Yaptırım ve PEP taraması tamamlandı" | D-2b's "Kontroller … itibarıyla tamamlandı" |
| `score` | **left out** | the API has none; D-2b says "Kimliğiniz doğrulandı" instead of the mock's score and MRZ line |
| `address` (file name) | left out | not in the view; D-2b says "Adres belgesi alındı" |

The timeline texts are matched literally (`LOG_TEXTS` in api-mapper.ts); the captured fixtures check
them, so a changed wording on the API fails `api-mapper.spec.ts`. A code in the view would be better
(API gap below).

What the screens leave out in HTTP mode (`ApplicationStore.serverDecides`): the mock's live log lines
and documents (`liveEvents`), per-list results and times on D-2e and D-2b, the score and passport line,
D-2c's review reasons (the API never tells the founder why: no tipping-off), and the demo address
document.

### The result screen (D-2b) as a one-time acknowledgement

The API has no `eligible` stage. `toApplication` shows `eligible` while the API is at `payment`, the
result is `eligible`, `payment.status` is null, the founder has not pressed "Ödemeye geç" yet, and the
timeline has no "Başvurunuz incelendi; ödeme adımına geçebilirsiniz" (after staff approve, the portal
goes straight to the payment). "Ödemeye geç" (`proceedToPayment`) sends nothing: `HttpApi` marks the
application's id as seen and maps the last view again.

**Where "seen" lives:** in `HttpApi`'s memory (a `Set` of application ids), cleared on sign-out. Not in
`sessionStorage`, so HTTP mode still writes nothing about the founder to the browser's storage.
**On reload** (or a new sign-in) the result screen shows once more; pressing "Ödemeye geç" again costs
nothing and changes nothing on the server.

### Manual review and the closed state

- D-2c in HTTP mode is a status page (like D-1f): no reasons, no "İnceleme kaydıyla devam et" (the API
  refuses payment under review), no "Sunum bilgilerini düzelt" (no route back; open decision 12). It
  says people decide, it may take a few working days, and the founder may close the page.
- Approve: the poll sees `payment` and the portal goes to D-3a by itself.
- Reject: the API closes the application and every read answers 404 `no_application`. The store
  (`applicationClosed`) then forgets the application and sets `closed`; the stage becomes `closed` and
  `/application-closed` says "Başvurunuz kapatıldı" with only "Çıkış yap". Polling stops.
- **No new application is created in that session:** `HttpApi` creates an application only right
  after an explicit sign-in (login, code, e-Devlet). A reload (`restore`) that finds none answers
  `{ account, app: null, closed: true }` and the closed screen opens again (walked: after a reload
  only `/api/me` and `/api/application/status` were called; the database shows the founder with the
  one closed application). Never while the store holds an application (polls and writes do not create).
- **API gap (for the owner):** the API cannot tell "never had an application" from "closed", so the
  next sign-in of a rejected founder creates a new application. If restore finds none for another
  reason (the creation at sign-in failed), the closed screen is shown wrongly; signing in again fixes it.

### Each screen action in HTTP mode (step 2)

| Screen | Action | HTTP mode | Why |
| --- | --- | --- | --- |
| D-2a | Consent tick + "Doğrulamayı başlat" | connected (`identity/start`) | |
| D-2a | Camera animation end | `identity/complete`, then waits | no vendor yet |
| D-2a | "Kimliğiniz doğrulandı" at the end of the camera | changed to "Doğrulama sonucu bekleniyor" | the Worker decides after |
| D-2a | "Telefonla devam et" / "Yeni kod oluştur" | connected (`phone-link`) | |
| D-2a | "Bu bilgisayarla devam et" | forgets the token (no call) | |
| D-2a | "Demo: telefon sayfasını aç" | hidden (mock only) | demo tool |
| D-2a | Failure notice | new, from `identityError` | |
| D-2a-m | start / end / states | connected (phone routes) | |
| D-2d | Upload + "Beyanı onayla" | connected, the real file | |
| D-2d | "Demo: örnek belge kullan" | hidden (mock only); in the mock it now makes a real one-page PDF | would upload a placeholder to the real API |
| D-2e | (nothing to do) | polled; no per-list results | the API reports none |
| D-2b | "Ödemeye geç" | client-side only | no API route |
| D-2b | "Listeleri göster" | hidden | no per-list data |
| D-2c | "İnceleme kaydıyla devam et", "Sunum bilgilerini düzelt" | hidden | API refuses both; open decision 12 |
| closed | "Çıkış yap" | sign-out | |

## The second factor ("step-up") (since 2026-11-25, piece 7)

**What triggers it.** The API refuses four actions with **403 `step_up_required`** ("Bu işlem için
e-posta adresinize gönderilen kodu girmeniz gerekir.") unless this session passed an e-mailed code in
the last 15 minutes: `POST /api/application/payment`, `POST /api/application/esign/call/start`,
`POST /api/application/esign/resident` and `POST /api/application/setup`. All four are connected (the
last three in piece 8) and go through the same mechanism.

```
Send code    POST /api/auth/step-up                   202 (no body); nothing is sent within 60 s of the last code
                                                       409 no_email (account without an e-mail address)
Check code   POST /api/auth/step-up/verify {code}      204; wrong: 400 validation_failed, errors.code
                                                       "Kod hatalı veya süresi dolmuş."
Both are rate limited with sign-in (20 a minute per address → 429, shown as toApiError words it).
```

**One mechanism, in the store.** `ApplicationStore.run()` (which every action goes through) calls
`withSecondFactor(fn)`:

1. run `fn`; if it is refused with `step_up_required`:
2. open the dialog (`stepUp` signal; `StepUpDialog` in the app shell shows it) and send one code
   (`sendStepUpCode`);
3. the founder types six digits → `verifyStepUpCode(code)`. A wrong code shows the server's sentence in
   the dialog and empties the boxes; the dialog stays open;
4. on 204 the dialog closes and **`fn` runs once more, by itself**;
5. a second refusal of any kind (`step_up_required` included) is shown like any refusal: **never a loop**;
6. "Vazgeç", Esc, a click outside or a page change close the dialog: the action ends with
   "İşlem yapılmadı. Devam etmek için e-posta adresinize gönderilen kodu girmeniz gerekir." and nothing
   else is sent.

- "Kodu yeniden gönder" is offered only 60 s after the last code (the dialog counts down), because the
  server silently ignores an earlier one. `no_email` and 429 are shown as worded.
- Two actions refused at once share one dialog and one code. A 401 at any point signs out and closes it.
- While the dialog is open the store is `busy` (the page's button keeps its spinner).
- No code is ever shown, prefilled or hinted in HTTP mode, except in the `http-demo` build against a
  demo API ("Demo mode against the API").
- **The mock does not demand a second factor** (which actions need one is still the owner's decision,
  and the mock is what the product is presented with). `MockApi.sendStepUpCode` / `verifyStepUpCode`
  exist only so the dialog can be shown from `/screens` ("Pencereler" → "İkinci doğrulama",
  `ApplicationStore.previewStepUp`); its code arrives as an Inbox e-mail like the mock's other codes.
- The dialog is a fixed overlay (like `EdevletDialog`, z-index 900), not a modal `<dialog>`: the top
  layer would cover the mock's Inbox toasts (z-index 950), where the demo code appears.
- Tested in `application.store.spec.ts` with fake timers: refused → dialog → verified → retried exactly
  once; cancel; wrong code; a second refusal after the retry; the 60 s resend; `no_email` and 429; two
  actions at once; a 401.

## Step 3 over HTTP (since 2026-11-25, piece 7)

**Connected:** `pay`, `confirm3ds`, `resendOtp`, `cancel3ds`, each followed by a fresh read.

```
Pay (D-3a)        POST /api/application/payment {holder, cardToken}     204, stage threeDs (payment.status "3ds_pending")
                  403 step_up_required (→ the dialog above, then repeated); 400 holder / cardToken;
                  409 payment_open, wrong_stage (both re-read the application); 422 card_declined
                  "Kartınızdan ödeme alınamadı. Lütfen başka bir kart deneyiniz."
3-D Secure (D-3b) POST /api/application/payment/3ds {code}               204, stage signing (payment.status "captured")
                  wrong code: 422 with the provider's code (development: 3ds_failed, "Doğrulama kodu hatalı.");
                  the payment stays open
Resend            POST /api/application/payment/3ds/resend               204
Cancel            POST /api/application/payment/3ds/cancel               204, back to payment (payment.status "failed")
                  409 no_open_payment for the three above (re-reads the application)
```

### Card data never leaves the browser

- The portal's card form and its checks (Luhn, expiry, CVV: `validateCard` in rules.ts) stay as they were.
- `HttpApi.pay` sends **exactly `{ holder, cardToken }`**. The token is a **development stand-in**:
  `tok_test_` + the last four digits typed, which is what the API's development payment provider
  (`FakePaymentProvider`) accepts (`tok_test_0002` is declined; the 3-D Secure code is always `123456`).
  **With a real payment provider the card fields must be the provider's own hosted fields** (its iframe
  or page), the card goes from the browser to the provider, and the provider hands the portal the
  token. The portal's own card form must not be used with a real provider (comment at that line in
  `http-api.ts`). This keeps the platform out of PCI DSS card-data scope (API step 06).
- The number, expiry and CVV appear in no request, not in `Application`, in no store signal, not in
  storage and not in logs. The card object lives only in the call to `store.pay` (and in its one
  repeat after the second-factor dialog) and in D-3a's own form while that screen is open.
  `http-api.spec.ts` asserts the body is exactly `{ holder, cardToken }` and that neither the request
  nor the mapped application nor `HttpApi`'s memory contains the number, expiry or CVV; nothing is
  written to storage. Checked in the browser too (below).
- The API returns no last four digits (`payment.last4` is always null). `HttpApi` keeps the holder and
  the last four digits (only) in memory for the application they were typed for, so D-3b shows
  "**** **** **** 4242"; after a reload, or a new sign-in, D-3b shows no card row.

### Mapper (`toPayment`)

| API `payment.status` | API stage | Portal `payment` | Screen |
| --- | --- | --- | --- |
| null | `payment` | absent | D-2b once (result screen), then D-3a |
| `3ds_pending` | `threeDs` | `{holder, last4, amount}` (holder/last4 from memory or `''`) | D-3b |
| `failed` (3-D Secure cancelled) | `payment` | absent | D-3a (the result screen does not come back) |
| `captured` | `signing` | `{…, paidAt}` | e-signature |

Amounts are kuruş on the wire, TL in the portal (`amountMinor / 100`). `Application.fees` is the API's
`payment.fees`. The result screen (D-2b) shows only while `payment.status` is null, so once a payment
was started, even a cancelled one, a reload goes to D-3a. Checked against `payment-*.json` captured on
2026-11-25 (`api-mapper.spec.ts`, "step 3").

### What the payment screens show in each mode

| Screen | Element | Mock | HTTP | Why |
| --- | --- | --- | --- | --- |
| D-3a | Fee lines and total, the pay button's amount | `FEES` | the API's `payment.fees` (the payment's own amount once started) | the API charges its own fee schedule |
| D-3a | "Test kartını doldur" | as before | "Test kartını doldur (yalnızca formu doldurur)" | it only fills the form; the development provider then gets `tok_test_4242` |
| D-3b | Amount | the payment's | the payment's (from the API) | |
| D-3b | "Kart **** 4242" | always | only while this page remembers the last digits | the API never returns them |
| D-3b | "Tarih" | the mock's code time | hidden | the API gives no time for the 3-D Secure step |
| D-3b | "+44 ••• ••• 0123 numarasına gönderilen…" | as before | "Bankanızın gönderdiği 6 haneli doğrulama kodunu giriniz" | the bank sends the code; the portal does not know where |
| D-3b | "Kalan süre 02:58" countdown | as before | hidden | the API gives no expiry |
| D-3b | SMS mirror (KARTBANK) | as before | hidden | there is no code to show; it comes from the bank |
| D-3b | "Kodu tekrar gönder" | as before | connected; "Yeni kod istendi." after it | otherwise nothing on screen changes |
| D-3b | Onayla / İptal | as before | connected; the provider's refusal shown as worded | |

The 3-D Secure panel itself ("KART BANKANIZ") is still the portal's own lookalike in both modes. With a
real provider the 3-D Secure step is the provider's (or the bank's) own page or frame.

## Steps 4 and 5 over HTTP (since 2026-11-25, piece 8)

**Connected:** `acceptCallTerms`, `startCall`, `endCall`, `completeCall`, `signResident`, `startSetup`,
each followed by a fresh read, and polling of the e-signature and set-up waiting points. After this piece
a founder goes from registration to "Şirketiniz kuruldu" in HTTP mode. What still answers
`not_connected`: `backToReview` (no route; open decision 12) and Terminal AI's `ask`.

### Requests of steps 4 and 5

```
Consent (D-4a)     POST /api/application/esign/consent {consent}          204, idempotent; view: callConsentAt
Call (D-4a)        POST /api/application/esign/call/start                 204, stage calling        step-up
                   409 consent_missing, 409 wrong_flow (residents)
Hang up (D-4b)     POST /api/application/esign/call/end                   204, stage signing again
                   409 no_open_call (re-reads the application)
Script ended       POST /api/application/esign/call/complete              202; the Worker issues → signed
                   409 no_open_call: completed before (a reload) or ended elsewhere; read again
Resident (D-4d)    POST /api/application/esign/resident {method}          202, stage calling while issuing   step-up
                   method "existing" | "edevlet"; 409 wrong_flow (foreign founders)
Set-up (D-4c)      POST /api/application/setup {confirmed}                202, stage setup          step-up
                   400 errors.confirmed; 409 no_valid_signature (expired; re-reads → signing)
Polling            GET  /api/application/status (then GET /api/application only when it changed)
```

The three marked "step-up" open the second-factor dialog when this session has no code from the last 15
minutes, and are repeated once after it (walked for the call start and for the resident's signing, below).

### Full stage table, sign-in to done

| API stage (+ view) | Portal stage | Screen | Polled? | What ends it |
| --- | --- | --- | --- | --- |
| (no session) | `null` | D-0a `/login`, D-0b `/register` | no | sign-in, registration |
| (registered, code not confirmed) | `registered` | D-0c `/verify-email` | no | the code |
| `profile` | `profile` | D-1e `/details` | no | the founder saves the profile |
| `verified` | `verified` | D-1a `/deck` | no | deck, CV and answers upload |
| `evaluating` | `evaluating` | D-1b `/deck/evaluating` | yes | the outside evaluation (minutes) |
| `evaluationQuestions` | `evaluationQuestions` | D-1g `/deck/more-information` | yes (slow) | the founder (D-1g form, API step 22) |
| `review` | `review` | D-1c `/deck/review` | no | submit |
| `titleChecking` | `titleChecking` | D-1f `/deck/name-check` | yes | staff |
| `titleConflict` | `titleConflict` | D-1d `/deck/name-rejected` | no | a new title |
| `eligibility` | `eligibility` | D-2a `/eligibility` | while a check is open or the QR code shown | the Worker / the phone |
| `declaration` | `declaration` | D-2d `/eligibility/declaration` | no | upload and declaration |
| `screening` | `screening` | D-2e `/eligibility/screening` | yes | the Worker |
| `payment` (result eligible, not yet seen) | `eligible` | D-2b `/eligibility/result` | no | "Ödemeye geç" (client-side) |
| `manual` | `manual` | D-2c `/eligibility/manual-review` | yes (slow) | staff |
| (404 while holding an application) | `closed` | `/application-closed` | no | sign-out |
| `payment` | `payment` | D-3a `/payment` | no | card + step-up |
| `threeDs` | `threeDs` | D-3b `/payment/3d-secure` | no | 3-D Secure code |
| `signing` (foreign) | `signing` | D-4a `/e-signature` (pre-information until `callConsentAt`, then the camera lobby) | no | "Operatörü ara" (step-up) |
| `signing` (resident) | `signing` | D-4d `/e-signature/turkish-citizen` | no | method + "Devam et" (step-up) |
| `signing` + an expired `signature` | `signing` | D-4a / D-4d with "E-imzanızın süresi doldu…" | no | sign again |
| `calling` (foreign, call open) | `calling` | D-4b `/e-signature/call`, the scripted call | **no** (the founder's own script runs) | the script ends → `call/complete`; or "Görüşmeyi bitir" → `call/end` |
| `calling` (foreign, reported ended) | `calling` (`call.completed`) | D-4b "E-imzanız düzenleniyor" | yes | the Worker: `signed` |
| `calling` (resident) | `calling` | D-4d "E-imzanız doğrulanıyor" | yes | the Worker: `signed` |
| `signed` | `signed` | D-4c `/e-signature/ready` | no (one read when the certificate runs out) | "Kuruluşu başlat" (step-up) |
| `setup`, `setup: null` | `setup` | D-5a `/setup`, "Kuruluş adımlarınız hazırlanıyor" | yes | the Worker creates the steps |
| `setup` with steps | `setup` | D-5a, the server's steps, tasks and results | yes (settles at 15 s) | staff complete the institution tasks |
| `done` | `done` | D-5a's finishing moment, then D-5b `/setup/complete` | **no** | — |

`SERVER_WAITING_STAGES` is now `evaluating`, `evaluationQuestions`, `titleChecking`, `screening`, `manual`, `setup`;
`waitsForServer(app)` adds the identity step (as before) and `calling` for a resident, after the call was
reported ended, or when the portal cannot tell (no call start in the timeline). `done` is never polled.

### The video call (D-4a, D-4b)

- **The call is still simulated in both modes**: there is no video or e-signature vendor yet. D-4b is the
  portal's 20-second scripted call. Its start is the newest "ESHS görüntülü görüşmesi başladı" line of the
  timeline (the view has no field), so a reload continues where the script was.
- In HTTP mode, when the script ends the store calls `call/complete` once per call (keyed by its start),
  and D-4b says "Görüşme tamamlandı · E-imzanız düzenleniyor" with no end button until the poll sees
  `signed`. The mock still moves on at once.
- **API gap:** the API reports `calling` both while the call is open and while the certificate is being
  issued (both are an open `esign_issue` work item; `call/complete` writes no timeline line). `HttpApi`
  remembers in memory which call it reported ended (`callCompleted`, by application and call start). After a
  reload the script runs to its end again, `call/complete` answers 409 `no_open_call`, and `HttpApi` then
  treats the call as completed. A field such as `call: {status}` in the view would remove the guess.
- "Görüşmeyi bitir" → `call/end` → `signing` → D-4a lobby (the consent is kept). 409 `no_open_call` re-reads.

### The resident (D-4d)

`esign/resident {method}` (step-up) → 202. **What the API reports while issuing:** `ApplicationStage` says
`calling` whenever an `esign_issue` work item is waiting, queued or running, and a resident's signing is
such an item, though there is no call. So in HTTP mode `routeFor('calling', 'resident')` is D-4d (D-4d
accepts `signing` and `calling`; D-4b only foreign founders), and D-4d shows "E-imzanız doğrulanıyor" and
polls until `signed`. The view does not say which method was chosen. The development provider answers in
about a second (`nes_existing`, a year; `nes_standard` for e-Devlet, three years).

### The signed screen (D-4c)

- Serial, `issuedAt` and `validUntil` are the API's; the holder is the account's name (the API sends none;
  in development the identity check renames a foreign founder's account to "John Doe" and e-Devlet's stand-in
  gives "Mehmet Yılmaz"). Title "Günlük e-imza" for `eshs`, "Nitelikli e-imza" otherwise.
- The countdown and bar use `validUntil` against the certificate's own validity (`validUntil − issuedAt`),
  "23:59" style under two days, "1094 gün" style above.
- Left out in HTTP mode: the passport/T.C. part of the holder line, "Kapsam: Yalnızca … kuruluş
  belgeleri" (the API reports no scope) and "Görüşme tutanağı / Taahhütname belgelerinize eklendi" (the API
  adds no such document).
- **Expiry:** when `validUntil` passes on D-4c the store reads the application once; the API is then at
  `signing` with the old certificate still in the view, so the portal goes back to D-4a / D-4d, which say
  "E-imzanızın süresi doldu. Kuruluşu başlatabilmek için e-imza adımını yeniden yapmanız gerekir." A set-up
  refused with 409 `no_valid_signature` re-reads the application the same way. (Tested with a hand-built
  fixture, `SIGNATURE_EXPIRED`; not walked: it takes 24 hours.)

### The set-up screen (D-5a) in HTTP mode: the rules

D-5a is a status page. Staff and the institutions do the work; it can take days; the founder may close
the page. It shows only what the server reports:

- **Steps:** the server's nine steps line up with the portal's nine agencies by number, and eight titles are
  word for word the same (the ninth is "Mali Müşavir Eşleştirme" on the API, "Müşavir Yönlendirme" in the
  portal; checked in `api-mapper.spec.ts`). So the layout stays: the building, "Detayı gör" and the rows.
  In HTTP mode the rows carry the server's titles and states ("Tamamlandı", "İşlemde", "Sırada", "Beklemede"
  for a state the portal does not know), with no institution line (the API sends none). The list and its
  sub-steps are open by default.
- **"İşlemde":** the server leaves a step `pending` until one of its tasks is completed, even when a task is
  already with the institution; the portal counts a step as running when the server says `in_progress` or
  when one of its tasks has started (`waiting_external`, `in_progress`, `done`).
- **Tasks** (under "Alt adımları göster", steps 4–9): the server's own (13 in all, fewer than the mock's 34
  sub-steps), with "· kurumda bekliyor" (`waiting_external`), "· işlemde", "· sırada", "(muaf)" struck through
  (`exempt`), ✓ when done. The count is tasks done or exempt / all tasks.
- **The building** stands at the number of steps 4–9 completed, a whole floor each; it does not rise with
  time. The floors are a count, not particular steps (several steps run side by side on the server).
- **No percentage, no time estimate, no "current sub-step" line, no live log lines or documents made in
  the browser** (`store.setup()` is null in HTTP mode).
- **`setup: null`** (the Worker has not created the steps yet; seconds in development): "Kuruluş
  adımlarınız hazırlanıyor".
- **Results** appear under the list as they arrive (MERSİS no, ticaret sicili tescil no, VKN, vergi
  dairesi, IBAN, e-Fatura kayıt no, SGK işyeri sicil no), only those the API has sent.
- **Timeline:** the side panel's "İşlem kaydı" is the server's `logs`.
- Lead text: "Kurum işlemleri ekibimiz ve ilgili kurumlar tarafından yürütülmektedir; bu süreç birkaç gün
  sürebilir. … sayfa açıksa durum kendiliğinden güncellenir." (no promise of e-mails at each stage, which
  the API does not send).
- At `done` the finishing moment plays as in the mock, then D-5b.

### The done screen (D-5b) in HTTP mode

| Element | HTTP mode | Why |
| --- | --- | --- |
| Results | VKN (+ vergi dairesi), MERSİS no (+ tescil no), IBAN, e-Fatura kayıt no, SGK işyeri sicil no; each with "Kopyala"; only those sent | `results` keys `vkn`, `vergi_dairesi`, `mersis_no`, `tescil_no`, `iban`, `e_fatura_no`, `sgk_isyeri_no` (`ttsg_sayi` and others are not shown) |
| Mali müşavir row and its "İletişim" | hidden | **API gap:** the view has no advisor name or firm; "İletişim" only sent a mock e-mail |
| "Sermayenin %25'i (62.500 TL) bloke" under the IBAN, "Halkbank" in its label | hidden | the API sends no capital; the amount was the portal's constant |
| "Tescil … · Gebze Ticaret Sicili Müdürlüğü · Merkez: …" | "Kuruluş <date> · Ticaret sicili tescil no <no>" | the date of "Şirketiniz kuruldu" in the timeline, the number from `results` |
| "Sonraki adımlar" | hidden | names the mock's advisor, a capital amount and e-mails the API does not send |
| "Tüm belgeleri indir (ZIP)" | hidden | the ZIP was made of browser placeholders |
| "Şirket paneline git" | hidden | only sent a mock Inbox e-mail |
| (new) note + "Belgeleri görüntüle" / "İşlem kaydını görüntüle" | "Şirketinize ait belgeler düzenlendiğinde Belgeler bölümünde listelenecektir." (**wording to be confirmed**) | |
| Logo | absent | the API keeps no logo |

### Documents in HTTP mode (all screens)

- The side panel lists exactly the API's `documents`, by Turkish type name (`DOC_NAMES` in api-mapper.ts),
  with size and date. No "PDF, e-imzalı", no PDF badge, **no preview and no download** (the API has no
  route to download a document). Under the list: "Belgeler düzenlendiğinde buradan görüntülenebilecek ve
  indirilebilecektir." (**wording to be confirmed**). Today the API lists the deck and the address document
  only, and generates no company documents.
- `ApplicationStore.documentPdf` refuses in HTTP mode, so no placeholder PDF can be produced there; the
  preview dialog is reachable only from the mock's buttons.

### Each screen element hidden or changed in HTTP mode (steps 4 and 5)

| Screen | Element | HTTP mode |
| --- | --- | --- |
| D-4a | consent, "Operatörü ara" | connected (`esign/consent`, `call/start` with step-up) |
| D-4a / D-4d | expired-certificate notice | new |
| D-4b | scripted call | kept (no vendor); its end calls `call/complete` once |
| D-4b | "E-imzanız düzenleniyor" | new, after the call was reported ended |
| D-4b | "Görüşmeyi bitir" | connected (`call/end`); not shown while issuing |
| D-4c | holder's document, "Kapsam", "… belgelerinize eklendi" | hidden |
| D-4c | title, countdown | from the certificate's kind and validity |
| D-4d | method choice | connected (`esign/resident` with step-up) |
| D-4d | "E-imzanız doğrulanıyor" | new, while the API says `calling` |
| D-5a | as in "The set-up screen" above | |
| D-5b | as in "The done screen" above | |
| side panel | documents | the API's list, no preview/download |

### Captured answers and tests

`capture.sh step45` (two founders, 2026-11-25): F (foreign) `esign-signing`, `esign-consent-missing`,
`esign-consent`, `esign-call-open`, `esign-call-ended`, `esign-no-open-call`, `esign-issuing`,
`esign-signed`, `setup-started`, `status-setup`, `setup-steps`, `setup-results` (registration done:
`mersis_no`, `tescil_no`, `ttsg_sayi`), `setup-done`, `status-done`; R (resident) `resident-signing`,
`resident-issuing`, `resident-signed`, `resident-setup-steps`. Staff are played in the background with
`dev/staff.sh -a <ref> setup`. The resident's development address `<T.C. no>@edevlet.test` is replaced and
the run stops if the T.C. kimlik no is found in a saved file. Hand-built: `SIGNATURE_EXPIRED`,
`NO_VALID_SIGNATURE`.

Tests: `api-mapper.spec.ts` "steps 4 and 5" (12), `http-api.spec.ts` "HttpApi steps 4 and 5" (6),
`application.store.spec.ts` "in steps 4 and 5 (HTTP mode)" (6): the call reported once and not polled
while it runs, the resident polled, the three step-up actions repeated once, `no_valid_signature`
re-reading, the one read at expiry, the set-up's slow pace and no poll after `done`.

### Walked end to end (2026-11-25, HTTP mode on port 4300, the API stack running)

- Foreign founder `DS-26-91200727` (steps 1–3 by same-origin `fetch` in the page, `dev/staff.sh title
  reserve`, then signed out and in again so the session had no second factor): D-4a consent → "Operatörü
  ara" → **step-up dialog**, code from `dev/last-code.sh` → the call started by itself → "Görüşmeyi bitir",
  confirmed → D-4a lobby → call again → after 20 s "E-imzanız düzenleniyor" for about 2 s → D-4c with the
  API's serial (`ESHS-2611-8094-…`, matched against `GET /api/application`) and "26.11.2026 15:01
  tarihine kadar geçerli", "23:59" → "Kuruluşu başlat" (no dialog: the code was under 15 minutes old) →
  D-5a, steps appeared by polling → `dev/staff.sh setup` stopped after the first task: registration
  "Tamamlandı", tax and bank "İşlemde" with "kurumda bekliyor", MERSİS no and tescil no listed, building
  1/6, all without a reload → reload: same state → the rest of `staff.sh setup` → finishing moment → D-5b
  with the API's VKN, MERSİS, IBAN, e-Fatura and SGK numbers. No request after the last full read at `done`.
- Foreign founder `DS-26-53989913`: the same to D-4c on the old bundle (the dev server had served stale
  lazy chunks; restarted), then on the new one: D-4c → "hazırlanıyor" → steps → `staff.sh setup` → done →
  documents panel (Sunum, Adres belgesi; no preview, no download) → reload on D-5b: `/api/me`, the status
  read and one full read, nothing after.
- Resident `DS-26-11195495` (steps 1–3 with curl on its own session; then the e-Devlet dialog in the page
  with the generated test T.C. no): D-4d, "e-Devlet ile yeni e-imza" → **step-up dialog** (403 → code →
  repeated, 202) → "E-imzanız doğrulanıyor" for about 2 s → D-4c "Nitelikli e-imza", "24.11.2029 15:04",
  "1094 gün" → set-up → steps appeared by polling (left at `setup`).
- Network: while waiting only status reads, a full read only after a change. Browser storage: only
  `dsp.prefs.v1`. Console: no errors from the portal (only the browser's lines for the expected 403
  `step_up_required` and a 401 on the sign-in page).
- Mock mode (default configuration, port 4301): D-4a → scripted call → D-4c (passport line, "Kapsam",
  "Görüşme tutanağı belgelerinize eklendi") → scripted set-up (%53 with agencies' institution lines) →
  done with the mock's results, "Sonraki adımlar", "Tüm belgeleri indir (ZIP, 20 belge)"; the side panel's
  documents still have preview and download.
- Not walked: an expired certificate (24 hours), the `no_valid_signature` refusal, a hang-up refused with
  `no_open_call`, a reload during the scripted call, a set-up step in `exception` / `blocked`.

## Still simulated or missing in HTTP mode

Everything the portal shows against the real API that is not the API's, or that the API cannot do yet:

- **Camera check (D-2a, D-2a-m):** the portal's own animation; no identity vendor. The development
  provider always passes; a failed check was not walked.
- **Video call (D-4b):** the portal's scripted call with a fixed operator ("Elif K.") and captions; no video
  or e-signature vendor. The API cannot say whether a call is open or the certificate is being issued.
- **Card entry (D-3a):** the portal's own form and a development token (`tok_test_` + last four digits); a
  real provider's hosted fields are not built. The 3-D Secure panel is a lookalike.
- **e-Devlet dialog:** a development stand-in for the redirect (`HttpApi.edevlet` plays the return trip).
- **Terminal AI:** its answers are the mock's (`ask` is `not_connected`); the suggested questions are the
  portal's.
- **Documents and downloads:** no download route, no company documents generated; the side panel lists the
  API's documents without preview or download.
- **Advisor:** no name or firm in the view; D-5b leaves the row out.
- **Logo:** the API keeps no logo; D-1c's logo replacement and D-5b's logo are absent.
- **Capital:** the API sends none; the portal shows its constant (250 000 TL) where needed (D-1c), and
  D-5b leaves out the blocked-capital line.
- **Deck evaluation (piece 9):** the founder sees no findings (none reach the portal) and cannot answer
  follow-up questions: `evaluationQuestions` is a stop screen with no form. The API's evaluator is a
  development stand-in that decides by the deck's file name; no real STB call was made. The mock's
  evaluation is a 6-second timer whose end the demo panel chooses.
- **Title suggestions (D-1d):** the portal's own (`titleAlternatives`).
- **Timeline codes:** the view carries Turkish texts only; the mapper reads times from them (`LOG_TEXTS`).
- **Rejected founder:** the next sign-in creates a new application (the API cannot tell "closed").
- **Consents:** the register screen's KVKK and terms ticks are not sent; the deck consents' labels
  (deck, CV and answers to an outside evaluation service) are placeholders.
- **"Bu cihazda 30 gün oturumu açık tut":** does nothing (12-hour sessions).
- **Landing page fees:** the portal's `FEES`, not the API's.
- **D-2b/D-2e:** no per-list screening results or score (the API reports none).
- **Back from manual review / review after manual review:** no route (open decision 12).
- **Wording to be confirmed:** the documents notes on D-5b and in the side panel, D-5a's lead, and D-4d's
  "e-Devlet ile yeni e-imza alacağım … günlük e-imza düzenlenir" (the development provider issues a
  three-year `nes_standard` for it).

## Flow: the mock walks the API's path up to the review (since 2026-11-25)

**Superseded in part by piece 9** ("The deck step: outside evaluation"): the deck rows and the
cross-check below describe the AI reader, which was removed.

Piece 2 made the portal's step 1 follow the API's flow, still on the mock, so that both modes walk
the same path once `HttpApi` is filled in:

| | Portal (mock) | API |
| --- | --- | --- |
| After e-mail or e-Devlet sign-up | stage `profile`, screen D-1e `/details` | status `draft` without a profile = stage `profile` |
| `submitProfile` | allowed at `profile` and `verified`, each save replaces the last; then `verified` | `PUT /profile`, allowed while `draft`; every version kept |
| Profile rules | brand 2–120 (spaces collapsed), sector, funding, nationality and country 1–60, phone 8–15 digits; the API's Turkish messages | `SubmitProfileHandler.Validate` |
| `uploadDeck` | `File` + `{ noticeAcknowledged, aiConsent }`; refused without both, without a profile ("Önce ön bilgileri doldurunuz."), over 25 MB or not PDF/PPTX | `POST /deck` multipart; records two consent rows per upload |
| After the scan | `crossCheck`: six items, `{ key, label, stated, read, match, choice, at }` | `formation.cross_check`, same JSON |
| `resolveCrossCheck(key, 'stated' \| 'read')` | refused on an item that matches; `stated` writes the profile's value | `POST /cross-checks/{key}` |
| Typing another value in the review | counts as `choice: 'edited'` | same (`UpdateReviewHandler`) |
| `submitReview` | refused while a difference has no choice | same |

Choices made in this piece:

- There is no "edit profile" call that moves the stage back: the API derives `profile`/`verified`
  from whether a profile exists. D-1a links to `/details`, which the guard opens at both stages.
- Consents on a re-upload: the D-1c "Başka dosya yükle" panel shows both boxes again, unticked,
  and sends only what the founder ticked there. Nothing is remembered from the first upload,
  because the API records consent per upload.
- The checkbox labels ("Sunumumla ilgili aydınlatma metnini okudum." / "Sunumumun yapay zekâ ile
  işlenmesine onay veriyorum.") are **wording to be confirmed**; the notice text does not exist yet,
  so nothing links to it.
- The mock keeps the consent times on `deck.noticeAt` / `deck.aiConsentAt` and logs both ticks as
  the founder's acts.
- The demo seed states a profile whose phone differs from the demo deck, and D-1e's "Demo: örnek
  bilgileri doldur" one whose phone differs from the sample deck (Lumora), so D-1c shows a
  difference in demos. Seeding a stage after the review chooses the deck's value.

Still different from the API: `eligible` folded into `payment`. (The `titleChecking` stage and polling
came in piece 5.) (The `email` parameters were removed
in piece 3.)

## Known gaps for later pieces

- Steps 4 and 5: see "Steps 4 and 5 over HTTP" for their API gaps, and "Still simulated or missing in
  HTTP mode" for the whole list.
- Payment: the card form is the portal's own and the token a development stand-in (see "Card data never
  leaves the browser"); a real provider's hosted fields and its 3-D Secure page are not built.
- The landing page (`/`, before sign-in) still lists the portal's `FEES`; the API's fee list is read
  only for a signed-in founder.
- Step 2: the camera is simulated in both modes (no identity vendor). A failed identity check and the
  second failure were not walked (the development provider always passes); they are covered by mapper
  and store tests on hand-built fixtures (`IDENTITY_FAILED`, `IDENTITY_FAILED_TWICE`).
- Step 2: the view has no codes for its timeline lines; the mapper reads times from their Turkish text.
- The rejected founder's next sign-in creates a new application (API gap above).
- The deck step's answers are captured from the API's stand-in evaluator (`capture.sh step1`, which also
  makes the `questions` and `failed` endings by the deck's file name); `cancelled` cannot be caused and
  is not covered.
- Registering an address that already has an account: the API answers 202 and tells the owner by
  e-mail; the mock still says "Bu e-posta adresiyle bir hesap zaten var." (kept because its spec
  expects it). To align when the owner decides.
- The register screen's KVKK and terms ticks are checked on screen only; the API's register call
  has no field for them, so no consent is recorded for them.
- D-0a's "Bu cihazda 30 gün oturumu açık tut" box does nothing: the API's sessions end 12 hours
  after sign-in, with no "remember me".
- Mock mode: an address waiting for its code is no longer restored after a reload (it was kept in
  `dsp.session.v1` before). Signing in again leads back to D-0c with a new code, as with the API.
