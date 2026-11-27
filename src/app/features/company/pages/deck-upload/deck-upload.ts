import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeckConsents } from '@features/company/components/deck-consents';
import { DeckFormatDialog } from '@features/company/components/deck-format-dialog';
import { Icon } from '@ui/icon';
import { MultiSelect } from '@ui/multi-select';
import { FormError } from '@layout/form-error';
import { SearchSelect } from '@ui/search-select';
import { StepPage } from '@layout/step-page';
import { CompanyData } from '@features/company/company.data';

/**
 * D-1a — Sunum ve değerlendirme soruları. The deck and the CV (PDF), a short summary, the activity
 * group and activity, the business, revenue and product choices, and the two ticks; then the outside
 * evaluation starts. A notice above the form when the last evaluation ended without a result.
 */
@Component({
  selector: 'app-deck-upload-page',
  imports: [DeckConsents, DeckFormatDialog, FormError, Icon, MultiSelect, RouterLink, SearchSelect, StepPage],
  templateUrl: './deck-upload.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckUploadPage extends CompanyData {
  protected readonly formatOpen = signal(false);
}
