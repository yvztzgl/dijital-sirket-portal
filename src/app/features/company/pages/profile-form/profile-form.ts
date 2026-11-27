import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CountrySelect } from '@ui/country-select';
import { FormError } from '@layout/form-error';
import { Icon } from '@ui/icon';
import { MultiSelect } from '@ui/multi-select';
import { PhoneInput } from '@ui/phone-input';
import { Select } from '@ui/select';
import { StepPage } from '@layout/step-page';
import { CompanyData } from '@features/company/company.data';

/**
 * D-1e — Ön bilgiler. Step 1's first screen: before the deck is uploaded the founder states the
 * company's name, activity area and capital source, and their nationality, country and phone.
 * After the scan these are compared with what the deck says (D-1c, "Ön bilgilerle karşılaştırma").
 * D-1a links back here until a deck is uploaded.
 */
@Component({
  selector: 'app-profile-form-page',
  imports: [CountrySelect, FormError, Icon, MultiSelect, PhoneInput, RouterLink, Select, StepPage],
  templateUrl: './profile-form.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileFormPage extends CompanyData {}
