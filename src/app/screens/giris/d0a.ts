import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HeaderTools } from '../../shared/header-tools';
import { IText, Icon } from '../../shared/icon';
import { EdevletDialog } from '../../shared/edevlet-dialog';
import { FormError } from '../../shared/form-error';
import { DotEngraving } from '../../shared/dot-engraving';
import { RouterLink } from '@angular/router';
import { GirisData } from '../data/giris.data';

/** D-0a — Giriş. Kayıtlı kurucu kaldığı adımdan devam eder. T.C. vatandaşları e-Devlet ile girer. */
@Component({
  selector: 'app-screen-d0a',
  imports: [DotEngraving, EdevletDialog, FormError, HeaderTools, IText, Icon, RouterLink],
  templateUrl: './d0a.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD0a extends GirisData {}
