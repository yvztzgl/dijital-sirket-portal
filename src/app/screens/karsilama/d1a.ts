import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeckConsents } from '../../shared/deck-consents';
import { DeckFormatDialog } from '../../shared/deck-format-dialog';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/**
 * D-1a — Sunum yükleme. One request (the deck file): the two ticks the upload needs, the upload
 * area, what happens after it, the deck format dialog, and the way back to the profile form.
 */
@Component({
  selector: 'app-screen-d1a',
  imports: [DeckConsents, DeckFormatDialog, FormError, Icon, RouterLink, StepPage],
  templateUrl: './d1a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1a extends KarsilamaData {
  protected readonly formatOpen = signal(false);
}
