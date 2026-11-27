import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HeaderTools } from '@layout/header-tools';
import { IText, Icon } from '@ui/icon';
import { EdevletDialog } from '@features/auth/components/edevlet-dialog';
import { FormError } from '@layout/form-error';
import { DotEngraving } from '@features/auth/components/dot-engraving';
import { RouterLink } from '@angular/router';
import { AuthData } from '@features/auth/auth.data';

/** D-0a — Giriş. Kayıtlı kurucu kaldığı adımdan devam eder. T.C. vatandaşları e-Devlet ile girer. */
@Component({
  selector: 'app-login-page',
  imports: [DotEngraving, EdevletDialog, FormError, HeaderTools, IText, Icon, RouterLink],
  templateUrl: './login.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage extends AuthData {}
