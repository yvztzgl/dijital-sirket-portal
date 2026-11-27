import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { SignatureData } from '@features/e-signature/e-signature.data';

/** D-4a — Görüntülü görüşme öncesi. Camera preview with device checks, one action: call the operator. */
@Component({
  selector: 'app-call-lobby-page',
  imports: [FormError, Icon, StepPage],
  templateUrl: './call-lobby.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CallLobbyPage extends SignatureData {}
