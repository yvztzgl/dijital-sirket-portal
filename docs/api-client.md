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
| `src/app/core/rules.ts` | Pure checks the screens use (card, T.C. kimlik no, password strength, address document size, deck size and type, funding options). Not part of either implementation. |
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
- The mock's way of keeping a founder signed in across reloads and tabs (reading its own storage,
  listening for other tabs) is also on `DemoTools`. In HTTP mode nothing is restored yet; a later
  piece asks the server for the session.

`DemoSettings` (speed, forced scenarios) is read only through the mock. Its class is still in the
http bundle because the demo panel is imported by the screen pill, but nothing creates it there.

## Running each mode

| | Mock (default) | HTTP |
| --- | --- | --- |
| Serve | `npx ng serve` | `npx ng serve --configuration http` (the API must run on `http://localhost:5149`) |
| Build | `npx ng build` | `npx ng build --configuration production,http` (`--configuration http` alone also builds, without output hashing and budgets) |
| Test | `npx ng test --watch=false` | same; `http-api.spec.ts` tests `HttpApi` with `HttpTestingController` |
| `.claude/launch.json` | `portal` | `portal-http` |

Development is same-origin: the browser only ever talks to `localhost:4200`, and the dev server
forwards `/api/*` to the API. That is why no `withCredentials` and no CORS setup are needed. How
production serves the portal and the API is still open (open decision 6 in the project log).

## What HttpApi does today

Nothing yet. Every method rejects with `ApiError('Bu işlem henüz sunucuya bağlanmadı.')`, code
`not_connected`, which the store shows like any other error.

What is in place for the next pieces:

- `request(method, url, body?)` (private): sends the request and turns an error response into
  an `ApiError`. The API's error body is `application/problem+json`
  `{ type?, title, status, code, requestId, errors? }`; the mapping is
  `message = title`, `code = code`, `status = HTTP status`, `fields = errors`. A body that is not a
  problem (a proxy's HTML 502) or no answer at all (network down, API not running) gives
  'Beklenmeyen bir hata oluştu.' with `status` set only when there was one.
- `markApiWrites`: adds `X-DSP-Request: 1` to every POST/PUT/PATCH/DELETE to `/api/`. The API
  refuses writes without it (a cross-site HTML form cannot set a custom header).
- `ApplicationStore.run()` still shows only `message`; showing `fields` next to form fields comes
  with the screens that need it.

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

Still different from the API (not part of this piece): the `titleChecking` stage, `eligible`
folded into `payment`, slow stages driven by the server, and the `email` parameters on `Api`.

## Known gaps for later pieces

- Method signatures still take the founder's e-mail, as the mock needs. The real API identifies
  the founder from the session cookie; the signatures will change when the calls are connected.
- The store keeps the signed-in e-mail under `dsp.session.v1` in both modes; HTTP mode does not
  use it to restore anything.
- The time-based steps (scan, identity check, list search, call, setup) are still simulated in the
  store; in HTTP mode their state will come from the server.
