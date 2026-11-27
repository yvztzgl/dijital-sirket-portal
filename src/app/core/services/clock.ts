import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/** A ticking "now" signal that drives every live countdown and simulation on screen. */
@Injectable({ providedIn: 'root' })
export class Clock {
  readonly now = signal(Date.now());

  constructor() {
    const id = setInterval(() => this.now.set(Date.now()), 200);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}
