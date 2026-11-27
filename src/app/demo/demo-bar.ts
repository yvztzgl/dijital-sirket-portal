import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ApiError } from '@core/api/api-error';
import { ApplicationStore } from '@core/state/application.store';
import { DemoServerApi } from '@core/api/demo/demo-server-api';
import { Stage } from '@core/models/models';

interface DemoAction {
  label: string;
  run: () => Promise<unknown>;
}

const NOTHING_OPEN = 'Kurum görevleri henüz açılmadı, birkaç saniye sonra tekrar deneyin.';
/** How long an error stays under the buttons. */
const ERROR_MS = 6000;

/**
 * Demo controls against the real API (docs/api-client.md, "Demo mode against the API"): a strip of
 * buttons on the screens where a founder waits for staff or an outside service. Shown only when
 * `DemoServerApi.available()` (the http-demo build, HTTP mode, the API started with `Demo:Enabled`);
 * renders nothing otherwise, and nothing at a stage it has no buttons for.
 *
 * Buttons only: nothing moves on its own. After a click the store reads the application and starts
 * its existing poll's pace over (`checkServerNow`), so the stage the Worker sets arrives by itself.
 * Placed on D-1b, D-1g, D-1f, D-2c (HTTP branch) and D-5a. The mock's own demo panel is separate.
 */
@Component({
  selector: 'app-demo-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demo.available() && actions().length) {
      <section class="bar" aria-label="Demo kontrolleri">
        <span class="tag">Demo</span>
        <span class="hint">{{ hint() }}</span>
        <div class="buttons">
          @for (a of actions(); track a.label) {
            <button type="button" (click)="run(a)" [disabled]="working()">{{ a.label }}</button>
          }
        </div>
        @if (note(); as n) {<p class="note" role="status">{{ n }}</p>}
        @if (error(); as e) {<p class="err" role="alert">{{ e }}</p>}
      </section>
    }
  `,
  styles: `
    :host { display: block; margin-top: 16px; }
    .bar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 14px;
      border: 1px dashed var(--bd-C7D5F7); border-radius: 12px; background: var(--bg-F7F9FE);
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
    }
    .tag {
      flex: none; padding: 3px 8px; border-radius: 6px; background: var(--bg-061262); color: var(--fg-FFFFFF);
      font: 600 10.5px/14px 'IBM Plex Sans', sans-serif; letter-spacing: .08em; text-transform: uppercase;
    }
    .hint { flex: 1 1 180px; font: 400 12.5px/17px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .buttons { display: flex; flex-wrap: wrap; gap: 6px; }
    button {
      border: 1px solid var(--bd-C7D5F7); border-radius: 8px; padding: 6px 12px; background: var(--bg-FFFFFF);
      color: var(--fg-061262); font: 600 12.5px/16px 'IBM Plex Sans', sans-serif; cursor: pointer;
    }
    button:hover:not(:disabled) { border-color: var(--bd-061262); }
    button:focus-visible { outline: 2px solid var(--bd-061262); outline-offset: 2px; }
    button:disabled { opacity: .55; cursor: progress; }
    .note, .err { flex-basis: 100%; margin: 0; font: 500 12.5px/17px 'IBM Plex Sans', sans-serif; }
    .note { color: var(--fg-3B4660); }
    .err { color: var(--fg-B42318); }
  `,
})
export class DemoBar {
  protected readonly demo = inject(DemoServerApi);
  private readonly store = inject(ApplicationStore);

  protected readonly working = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The set-up's last answer ("… tamamlandı, kalan 3"). */
  protected readonly note = signal<string | null>(null);
  private errorTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.errorTimer));
  }

  private readonly stage = computed<Stage | null>(() => this.store.stage());

  protected readonly hint = computed(() => HINTS[this.stage() ?? ''] ?? '');

  protected readonly actions = computed<DemoAction[]>(() => {
    const d = this.demo;
    switch (this.stage()) {
      case 'evaluating':
        return [
          { label: 'Tamamlandı', run: () => d.evaluation('done') },
          { label: 'Soru var', run: () => d.evaluation('questions') },
          { label: 'Başarısız', run: () => d.evaluation('failed') },
          { label: 'Reddedildi', run: () => d.evaluation('rejected') },
        ];
      case 'evaluationQuestions':
        return [{ label: 'Tamamlandı', run: () => d.evaluation('done') }];
      case 'titleChecking':
        return [
          { label: 'Rezerve et', run: () => d.title('reserved') },
          { label: 'Reddet', run: () => d.title('rejected') },
        ];
      case 'manual':
        return [
          { label: 'Onayla', run: () => d.review('approve') },
          { label: 'Reddet', run: () => d.review('reject') },
        ];
      case 'setup':
        return [
          {
            label: 'Sıradaki kurumu tamamla',
            run: async () => {
              const r = await d.setupNext();
              this.note.set(`${r.completed} tamamlandı · kalan ${r.remaining}`);
            },
          },
        ];
      default:
        return [];
    }
  });

  protected async run(action: DemoAction) {
    if (this.working()) return;
    this.working.set(true);
    this.showError(null);
    try {
      await action.run();
    } catch (e) {
      this.showError(
        e instanceof ApiError && e.code === 'demo_nothing_open' ? NOTHING_OPEN : e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.',
      );
    } finally {
      this.working.set(false);
    }
    // Success or a wrong-stage refusal: either way the screen should show where the application is.
    await this.store.checkServerNow();
  }

  private showError(message: string | null) {
    clearTimeout(this.errorTimer);
    this.error.set(message);
    if (message) this.errorTimer = setTimeout(() => this.error.set(null), ERROR_MS);
  }
}

const HINTS: Record<string, string> = {
  evaluating: 'Sunum değerlendirmesinin sonucunu seçin.',
  evaluationQuestions: 'Ek bilgi alınmış gibi değerlendirmeyi tamamlayın.',
  titleChecking: 'Personelin unvan kararını verin.',
  manual: 'Uyum ekibinin inceleme kararını verin.',
  setup: 'Kurum görevlerini sırayla tamamlayın.',
};
