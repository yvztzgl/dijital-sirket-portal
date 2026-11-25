import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { qrMatrix, qrPath } from '../core/qr';

/**
 * A QR code for `value`, drawn as SVG. Always black on white with its quiet zone, in the dark theme
 * too: phone cameras need the contrast.
 */
@Component({
  selector: 'app-qr-code',
  template: `
    @let q = qr();
    @if (q) {
      <svg [attr.viewBox]="'0 0 ' + q.size + ' ' + q.size" role="img" [attr.aria-label]="label()" shape-rendering="crispEdges">
        <rect [attr.width]="q.size" [attr.height]="q.size" fill="#fff" />
        <path [attr.d]="q.d" fill="#000" />
      </svg>
    }
  `,
  styles: `
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrCode {
  readonly value = input.required<string>();
  readonly label = input('QR kod');

  protected readonly qr = computed(() => {
    try {
      return qrPath(qrMatrix(this.value()));
    } catch {
      return null; // longer than the generator carries
    }
  });
}
