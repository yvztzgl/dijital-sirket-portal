import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/** D-1b — Sunum okunuyor. The page being read (with the company's logo once found) beside the list of fields as they arrive. */
@Component({
  selector: 'app-screen-d1b',
  imports: [Icon, StepPage],
  templateUrl: './d1b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1b extends KarsilamaData {}
