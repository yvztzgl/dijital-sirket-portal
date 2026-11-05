import { effect, Injectable, signal } from '@angular/core';

export type Lang = 'tr' | 'en';
export type Theme = 'light' | 'dark';
interface Prefs {
  theme: Theme;
  lang: Lang;
}
const KEY = 'dsp.prefs.v1';

/** Display preferences: light/dark theme and interface language. Persisted per browser. */
@Injectable({ providedIn: 'root' })
export class Preferences {
  readonly state = signal<Prefs>(load());

  constructor() {
    effect(() => {
      const p = this.state();
      localStorage.setItem(KEY, JSON.stringify(p));
      document.documentElement.classList.toggle('theme-dark', p.theme === 'dark');
      document.documentElement.lang = p.lang;
    });
  }

  toggleTheme() {
    const root = document.documentElement;
    const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate) root.classList.add('theme-switching');
    this.state.update((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }));
    if (animate) setTimeout(() => root.classList.remove('theme-switching'), 300);
  }

  setLang(lang: Lang) {
    this.state.update((p) => ({ ...p, lang }));
  }
}

function load(): Prefs {
  const base: Prefs = { theme: matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', lang: 'tr' };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { theme: saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : base.theme, lang: saved.lang ?? base.lang };
  } catch {
    return base;
  }
}
