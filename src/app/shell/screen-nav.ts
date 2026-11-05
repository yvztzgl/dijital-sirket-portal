import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DemoNav } from './demo-nav';
import { ScreenPill } from './screen-pill';

/**
 * Floating fallback for the prototype screen navigator. Every page header carries the pill
 * (see HeaderTools); this one appears only on pages without a header, such as /screens.
 */
@Component({
  selector: 'app-screen-nav',
  imports: [ScreenPill],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (!nav.docked()) {<app-screen-pill floating />}`,
})
export class ScreenNav {
  protected readonly nav = inject(DemoNav);
}
