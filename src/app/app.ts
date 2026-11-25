import { Component, inject } from '@angular/core';
import { Preferences } from './core/preferences';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialog } from './shell/confirm-dialog';
import { DocPreviewDialog } from './shell/doc-preview-dialog';
import { InboxToasts } from './shell/inbox-toasts';
import { ScreenNav } from './shell/screen-nav';
import { StepUpDialog } from './shell/step-up-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ScreenNav, InboxToasts, DocPreviewDialog, ConfirmDialog, StepUpDialog],
  template: `<router-outlet /><app-screen-nav /><app-inbox-toasts /><app-doc-preview-dialog /><app-confirm-dialog /><app-step-up-dialog />`,
})
export class App {
  /** Applies saved display preferences (theme, language) from the first render. */
  private readonly prefs = inject(Preferences);
}
