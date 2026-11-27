import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormError } from '@layout/form-error';
import { Icon } from '@ui/icon';
import { QrCode } from '@ui/qr-code';
import { StepPage } from '@layout/step-page';
import { EligibilityData } from '@features/eligibility/eligibility.data';

/**
 * D-2a — Kimlik doğrulama. Opens on a pre-information view (what to have ready, do's and don'ts,
 * the consent tick, "Doğrulamayı başlat", or "Telefonla devam et" for a QR code that opens the step on
 * the founder's phone: see d2m); after that the camera area follows the automatic check: passport, then
 * face, then waiting.
 */
@Component({
  selector: 'app-identity-check-page',
  imports: [FormError, Icon, QrCode, StepPage],
  templateUrl: './identity-check.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IdentityCheckPage extends EligibilityData {}
