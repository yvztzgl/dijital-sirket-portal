import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Api } from '@core/api/api';
import { followFlow } from '@core/flow/follow';
import { FUNDING_LABELS } from '@core/models/models';
import { ApplicationStore } from '@core/state/application.store';
import { pdfBytes } from '@core/utils/files';
import { ADDRESS_DOC_MAX } from '@core/utils/rules';
import { FormError } from '@layout/form-error';
import { StepPage } from '@layout/step-page';
import { Icon } from '@ui/icon';

const fileSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);

/**
 * D-2d — Beyan. The second screen of step 2: the founder uploads a document showing the declared
 * address and confirms that the application's information is true. Nothing here runs by itself;
 * "Beyanı onayla" starts the list search (D-2e).
 */
@Component({
  selector: 'app-declaration-page',
  imports: [FormError, Icon, StepPage],
  templateUrl: './declaration.html',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeclarationPage {
  protected readonly store = inject(ApplicationStore);
  /** Mock mode only: a sample address document. */
  protected readonly demoMode = !!inject(Api).demo;

  constructor() {
    this.store.clearError();
    followFlow();
  }

  /** The address document chosen on this screen; it is sent when the declaration is confirmed. */
  private readonly addrFile = signal<File | null>(null);
  protected readonly addrError = signal<string | null>(null);
  protected readonly addrDragging = signal(false);
  protected readonly declared = signal(false);

  protected readonly declaration = computed(() => {
    const a = this.store.app();
    const f = this.addrFile();
    return {
      address: a ? [a.contact.address, `${a.contact.postalCode} ${a.contact.country}`.trim()].filter(Boolean).join(', ') : '',
      funding: a ? FUNDING_LABELS[a.funding] : '',
      file: f ? { name: f.name, size: fileSize(f.size) } : null,
      ready: !!f && this.declared(),
    };
  });

  protected onAddrInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) this.takeAddr(f);
  }

  protected onAddrDrop(e: DragEvent) {
    e.preventDefault();
    this.addrDragging.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) this.takeAddr(f);
  }

  protected onAddrDragOver(e: DragEvent) {
    e.preventDefault();
    this.addrDragging.set(true);
  }

  /** The same two checks the API makes, so the founder hears about a wrong file at once (the API also checks the bytes). */
  private takeAddr(f: File) {
    this.store.clearError();
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return this.addrError.set('Adres belgesi PDF, JPG veya PNG biçiminde olmalıdır.');
    if (f.size > ADDRESS_DOC_MAX) return this.addrError.set('Dosya 10 MB’tan büyüktür. Daha küçük bir dosya yükleyiniz.');
    this.addrError.set(null);
    this.addrFile.set(f);
  }

  /** Demo help (mock mode only), like "Test kartını doldur" on the payment screen: a one-page placeholder PDF. */
  protected useSampleAddr() {
    const bytes = pdfBytes('Adres belgesi (ornek)', ['Bu dosya Terminal Sirket demosunda uretilmis ornek bir belgedir.']);
    this.takeAddr(new File([bytes as BlobPart], 'adres-belgesi.pdf', { type: 'application/pdf' }));
  }

  protected submitDeclaration() {
    void this.store.submitDeclaration({ file: this.addrFile(), declared: this.declared() });
  }
}
