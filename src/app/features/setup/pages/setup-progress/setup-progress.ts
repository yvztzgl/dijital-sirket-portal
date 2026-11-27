import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '@ui/icon';
import { DemoBar } from '@demo/demo-bar';
import { StepPage } from '@layout/step-page';
import { SignatureData } from '@features/e-signature/e-signature.data';

/** D-5a — Şirketiniz kuruluyor. Nothing is asked: a status card with the agency steps and their state. */
@Component({
  selector: 'app-setup-progress-page',
  imports: [DemoBar, IText, Icon, StepPage],
  templateUrl: './setup-progress.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupProgressPage extends SignatureData {}
