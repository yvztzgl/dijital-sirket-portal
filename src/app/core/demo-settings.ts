import { effect, Injectable, signal } from '@angular/core';

export type Speed = 1 | 4 | 1000;

interface DemoState {
  speed: Speed;
  forceConflict: boolean;
  forceManual: boolean;
}

const KEY = 'dsp.demo.v1';

/** Prototype-only switches: simulation speed and forced scenarios. Persisted per browser. */
@Injectable({ providedIn: 'root' })
export class DemoSettings {
  readonly state = signal<DemoState>(load());

  constructor() {
    effect(() => localStorage.setItem(KEY, JSON.stringify(this.state())));
  }

  speed = () => this.state().speed;
  set(patch: Partial<DemoState>) {
    this.state.update((s) => ({ ...s, ...patch }));
  }
}

function load(): DemoState {
  const base: DemoState = { speed: 1, forceConflict: false, forceManual: false };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return base;
  }
}
