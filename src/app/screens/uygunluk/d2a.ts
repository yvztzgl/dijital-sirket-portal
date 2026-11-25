import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormError } from '../../shared/form-error';
import { Icon } from '../../shared/icon';
import { QrCode } from '../../shared/qr-code';
import { StepPage } from '../../shared/step-page';
import { UygunlukData } from '../data/uygunluk.data';

/**
 * D-2a — Kimlik doğrulama. Opens on a pre-information view (what to have ready, do's and don'ts,
 * the consent tick, "Doğrulamayı başlat", or "Telefonla devam et" for a QR code that opens the step on
 * the founder's phone: see d2m); after that the camera area follows the automatic check: passport, then
 * face, then waiting.
 */
@Component({
  selector: 'app-screen-d2a',
  imports: [FormError, Icon, QrCode, StepPage],
  templateUrl: './d2a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD2a extends UygunlukData {}
