import { Injectable, signal } from '@angular/core';
import { DocItem } from './models';

/** Opens the in-app document preview dialog (rendered once by the app shell). */
@Injectable({ providedIn: 'root' })
export class DocPreview {
  /** Document currently shown, or null when the dialog is closed. */
  readonly current = signal<DocItem | null>(null);
  /** Element to give focus back to when the dialog closes. */
  returnFocus: HTMLElement | null = null;

  open(doc: DocItem) {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.current.set(doc);
  }

  close() {
    this.current.set(null);
    this.returnFocus?.focus?.();
    this.returnFocus = null;
  }
}
