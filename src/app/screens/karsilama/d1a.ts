import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { DeckFormatDialog } from '../../shared/deck-format-dialog';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/** D-1a — Sunum yükleme. One request (the deck file), the upload area, what happens after it, and the deck format dialog. */
@Component({
  selector: 'app-screen-d1a',
  imports: [DeckFormatDialog, FormError, Icon, StepPage],
  templateUrl: './d1a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1a extends KarsilamaData {
  protected readonly formatOpen = signal(false);
}
