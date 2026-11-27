import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '@ui/icon';
import { HeaderTools } from '@layout/header-tools';
import { IText } from '@ui/icon';
import { EdevletDialog } from '@features/auth/components/edevlet-dialog';
import { FormError } from '@layout/form-error';
import { DotEngraving } from '@features/auth/components/dot-engraving';
import { RouterLink } from '@angular/router';
import { AuthData } from '@features/auth/auth.data';

/** D-0b — Kayıt. İlk soru yolu belirler: yabancı kurucu e-posta ile, T.C. vatandaşı e-Devlet ile devam eder. */
@Component({
  selector: 'app-register-page',
  imports: [DotEngraving, EdevletDialog, FormError, HeaderTools, IText, Icon, RouterLink],
  templateUrl: './register.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage extends AuthData {}
