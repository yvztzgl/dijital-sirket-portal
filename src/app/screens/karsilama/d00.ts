import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HeaderTools } from '../../shared/header-tools';
import { IText } from '../../shared/icon';
import { DotEngraving } from '../../shared/dot-engraving';
import { RouterLink } from '@angular/router';
import { KarsilamaData } from '../data/karsilama.data';

/** D-00 — Karşılama. Giriş/kayıt ile aynı dil: lacivert zemin, gravür. Tek karar: başvuruya başla. */
@Component({
  selector: 'app-screen-d00',
  imports: [DotEngraving, HeaderTools, IText, RouterLink],
  templateUrl: './d00.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD00 extends KarsilamaData {}
