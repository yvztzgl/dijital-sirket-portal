import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SCREEN_GROUPS, SCREENS } from '../screens/screens';
import { DemoNav } from './demo-nav';

/** Overview of every implemented screen, grouped like the design canvases. */
@Component({
  selector: 'app-screen-index',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <header class="head">
        <span class="eyebrow">DİJİTAL ŞİRKET PLATFORMU · EKRANLAR</span>
        <h1>Tüm ekranlar</h1>
        <p>Claude Design projesinden aktarılan {{ screens.length }} masaüstü ekranı. Bir ekrana gitmek için başvurunuz o aşamada değilse demo kurucu o aşamaya hazırlanır.</p>
      </header>
      @for (g of groups; track g.id) {
        <section class="group">
          <h2>{{ g.title }}</h2>
          <ul>
            @for (s of screens; track s.id) {
              @if (s.group === g.id) {
                <li>
                  <a [href]="'/' + s.path" (click)="$event.preventDefault(); nav.open(s.id)">
                    <span class="tag">{{ s.code }}</span>
                    <span class="title">{{ s.title }}</span>
                    <span class="desc">{{ s.desc }}</span>
                    <span class="path">/{{ s.path }}</span>
                  </a>
                </li>
              }
            }
          </ul>
        </section>
      }
    </main>
  `,
  styles: `
    .page { max-width: 1040px; margin: 0 auto; padding: 56px 32px 96px; display: flex; flex-direction: column; gap: 40px; }
    .head { display: flex; flex-direction: column; gap: 8px; }
    .eyebrow { font: 600 11px/16px 'IBM Plex Mono', monospace; letter-spacing: 0.1em; color: var(--fg-5B6478); }
    h1 { margin: 0; font: 600 32px/40px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); letter-spacing: -0.01em; }
    p { margin: 0; font: 400 14.5px/22px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    h2 { margin: 0 0 12px; font: 600 16px/24px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    ul { list-style: none; margin: 0; padding: 0; background: var(--bg-FFFFFF); border: 1px solid var(--bd-E5E7EB); border-radius: 14px; overflow: hidden; }
    li + li { border-top: 1px solid var(--bd-EEF1F6); }
    a { display: grid; grid-template-columns: 56px 220px minmax(0, 1fr) auto; gap: 16px; align-items: baseline; padding: 14px 20px; color: inherit; }
    a:hover { background: var(--bg-F7F9FE); text-decoration: none; color: inherit; }
    .tag { justify-self: start; font: 600 11px/16px 'IBM Plex Mono', monospace; padding: 2px 6px; background: var(--bg-061262); color: var(--fg-FFFFFF); border-radius: 4px; }
    .title { font: 600 14px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); }
    .desc { font: 400 13px/20px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); }
    .path { font: 500 12px/20px 'IBM Plex Mono', monospace; color: var(--fg-061262); }
  `,
})
export class ScreenIndex {
  protected readonly groups = SCREEN_GROUPS;
  protected readonly screens = SCREENS;
  protected readonly nav = inject(DemoNav);
}
