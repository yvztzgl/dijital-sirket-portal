import { Select } from '../../shared/select';
import { CountrySelect } from '../../shared/country-select';
import { PhoneInput } from '../../shared/phone-input';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/** D-1c — Okunan bilgileri kontrol. The company's logo and name, every value as a flat row with a pencil, and a block for the values the scan flagged. */
@Component({
  selector: 'app-screen-d1c',
  imports: [CountrySelect, FormError, Icon, PhoneInput, Select, StepPage],
  templateUrl: './d1c.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1c extends KarsilamaData {}
