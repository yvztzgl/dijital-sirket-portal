import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { DemoBar } from '@demo/demo-bar';
import { StepPage } from '@layout/step-page';
import { CompanyData } from '@features/company/company.data';

/**
 * D-1f — Unvan kontrol ediliyor (stage `titleChecking`). Nothing is asked: the trade name waits for
 * staff (MERSİS has no endpoint yet), which can take hours. A status page, not a spinner: what is
 * done, what is waiting, and that the founder may close the page. In HTTP mode the store polls the
 * status read and the page moves on by itself; in the mock a short simulated check ends it.
 */
@Component({
  selector: 'app-title-check-page',
  imports: [DemoBar, Icon, StepPage],
  templateUrl: './title-check.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TitleCheckPage extends CompanyData {}
