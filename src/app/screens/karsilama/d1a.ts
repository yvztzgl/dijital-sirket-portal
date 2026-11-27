import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeckConsents } from '../../shared/deck-consents';
import { DeckFormatDialog } from '../../shared/deck-format-dialog';
import { Icon } from '../../shared/icon';
import { MultiSelect } from '../../shared/multi-select';
import { FormError } from '../../shared/form-error';
import { SearchSelect } from '../../shared/search-select';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/**
 * D-1a — Sunum ve değerlendirme soruları. The deck and the CV (PDF), a short summary, the activity
 * group and activity, the business, revenue and product choices, and the two ticks; then the outside
 * evaluation starts. A notice above the form when the last evaluation ended without a result.
 */
@Component({
  selector: 'app-screen-d1a',
  imports: [DeckConsents, DeckFormatDialog, FormError, Icon, MultiSelect, RouterLink, SearchSelect, StepPage],
  templateUrl: './d1a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1a extends KarsilamaData {
  protected readonly formatOpen = signal(false);
}
