# Dijital Şirket Platformu — portal

Angular implementation of the Claude Design screens (login/register, welcome, and the five-step
wizard: Sunum → Uygunluk → Ödeme → e-İmza → Kuruluş). Run `ng serve` and open `/screens` for an
index of all 20 screens; a floating pill at the bottom-left steps through them in order.
Templates are generated — see `tools/design-import/README.md`.

### How the data works

The whole flow runs on real application state, with no backend yet:

- `src/app/core/mock-api.ts` is an in-browser stand-in for the platform API (data in `localStorage`,
  simulated delays). Swap it for an HTTP client to connect a real backend; screens only talk to
  `ApplicationStore` (`src/app/core/application.store.ts`).
- What the founder enters at registration and review flows through every later screen. The pitch
  deck "AI reading" fills company fields from a sample profile.
- Long-running steps (AI scan, AML checks, e-signature call, company setup) are time-based and
  survive reloads; `src/app/core/timeline.ts` defines them.
- Verification codes (e-mail, 3-D Secure SMS) appear as on-screen toasts. Test card: `4242 4242 4242 4242`.
  Demo T.C. kimlik no: `10000000146`.
- Natural variants: a title like "Acme Bulut Bilişim" clashes in MERSİS, funding source
  "Üçüncü taraf transferi" triggers manual review, registering as "T.C. vatandaşı" uses e-Devlet.
- The **Demo** button (bottom-left) sets simulation speed, forces scenarios, jumps to any screen with a
  seeded demo founder, and resets all data.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.3.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Light and dark theme

The moon/sun button in the header switches themes. The choice is saved per browser, and a first visit follows the system setting.
Screens keep their inline styles, but every colour is a token such as `var(--fg-061262)` or `var(--bg-FFFFFF)`. The name is the role (`fg` text, `bg` surface, `bd` line or ring, `ic` illustration) plus the light-mode hex.
`src/tokens.scss` is generated: edit the `DARK` table in `tools/theme/tokenize.py`, then run `python3 tools/theme/tokenize.py`. The same command tokenizes any new hex colours added to templates.
Navy panels carry `class="keep-light"`, so they look the same in both themes.
