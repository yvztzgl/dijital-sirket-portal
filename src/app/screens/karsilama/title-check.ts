import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { DemoBar } from '../../shell/demo-bar';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/**
 * D-1f — Unvan kontrol ediliyor (stage `titleChecking`). Nothing is asked: the trade name waits for
 * staff (MERSİS has no endpoint yet), which can take hours. A status page, not a spinner: what is
 * done, what is waiting, and that the founder may close the page. In HTTP mode the store polls the
 * status read and the page moves on by itself; in the mock a short simulated check ends it.
 */
@Component({
  selector: 'app-screen-title-check',
  imports: [DemoBar, Icon, StepPage],
  templateUrl: './title-check.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenTitleCheck extends KarsilamaData {}
