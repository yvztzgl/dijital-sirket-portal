import { Select } from '../../shared/select';
import { CountrySelect } from '../../shared/country-select';
import { PhoneInput } from '../../shared/phone-input';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IText, Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { AiCard } from '../../shared/ai-card';
import { SidePanel } from '../../shared/side-panel';
import { Stepper } from '../../shared/stepper';
import { TopBar } from '../../shared/top-bar';
import { KarsilamaData } from '../data/karsilama.data';

/** D-1c — Bulunanları inceleyin. Şirket kartı açık; diğerleri tek satır özet. Rozetler: AI · Kontrol edin · Düzenlendi. */
@Component({
  selector: 'app-screen-d1c',
  imports: [AiCard, CountrySelect, FormError, IText, Icon, PhoneInput, Select, SidePanel, Stepper, TopBar],
  templateUrl: './d1c.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1c extends KarsilamaData {}
