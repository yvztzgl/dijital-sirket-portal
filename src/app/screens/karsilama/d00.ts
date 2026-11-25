import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HeaderTools } from '../../shared/header-tools';
import { IText } from '../../shared/icon';
import { DotEngraving } from '../../shared/dot-engraving';
import { FounderGlobe } from '../../shared/founder-globe';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Arrivals } from '../../shared/arrivals';
import { KarsilamaData } from '../data/karsilama.data';

/** D-00 — Karşılama. Giriş/kayıt ile aynı dil: lacivert zemin, gravür; sağda kurucuların İstanbul’a uçtuğu dönen dünya. Tek karar: başvuruya başla. */
@Component({
  selector: 'app-screen-d00',
  imports: [Arrivals, DotEngraving, FounderGlobe, HeaderTools, IText, RouterLink],
  templateUrl: './d00.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD00 extends KarsilamaData {
  /**
   * Which hero to show while the two are being compared: the navy İstanbul skyline with arriving
   * trails (default), or the light globe with founder cards (`/?hero=globe`). Drop the loser.
   */
  protected readonly hero = signal<'istanbul' | 'globe'>(
    inject(ActivatedRoute).snapshot.queryParamMap.get('hero') === 'globe' ? 'globe' : 'istanbul',
  );
}
