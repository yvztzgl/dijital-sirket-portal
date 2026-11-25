import { Select } from '../../shared/select';
import { CountrySelect } from '../../shared/country-select';
import { PhoneInput } from '../../shared/phone-input';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Icon } from '../../shared/icon';
import { FormError } from '../../shared/form-error';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/**
 * D-1c — Şirket formu. After the outside evaluation the founder fills the company's details
 * themselves: the brand from the profile on top, then every value as a flat row with a pencil.
 * Values taken from the profile or the account carry a quiet "Ön bilgilerinizden"; the title and the
 * NACE codes start empty.
 */
@Component({
  selector: 'app-screen-d1c',
  imports: [CountrySelect, FormError, Icon, PhoneInput, Select, StepPage],
  templateUrl: './d1c.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1c extends KarsilamaData {}
