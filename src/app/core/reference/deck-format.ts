import data from './deck-format.json';

/**
 * The Terminal Şirket deck format: the pages a founder's pitch deck must contain, in order, and
 * what Terminal AI reads from each. It replaces the integrator's application form ("Akış 1
 * Değerlendirme Başvurusu": Başvuran, Girişim, İş Modeli, Sunum): those answers are written in the
 * deck instead of typed into a form. Consents are not in the deck; they are given on screen.
 *
 * The data lives in deck-format.json so that tools/sample-deck/build.py builds the sample deck
 * from the same titles and values the dialog shows.
 */
export interface DeckField {
  label: string;
  /** Required or not, length limit, allowed values. */
  rule: string;
  /** The value in the sample deck (Lumora Analytics). */
  sample: string;
  /** What the value is used for. */
  use: string;
}

export interface DeckSlide {
  no: number;
  title: string;
  purpose: string;
  fields: DeckField[];
}

export interface DeckFormat {
  version: string;
  name: string;
  sample: { company: string; pptx: string; pdf: string; thumbs: string };
  rules: { title: string; text: string }[];
  notFromDeck: { title: string; text: string }[];
  groups: { title: string; slides: DeckSlide[] }[];
}

export const DECK_FORMAT: DeckFormat = data;
export const DECK_SLIDES: DeckSlide[] = DECK_FORMAT.groups.flatMap((g) => g.slides);

/** Picture of a sample-deck page, made by tools/sample-deck/build.py. */
export function slideThumb(no: number) {
  return `${DECK_FORMAT.sample.thumbs}/${String(no).padStart(2, '0')}.webp`;
}
