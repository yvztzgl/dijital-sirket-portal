import { Component, inject } from '@angular/core';
import { Preferences } from '@core/services/preferences';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialog } from '@layout/dialogs/confirm-dialog';
import { DocPreviewDialog } from '@layout/dialogs/doc-preview-dialog';
import { InboxToasts } from '@layout/dialogs/inbox-toasts';
import { ScreenNav } from '@demo/screen-nav';
import { StepUpDialog } from '@layout/dialogs/step-up-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ScreenNav, InboxToasts, DocPreviewDialog, ConfirmDialog, StepUpDialog],
  template: `<router-outlet /><app-screen-nav /><app-inbox-toasts /><app-doc-preview-dialog /><app-confirm-dialog /><app-step-up-dialog />`,
})
export class App {
  /** Applies saved display preferences (theme, language) from the first render. */
  private readonly prefs = inject(Preferences);
}
