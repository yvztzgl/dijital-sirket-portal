import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { followFlow } from '@core/flow/follow';
import { FundingSource } from '@core/models/models';
import { ApplicationStore } from '@core/state/application.store';
import { CountrySelect } from '@ui/country-select';
import { FormError } from '@layout/form-error';
import { Icon } from '@ui/icon';
import { MultiSelect } from '@ui/multi-select';
import { PhoneInput } from '@ui/phone-input';
import { Select } from '@ui/select';
import { StepPage } from '@layout/step-page';
import { fundingOptions } from '../../funding-options';
import { ProfileDraft, profileDraft, profileNaceOptions, profileReady, SAMPLE_PROFILE } from '../../profile.rules';

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
export class ProfileFormPage {
  protected readonly store = inject(ApplicationStore);
  private readonly router = inject(Router);

  constructor() {
    this.store.clearError();
    followFlow();
    // The choices offered here are the API's own list (Api.reference).
    void this.store.loadReference();
    // Not shown here: read now so D-1a's limits and choices are there when it opens.
    void this.store.loadEvaluationReference();
  }

  protected readonly profileNaceOptions = computed(() => profileNaceOptions(this.store.reference()));
  protected readonly fundingOptions = computed(() => fundingOptions(this.store.reference()));
  protected readonly founderName = computed(() => {
    const a = this.store.app();
    return a ? `${a.founder.firstName} ${a.founder.lastName}`.trim() : '';
  });
  /** True when the founder came back to change a profile they saved before. */
  protected readonly profileSaved = computed(() => !!this.store.app()?.profile);
  /** Starts from what was saved before, when the founder comes back to change it (read once, when the page opens). */
  protected readonly profileDraft = signal<ProfileDraft>(profileDraft(this.store.app()?.profile));
  protected readonly profileReady = computed(() => profileReady(this.profileDraft()));

  /** A refusal's message for one field, under the API's field name (only HTTP mode names fields). */
  protected fieldError(key: string): string | null {
    return this.store.fieldErrors()[key]?.[0] ?? null;
  }

  protected setProfile(key: Exclude<keyof ProfileDraft, 'naceCodes'>, value: string) {
    this.profileDraft.update((p) => ({ ...p, [key]: value }));
  }

  protected setProfileNace(codes: string[]) {
    this.profileDraft.update((p) => ({ ...p, naceCodes: codes }));
  }

  /** Saving moves the stage to `verified`, which this screen also shows, so the move to D-1a is made here. */
  protected async submitProfile() {
    const p = this.profileDraft();
    if (!p.naceCodes.length || !p.funding) return;
    if (await this.store.submitProfile({ ...p, funding: p.funding as FundingSource })) void this.router.navigateByUrl('/deck');
  }

  /** Demo: values for the downloadable sample deck (Lumora Analytics). */
  protected useSampleProfile() {
    this.profileDraft.set({ ...SAMPLE_PROFILE, naceCodes: [...SAMPLE_PROFILE.naceCodes] });
  }
}
