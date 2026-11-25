import { ChangeDetectionStrategy, Component, model } from '@angular/core';

/**
 * The two ticks the deck upload needs (D-1a, and the re-upload on D-1c): the privacy notice
 * acknowledged and consent to the deck being processed by AI. The API records both for every
 * upload. Never pre-ticked; the parent starts them at false.
 *
 * Wording to be confirmed: the legal text of the notice is not decided yet (see
 * docs/api-client.md), so the labels are kept short and neutral and link to nothing.
 */
@Component({
  selector: 'app-deck-consents',
  template: `
    <fieldset class="wz-consents">
      <legend>Sunumunuz için onaylar</legend>
      <label class="wz-check"><input type="checkbox" [checked]="notice()" (change)="notice.set($any($event.target).checked)"><span>Sunumumla ilgili aydınlatma metnini okudum.</span></label>
      <label class="wz-check"><input type="checkbox" [checked]="ai()" (change)="ai.set($any($event.target).checked)"><span>Sunumumun yapay zekâ ile işlenmesine onay veriyorum.</span></label>
    </fieldset>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckConsents {
  readonly notice = model(false);
  readonly ai = model(false);
}
