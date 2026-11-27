import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { StepPage } from '@layout/step-page';
import { SignatureData } from '@features/e-signature/e-signature.data';

/** D-4b — Görüşme sürüyor. Operator and founder side by side, the operator's words, the call's five steps. */
@Component({
  selector: 'app-call-page',
  imports: [Icon, StepPage],
  templateUrl: './call.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallPage extends SignatureData {}
