import { booleanAttribute, ChangeDetectionStrategy, Component, input, numberAttribute } from '@angular/core';
import { SidePanel, SidePanelCtx, SidePanelTab } from './side-panel';
import { Stepper } from './stepper';
import { TopBar } from './top-bar';

/**
 * Page frame of a wizard step in the "Odak" layout: the app header, the step bar and the screen's
 * own content in one centred column, Terminal AI docked on the right. Styles are in src/wizard.scss.
 */
@Component({
  selector: 'app-step-page',
  imports: [SidePanel, Stepper, TopBar],
  template: `
    <div class="wz-page" [attr.data-screen-label]="label()">
      <app-top-bar />
      <div class="wz-body">
        <main class="wz-main">
          <div class="wz-col" [style.max-width.px]="width()">
            <app-stepper [current]="step()" [allDone]="allDone()" [sub]="sub()" [parts]="parts()" [part]="part()" />
            <ng-content />
          </div>
        </main>
        <div class="wz-side"><app-side-panel [tab]="tab()" [ctx]="ctx()" height="100%" radius="26px" /></div>
      </div>
    </div>
  `,
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepPage {
  /** Wizard step, 1–5. */
  readonly step = input(1, { transform: numberAttribute });
  readonly allDone = input(false, { transform: booleanAttribute });
  /** For a step that spans several screens: this screen's name, how many there are, and which one this is (1-based). */
  readonly sub = input('');
  readonly parts = input(0, { transform: numberAttribute });
  readonly part = input(0, { transform: numberAttribute });
  /** What Terminal AI talks about on this screen. */
  readonly ctx = input<SidePanelCtx>('review');
  /** View the panel opens on. */
  readonly tab = input<SidePanelTab>('ai');
  /** Screen code and name, for the demo tools. */
  readonly label = input('');
  /** Width of the content column in px (720 by default since 2026-11-17, when the owner asked for wider columns; it was 600). */
  readonly width = input(720, { transform: numberAttribute });
}
