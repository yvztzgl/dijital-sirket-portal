import { ChangeDetectionStrategy, Component, model } from '@angular/core';

/**
 * The two ticks the deck upload needs (D-1a): the privacy notice acknowledged, and consent to the
 * deck, the CV and the answers on D-1a being sent to the outside evaluation service. The API records
 * both for every upload (its field names are still `noticeAcknowledged` and `aiConsent`). Never
 * pre-ticked; the parent starts them at false.
 *
 * PLACEHOLDER WORDING, to be confirmed by the owner: the legal text of the notice is not decided yet
 * and the evaluation service is not named (see docs/api-client.md), so the labels are short and
 * neutral and link to nothing.
 */
@Component({
  selector: 'app-deck-consents',
  template: `
    <fieldset class="wz-consents">
      <legend>Onaylar</legend>
      <label class="wz-check"><input type="checkbox" [checked]="notice()" (change)="notice.set($any($event.target).checked)"><span>Sunumum ve özgeçmişimle ilgili aydınlatma metnini okudum.</span></label>
      <label class="wz-check"><input type="checkbox" [checked]="ai()" (change)="ai.set($any($event.target).checked)"><span>Sunumumun, özgeçmişimin ve bu ekrandaki yanıtlarımın değerlendirme için dış bir değerlendirme hizmetine gönderilmesine onay veriyorum.</span></label>
    </fieldset>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeckConsents {
  readonly notice = model(false);
  readonly ai = model(false);
}
