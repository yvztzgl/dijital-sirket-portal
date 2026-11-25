import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Api } from '../core/api';
import { DemoNav } from './demo-nav';
import { ScreenPill } from './screen-pill';

/**
 * Floating fallback for the prototype screen navigator. Every page header carries the pill
 * (see HeaderTools); this one appears only on pages without a header, such as /screens.
 * Mock mode only: without demo tools (HTTP mode) it is not shown.
 */
@Component({
  selector: 'app-screen-nav',
  imports: [ScreenPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (demoMode && !nav.docked()) {<app-screen-pill floating />}`,
})
export class ScreenNav {
  protected readonly nav = inject(DemoNav);
  protected readonly demoMode = !!inject(Api).demo;
}
