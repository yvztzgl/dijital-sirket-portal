import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CountrySelect } from '../../shared/country-select';
import { FormError } from '../../shared/form-error';
import { Icon } from '../../shared/icon';
import { PhoneInput } from '../../shared/phone-input';
import { Select } from '../../shared/select';
import { StepPage } from '../../shared/step-page';
import { KarsilamaData } from '../data/karsilama.data';

/**
 * D-1e — Ön bilgiler. Step 1's first screen: before the deck is uploaded the founder states the
 * company's name, activity area and capital source, and their nationality, country and phone.
 * After the scan these are compared with what the deck says (D-1c, "Ön bilgilerle karşılaştırma").
 * D-1a links back here until a deck is uploaded.
 */
@Component({
  selector: 'app-screen-d1e',
  imports: [CountrySelect, FormError, Icon, PhoneInput, RouterLink, Select, StepPage],
  templateUrl: './d1e.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenD1e extends KarsilamaData {}
