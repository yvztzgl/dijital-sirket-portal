import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { HeaderTools } from '../../shared/header-tools';
import { IText } from '../../shared/icon';
import { EdevletDialog } from '../../shared/edevlet-dialog';
import { FormError } from '../../shared/form-error';
import { DotEngraving } from '../../shared/dot-engraving';
import { RouterLink } from '@angular/router';
import { GirisData } from '../data/giris.data';

/** D-0b — Kayıt. İlk soru yolu belirler: yabancı kurucu e-posta ile, T.C. vatandaşı e-Devlet ile devam eder. */
@Component({
  selector: 'app-screen-d0b',
  imports: [DotEngraving, EdevletDialog, FormError, HeaderTools, IText, Icon, RouterLink],
  templateUrl: './d0b.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD0b extends GirisData {}
