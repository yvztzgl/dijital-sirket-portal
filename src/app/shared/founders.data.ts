/**
 * Founders shown on the landing globe (D-00). Demo data: the people and companies are made up.
 * Photos in `public/assets/founders/` are AI-generated (Higgsfield Soul 2): they show no real person,
 * so no one is shown "endorsing" a company they never founded. Replace with real founders (with their
 * consent) before launch. `photo` is optional; without it the card shows initials.
 */
export interface GlobeFounder {
  name: string;
  company: string;
  city: string;
  /** ISO 3166-1 alpha-2, used for the flag. */
  iso: string;
  lat: number;
  lon: number;
  photo?: string;
}

/** Where every arc lands: Terminal İstanbul. */
export const GLOBE_TARGET = { lat: 41.01, lon: 28.98 };

export const GLOBE_FOUNDERS: GlobeFounder[] = [
  { name: 'Sofia Martins', company: 'Verdea Foods A.Ş.', city: 'Lizbon', iso: 'pt', lat: 38.72, lon: -9.14, photo: '/assets/founders/sofia-martins.jpg' },
  { name: 'Olivia Bennett', company: 'Hearth Studio A.Ş.', city: 'Londra', iso: 'gb', lat: 51.51, lon: -0.13, photo: '/assets/founders/olivia-bennett.jpg' },
  { name: 'Noah Svensson', company: 'Fjord Data A.Ş.', city: 'Stockholm', iso: 'se', lat: 59.33, lon: 18.07, photo: '/assets/founders/noah-svensson.jpg' },
  { name: 'Aisha Rahman', company: 'Medly Health A.Ş.', city: 'Dubai', iso: 'ae', lat: 25.2, lon: 55.27, photo: '/assets/founders/aisha-rahman.jpg' },
  { name: 'Ethan Brooks', company: 'Brightline Labs A.Ş.', city: 'Nairobi', iso: 'ke', lat: -1.29, lon: 36.82, photo: '/assets/founders/ethan-brooks.jpg' },
];
