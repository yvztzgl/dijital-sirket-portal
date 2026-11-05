import { booleanAttribute, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { SCREENS } from '../screens/screens';
import { Icon } from '../shared/icon';
import { DemoNav } from './demo-nav';
import { DemoPanel } from './demo-panel';

/**
 * Prototype navigator: step through the designed screens in order and open the demo controls.
 * Lives in the page header; `floating` puts it bottom-left for pages without a header.
 * Not part of the product design — remove once real flows connect the screens.
 */
@Component({
  selector: 'app-screen-pill',
  imports: [DemoPanel, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.floating]': 'floating()',
    '[class.dark]': 'dark()',
    '[class.compact]': 'compact()',
    '(document:click)': 'outside($event)',
    '(document:keydown.escape)': 'panel.set(false)',
  },
  template: `
    @let s = current();
    <nav class="pill" aria-label="Ekranlar arasında gezin">
      @if (s) {
        <button type="button" class="step" (click)="go(prev()?.id)" [disabled]="!prev() || nav.jumping()" aria-label="Önceki ekran" title="Önceki ekran"><app-icon name="arrow-left" size="14px" /></button>
        <a class="label" routerLink="/screens" [title]="'Tüm ekranlar · ' + s.title">
          <span class="code">{{ s.code }}</span><span class="title">{{ nav.jumping() ? 'Hazırlanıyor…' : s.title }}</span>
        </a>
        <button type="button" class="step" (click)="go(next()?.id)" [disabled]="!next() || nav.jumping()" aria-label="Sonraki ekran" title="Sonraki ekran"><app-icon name="arrow-right" size="14px" /></button>
      } @else {
        <a class="label" routerLink="/screens">Tüm ekranlar</a>
      }
      <button type="button" class="demo" [class.on]="panel()" (click)="panel.set(!panel())" [attr.aria-expanded]="panel()" aria-haspopup="dialog">Demo</button>
    </nav>
    @if (panel()) {
      <app-demo-panel [docked]="!floating()" (closed)="panel.set(false)" />
    }
  `,
  styles: `
    :host { position: relative; display: block; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    .pill {
      display: flex; align-items: center; gap: 1px; height: 36px; box-sizing: border-box; padding: 3px;
      border: 1px dashed var(--bd-C7D5F7); border-radius: 999px; background: var(--bg-F7F9FE);
      font: 500 12.5px/16px 'IBM Plex Sans', sans-serif;
    }
    a, button { color: var(--fg-061262); text-decoration: none; border: 0; background: none; font: inherit; cursor: pointer; }
    .step { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; color: var(--fg-3B4660); }
    .step:hover:not(:disabled), .label:hover { background: var(--bg-EFF4FF); color: var(--fg-061262); text-decoration: none; }
    .step:disabled { opacity: .3; cursor: default; }
    .label { display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 8px; border-radius: 999px; white-space: nowrap; }
    .code { font: 600 11px/16px 'IBM Plex Mono', monospace; color: var(--fg-5B6478); }
    .title { max-width: 170px; overflow: hidden; text-overflow: ellipsis; }
    .demo {
      height: 28px; margin-left: 3px; padding: 0 10px; border-radius: 999px; background: var(--bg-061262); color: var(--fg-FFFFFF);
      font: 600 10.5px/16px 'IBM Plex Mono', monospace; letter-spacing: .08em; text-transform: uppercase;
    }
    .demo:hover, .demo.on { background: var(--bg-0C217E); }

    /* On the navy welcome hero. */
    :host(.dark) .pill { background: rgba(255, 255, 255, .08); border-color: rgba(255, 255, 255, .28); }
    :host(.dark) a, :host(.dark) button { color: rgb(230 235 247); }
    :host(.dark) .code { color: rgb(157 182 255); }
    :host(.dark) .step:hover:not(:disabled), :host(.dark) .label:hover { background: rgba(255, 255, 255, .12); color: rgb(255 255 255); }
    :host(.dark) .demo { background: rgb(255 255 255); color: rgb(6 18 98); }

    /* Fallback for pages without a header. */
    :host(.floating) { position: fixed; left: 16px; bottom: 16px; z-index: 1000; }
    :host(.floating) .pill { height: 38px; border: 0; background: rgba(6, 18, 98, .92); box-shadow: 0 12px 32px -12px rgba(6, 18, 98, .5); }
    :host(.floating) a, :host(.floating) button, :host(.floating) .code { color: rgb(255 255 255); }
    :host(.floating) .demo { background: rgb(255 255 255); color: rgb(6 18 98); }

    :host(.compact) .title { display: none; }
    @media (max-width: 1180px) { .title { display: none; } }
  `,
})
export class ScreenPill implements OnInit {
  readonly floating = input(false, { transform: booleanAttribute });
  readonly dark = input(false);
  readonly compact = input(false);

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly nav = inject(DemoNav);
  protected readonly panel = signal(false);

  private readonly destroyRef = inject(DestroyRef);

  ngOnInit() {
    // Header copies tell the floating fallback to stay hidden (inputs are set by now).
    if (this.floating()) return;
    this.nav.docked.update((n) => n + 1);
    this.destroyRef.onDestroy(() => this.nav.docked.update((n) => n - 1));
  }

  protected go(id?: string) {
    if (id) void this.nav.open(id);
  }

  protected outside(e: Event) {
    if (!this.host.contains(e.target as Node)) this.panel.set(false);
  }

  private readonly screenId = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let r = this.route.snapshot;
        while (r.firstChild) r = r.firstChild;
        return (r.data['screen'] as string | undefined) ?? null;
      }),
    ),
    { initialValue: null },
  );

  private readonly index = computed(() => SCREENS.findIndex((s) => s.id === this.screenId()));
  protected readonly current = computed(() => SCREENS[this.index()] ?? null);
  protected readonly prev = computed(() => (this.index() > 0 ? SCREENS[this.index() - 1] : null));
  protected readonly next = computed(() => {
    const i = this.index();
    return i >= 0 && i < SCREENS.length - 1 ? SCREENS[i + 1] : null;
  });
}
