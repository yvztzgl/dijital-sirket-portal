import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { StepPage } from '@layout/step-page';
import { SignatureData } from '@features/e-signature/e-signature.data';

/** D-5b — Şirketiniz kuruldu. The four results with copy buttons, the next three things to do, the documents. */
@Component({
  selector: 'app-setup-complete-page',
  imports: [Icon, StepPage],
  templateUrl: './setup-complete.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupCompletePage extends SignatureData {}
