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
| `src/app/core/testing/api-fixtures.ts` | Literal API answers the specs use: hand-written ones, and `CAPTURED` (below). |
| `src/app/core/testing/captured/*.json` | `GET /api/application` as the running API answered it at each stage of steps 1 and 2, plus the status read, the reference data, the phone routes and the closed application's 404 (2026-11-25). Made-up founders, e-mail addresses and the phone token replaced. |
| `tools/api-capture/capture.sh` | Re-captures those files against a running stack (`capture.sh [step1\|step2\|all]`; needs `../dijital-sirket-api/dev/staff.sh` for the title and review steps). |
| `src/app/core/status-poller.ts` | `StatusPoller` and `pollDelay`: the pacing of the status poll in HTTP mode. |
| `src/app/core/rules.ts` | Pure checks the screens use (card, T.C. kimlik no, password strength, address document size, deck size and type, funding options, title suffix and title suggestions). Not part of either implementation. |
| `src/environments/environment.ts` | Default (mock) mode: names `MockApi`, no extra providers. |
| `src/environments/environment.http.ts` | HTTP mode: names `HttpApi`, provides `HttpClient` with the interceptor. |
| `proxy.conf.json` | Dev server: `/api` → `http://localhost:5149`. |

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
| `.claude/launch.json` | `portal` | `portal-http` |

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
Inbox toasts belong to the mock, and nothing in HTTP mode sends to the Inbox).

## Step 1 over HTTP (since 2026-11-25, piece 5)

**Connected:** `submitProfile`, `uploadDeck`, `resolveCrossCheck`, `updateReview`, `submitReview`,
`chooseTitle`, `reference`, and the background-work capability `work` (polling). Every write answers
with an empty body (204/202); `HttpApi` then reads the application again (`fresh()`: the status read,
then `GET /api/application`, mapped). Step 2 came in piece 6 (below); step 3 on still rejects with
`not_connected`.

### Requests of step 1

```
Profile (D-1e)    PUT  /api/application/profile {brand,sector,funding,nationality,phone,country}  204
Deck (D-1a)       POST /api/application/deck  multipart: file, noticeAcknowledged, aiConsent       202
                  (FormData; the browser sets the multipart Content-Type; the ticks are sent as given)
Difference        POST /api/application/cross-checks/{key} {choice:"stated"|"read"}                 204
Review edit       PATCH /api/application/review {fields:{<key>: value}}                              204
                  only the fields that differ from the last read review (toReviewFields); nothing
                  is sent when nothing differs (the API refuses an empty change)
Submit            POST /api/application/review/submit                                                202
New title (D-1d)  POST /api/application/title {title}  (without "A.Ş."; the server adds it)          202
Reference         GET  /api/reference/wizard   once per session (cached in HttpApi, dropped on sign-out)
Polling           GET  /api/application/status  → {stage, changedAt}
```

### Stage table for step 1

| API stage | Portal stage | Screen | What ends it |
| --- | --- | --- | --- |
| `profile` | `profile` | D-1e `/details` | the founder saves the profile |
| `verified` | `verified` | D-1a `/deck` (D-1e still open) | the founder uploads a deck |
| `scanning` (`deck.status: "reading"`) | `scanning` | D-1b `/deck/scan` | the Worker: `review`, or `verified` with `deck.status: "failed"` (polled) |
| `verified` + `deck.status: "failed"` | `verified` | D-1a, with "… okunamadı" and a new upload | the founder uploads again |
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
  `SERVER_WAITING_STAGES` (`scanning`, `titleChecking`; later pieces add more) and someone is signed in,
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
- **The deck being read** (D-1b): the animation still moves with time, but in server mode it uses
  `openEndedProgress` (timeline.ts), which slows down and never passes 95%; only the server's next
  stage ends the screen. `completeScan` is never called in HTTP mode (HttpApi does not have it).
- **409 `wrong_stage`** from any write: the store reads the application again, so the screen moves to
  where the application really is; the refusal's sentence stays on screen.

### Each screen action and what it does in HTTP mode

| Screen | Action | HTTP mode | Why |
| --- | --- | --- | --- |
| D-1e | Save | connected | |
| D-1e | Sector and funding choices | from `Api.reference()` | exactly what the API accepts |
| D-1e | "Demo: örnek bilgileri doldur" | still shown (fills the form only) | not gated before; left as it was |
| D-1a | Upload | connected | |
| D-1a | "Ön bilgileri düzenle" | shown only while no deck exists (both modes) | the API refuses a profile after any deck, also after a failed reading |
| D-1a | "… okunamadı" notice | shown when `deck.status` is `failed` | the API's failed reading |
| D-1c | Difference choices | connected | |
| D-1c | Title, NACE, founder, contact, funding editors | connected; only changed fields sent | API refuses empty changes and empty values |
| D-1c | NACE search and suggestions | only codes from `Api.reference()` (10 today) | |
| D-1c | Logo replacement | offered only when a logo exists (the mock's); hidden in HTTP mode | the API keeps no logo |
| D-1c | "Başka dosya yükle" | connected; **hidden after a refused title** (both modes) | after a rejection the API keeps the rejected reservation as the latest, so a new deck would be read and land on `titleConflict` again |
| D-1c | "Başka unvan seç" | shown only after a refused title; back to D-1d | |
| D-1c | Submit | connected | |
| D-1d | Suggestions and own title | connected (`chooseTitle`) | suggestions are the portal's own (`titleAlternatives`), not the API's |
| D-1d | "Diğer bilgilere dön" | **navigates to D-1c** (both modes), no API call | the API takes review edits and a new submit after a refusal, but has no call that changes the stage; D-1c accepts `titleConflict` |
| D-1f | (nothing to do) | polled | |

`Api.backToReview` stays `not_connected` in HTTP mode, and its only entry point (D-2c) is hidden there (piece 6).

### Errors at fields

A refusal with `errors` sets `ApplicationStore.fieldErrors` (API field names). D-1e shows each message
under its field (`brand`, `sector`, `funding`, `nationality`, `country`, `phone`); D-1c shows them
under the review row (`REVIEW_ROWS`: e.g. "Ad eksik. Soyad eksik." under Kurucu after a submit) and
under the inputs of the open editor (`REVIEW_INPUTS`); D-1d under the own-title field (`title`). The
banner shows the field's sentence when there is exactly one, the problem's title otherwise ("Eksik
bilgileri tamamlayınız."). The mock never names fields, so mock mode shows only the banner.

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
| `payment.holder` | `''` | Not in the view. |
| `signature.method` | `existing` / `edevlet` kept, anything else `eshs` | The API's certificate kinds were not seen yet. |
| `setup`, `results`, `call` | absent | Different shapes; the next pieces. |
| `phoneLink` | only in `HttpApi`'s memory while the QR code is shown | the API gives the token once, in the answer to `POST /phone-link` |
| `docs[].group`, `docs[].name` | `deck` → "Sunum", `address_proof` → "Adres belgesi", both in "1 · Başvuru & Uygunluk"; any other type: `''` and the type | The view gives a type code, not a group and title. |

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

## Flow: the mock walks the API's path up to the review (since 2026-11-25)

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

- Step 3 onward: payment, call and setup are still `not_connected` in HTTP mode; when connected, their
  waiting stages join `SERVER_WAITING_STAGES`.
- Step 2: the camera is simulated in both modes (no identity vendor). A failed identity check and the
  second failure were not walked (the development provider always passes); they are covered by mapper
  and store tests on hand-built fixtures (`IDENTITY_FAILED`, `IDENTITY_FAILED_TWICE`).
- Step 2: the view has no codes for its timeline lines; the mapper reads times from their Turkish text.
- The rejected founder's next sign-in creates a new application (API gap above).
- D-1b in HTTP mode lists no fields while the deck is read (the API sends them only once it is read),
  so "Okunan bilgiler" shows 0 / 0 until the next screen.
- A deck that fails to be read was not walked end to end (the development reader does not fail);
  the mapper and D-1a's notice are checked with a fixture built from captured JSON.
- Registering an address that already has an account: the API answers 202 and tells the owner by
  e-mail; the mock still says "Bu e-posta adresiyle bir hesap zaten var." (kept because its spec
  expects it). To align when the owner decides.
- The register screen's KVKK and terms ticks are checked on screen only; the API's register call
  has no field for them, so no consent is recorded for them.
- D-0a's "Bu cihazda 30 gün oturumu açık tut" box does nothing: the API's sessions end 12 hours
  after sign-in, with no "remember me".
- Mock mode: an address waiting for its code is no longer restored after a reload (it was kept in
  `dsp.session.v1` before). Signing in again leads back to D-0c with a new code, as with the API.
