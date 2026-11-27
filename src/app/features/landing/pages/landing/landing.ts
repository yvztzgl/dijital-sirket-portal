import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild, viewChildren } from '@angular/core';
import { RouterLink } from '@angular/router';
import { flagUrl } from '@core/reference/countries';
import { FEE_TOTAL, FEES } from '@core/models/models';
import { GLOBE_FOUNDERS } from '@features/landing/founders.data';
import { GLOBE_LAND, GLOBE_N, GLOBE_TURKEY } from '@features/landing/globe-data';
import { HeaderTools } from '@layout/header-tools';
import { Icon, IText } from '@ui/icon';
import { CompanyData } from '@features/company/company.data';

/** Turkish lira with two decimals, as on the payment screen. */
const tl = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';

/** The flat map: plain latitude/longitude, cropped above and below the inhabited world. */
const MAP = { lon: [-180, 180], lat: [-58, 80] } as const;
const MAP_RATIO = (MAP.lon[1] - MAP.lon[0]) / (MAP.lat[1] - MAP.lat[0]);
const toUV = (lat: number, lon: number): [number, number] => [
  (lon - MAP.lon[0]) / (MAP.lon[1] - MAP.lon[0]),
  (MAP.lat[1] - lat) / (MAP.lat[1] - MAP.lat[0]),
];
const ISTANBUL = toUV(41.01, 28.98);

/** Other cities an arc starts from, besides the founders' own (which carry a card). */
const OTHER_CITIES = [
  [52.52, 13.4], [40.71, -74.0], [43.65, -79.38], [-23.55, -46.63], [6.52, 3.38], [19.08, 72.88],
  [1.35, 103.82], [37.57, 126.98], [35.68, 139.69], [-33.87, 151.21], [-33.92, 18.42],
];
/**
 * Every arc's starting point, in launch order. A founder (demo data, see founders.data.ts) goes
 * first in each group of three, so two founder cards are never on the map at the same time.
 */
const ORIGINS: { uv: [number, number]; founder: number }[] = (() => {
  const cities = OTHER_CITIES.map(([lat, lon]) => ({ uv: toUV(lat, lon), founder: -1 }));
  const out: { uv: [number, number]; founder: number }[] = [];
  GLOBE_FOUNDERS.forEach((f, i) => out.push({ uv: toUV(f.lat, f.lon), founder: i }, ...cities.splice(0, 2)));
  return [...out, ...cities];
})();

/**
 * The figures under the hero's button. Two of them are SAMPLE values put in to judge the design:
 * the platform has not launched, so nobody has measured an average formation time, and which
 * countries may apply is a policy decision that has not been written down. Replace both with
 * real, sourced numbers (or drop them) before this page is public. The other two follow from the
 * product itself: the number of steps and that nothing happens in person.
 */
const FIGURES: { icon: string; value: string; label: string; sample?: true }[] = [
  { icon: 'globe', value: '190+', label: 'ülkeden başvuru', sample: true },
  { icon: 'clock', value: '3 gün', label: 'ortalama kuruluş', sample: true },
  { icon: 'list-checks', value: '5', label: 'adımlık başvuru' },
  { icon: 'laptop', value: '%100', label: 'çevrim içi' },
];

/**
 * One arc's life, in seconds. Deliberately slow and soft: a new one leaves every `gap`, so only
 * one or two are in the air, and it lands with a faint glow, not a ring.
 */
const ARC = { gap: 2.4, start: 0.6, fly: 3.4, tail: 1.2, land: 4, glow: 1.4, out: 6.2, fade: 0.8 };

/**
 * The story, one step per screen of scrolling. Sample data matches the app's demo account.
 * Each step shows one picture and one piece of the real screen at its real size:
 *   `pic`  the step's picture, in the flat style of the wizard's illustrations. Until the
 *          landing set is generated (prompt in art/README.md, "Landing steps"), the matching
 *          wizard pictures stand in.
 *   `bg`   the picture's own background colour, which the whole panel takes on
 */
const STEPS = [
  {
    key: 'deck', pic: '/assets/illustrations/upload-read.webp', bg: '#E8EFFD',
    title: 'Sunumunuzu yükleyin',
    text: 'Yatırımcı sunumunuz yeterli. Terminal AI şirket ve kurucu bilgilerini okur; siz yalnızca kontrol edersiniz.',
  },
  {
    key: 'id', pic: '/assets/illustrations/id-camera.webp', bg: '#D4E2FD',
    title: 'Kimliğinizi doğrulayın',
    text: 'Pasaportunuz ve kameranız yeterlidir. Kimlik ve uygunluk kontrolleri birkaç dakikada tamamlanır.',
  },
  {
    key: 'pay', pic: '/assets/illustrations/next-bank.webp', bg: '#D3E0FE',
    title: 'Tek ödeme yapın',
    text: 'Kuruluştaki tüm kurum harç ve ücretleri tek seferde, kartınızla ödenir.',
  },
  {
    key: 'sign', pic: '/assets/illustrations/call-show.webp', bg: '#D4E2FD',
    title: 'Görüntülü görüşmeyle e-imza alın',
    text: 'Lisanslı sağlayıcının operatörüyle birkaç dakika görüşürsünüz. Kuruluş belgeleriniz bu imzayla imzalanır.',
  },
  {
    key: 'setup', pic: '/assets/illustrations/building.webp', bg: '#F0F3FD',
    title: 'Şirketiniz kurulur',
    text: 'Ticaret sicili tescili, vergi kaydı, banka hesabı ve e-fatura kaydı sizin adınıza tamamlanır.',
  },
] as const;
/**
 * Heights in building.webp, % from the top: the ground line, then the slab above each of the six
 * floors (the last is the top, so the roof comes with the sixth). The same numbers as D-5a's
 * `BUILDING.levels` in e-signature.data.ts; measure again if the picture is replaced.
 */
const BUILDING_LEVELS = [97.9, 79.9, 66.4, 52.6, 38.2, 23.2, 0];
/** What the screen pieces show. Sample values match the app's demo account. */
const MOCK = {
  fields: [
    ['Şirket unvanı', 'Acme Cloud', 1], ['Faaliyet alanı', '62.10.00 Yazılım', 7], ['Sermaye', '250.000 TL', 9],
    ['Fon kaynağı', 'Yurt dışı banka transferi', 10], ['Kurucu', 'John Doe, Birleşik Krallık', 11],
  ],
  checks: [
    ['Kimlik doğrulama', 'Pasaport ve canlılık kontrolü', 'Eşleşme %97,6'],
    ['Beyan', 'Adres belgesi ve doğruluk beyanı', 'Onaylandı'],
    ['Liste taraması', 'BM, AB, OFAC ve ulusal listeler', 'Eşleşme yok'],
  ],
  fees: FEES.map((f) => [f.label, tl(f.amount)] as const),
  total: tl(FEE_TOTAL),
  call: ['Pasaport kameraya gösterildi', 'Yüz eşleşmesi onaylandı', 'Sözlü onay alındı', 'Görüşme kaydı imzalandı', 'e-İmza düzenlendi'],
  agencies: [
    ['Ticaret sicili tescili', 'Gebze Ticaret Odası'], ['Vergi kaydı', 'Gelir İdaresi'], ['Mali mühür', 'TÜBİTAK Kamu SM'],
    ['Banka hesabı', 'Halkbank'], ['e-Fatura ve SGK', 'GİB, SGK'], ['Mali müşavir', 'Terminal İstanbul'],
  ],
} as const;

/**
 * Scroll script, in screen heights. Nothing waits for the stage to reach the top of the window:
 * it starts growing with the first pixel scrolled and is window-sized by the time it is pinned,
 * and the dive starts `lead` of the way through that approach (0.8: just before it is pinned, once
 * the headline has mostly left; 0.4 felt too eager, waiting for the pin felt late).
 *   zoom  how much pinned scrolling the dive takes after that
 *   open  the last part of the dive, during which the İstanbul point opens
 *   step  the scrolling each story step gets
 *   hold  a little rest on the last step before the page moves on
 */
const AT = { lead: 0.8, zoom: 1.3, open: 0.45, step: 0.85, hold: 0.3 } as const;
const END = AT.zoom + STEPS.length * AT.step + AT.hold;
/** How far the view goes into the map by the end of the zoom. */
const ZOOM_MAX = 70;

const RED = '#ED1C2C';
/** Canvas colours per theme (the page itself uses the CSS tokens). */
const INK = {
  light: { land: '6, 18, 98', landA: 0.36, arc: '12, 33, 126', head: '#061262', ring: '#FFFFFF' },
  dark: { land: '214, 224, 255', landA: 0.5, arc: '255, 255, 255', head: '#FFFFFF', ring: '#FFFFFF' },
};

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const span = (v: number, [a, b]: readonly [number, number]) => clamp((v - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Land points of the Fibonacci sphere in globe-data.ts, as [u, v, depth] triples on the flat map. */
function flatten(encoded: string): Float32Array {
  const G = Math.PI * (3 - Math.sqrt(5));
  const out: number[] = [];
  let i = -1;
  for (const d of encoded.split(',')) {
    i += parseInt(d, 36);
    const y = 1 - (2 * (i + 0.5)) / GLOBE_N, r = Math.sqrt(1 - y * y), th = G * i;
    const lat = (Math.asin(y) * 180) / Math.PI, lon = (Math.atan2(Math.sin(th) * r, Math.cos(th) * r) * 180) / Math.PI;
    if (lat < MAP.lat[0] || lat > MAP.lat[1]) continue;
    const [u, v] = toUV(lat, lon);
    // A steady pseudo-random depth per dot: during the zoom nearer dots pass faster.
    const h = Math.sin(i * 127.1) * 43758.5453;
    out.push(u, v, h - Math.floor(h));
  }
  return new Float32Array(out);
}

/**
 * D-00 — Karşılama, rebuilt from an empty page (owner's direction, 2026-11-16).
 *
 * Headline and description, then a stage with a flat dotted world map: lights arc from cities
 * everywhere to İstanbul. Scrolling pins the stage: it grows to the full window, the view dives
 * into the map towards İstanbul while the dots fly past, the İstanbul point opens, and inside it
 * the five steps play (redesigned 2026-11-19): the five steps listed on the left, the one on screen
 * open with its text; on the right one picture and one piece of the real screen at its real size. Under prefers-reduced-motion nothing is pinned:
 * the map is a still picture and the five steps are an ordinary page.
 */
@Component({
  selector: 'app-landing-page',
  imports: [HeaderTools, Icon, IText, RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  host: { style: 'display:block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage extends CompanyData {
  protected readonly steps = STEPS;
  protected readonly mock = MOCK;
  /** Founders shown on the map with a card (demo people; see founders.data.ts). */
  protected readonly founders = GLOBE_FOUNDERS;
  protected readonly flag = flagUrl;
  /** The hero's figures (two are sample values; see FIGURES). */
  protected readonly figures = FIGURES;
  /** The step on screen: the list on the left marks it and shows its text. */
  protected readonly now = signal(0);
  /** No pinning or scroll animation: the visitor asked for reduced motion. */
  protected readonly still = signal(matchMedia('(prefers-reduced-motion: reduce)').matches);
  /** Track height in screen heights: the script plus the screen that stays pinned. */
  protected readonly trackHeight = `${(END + 1) * 100}`;

  private readonly destroyRef = inject(DestroyRef);
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly pin = viewChild.required<ElementRef<HTMLElement>>('pin');
  private readonly card = viewChild.required<ElementRef<HTMLElement>>('card');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('map');
  private readonly white = viewChild.required<ElementRef<HTMLElement>>('white');
  private readonly founderCards = viewChildren<ElementRef<HTMLElement>>('founder');
  private readonly place = viewChild.required<ElementRef<HTMLElement>>('place');

  private readonly land = flatten(GLOBE_LAND);
  private readonly turkey = flatten(GLOBE_TURKEY);
  private frame = 0;
  private onScreen = true;
  /** The map at rest, drawn once per size and theme, so the idle loop only adds the arcs. */
  private rest?: { key: string; image: HTMLCanvasElement };

  constructor() {
    super();
    afterNextRender(() => this.watch());
  }

  /** Scrolls to the point in the story where step i is on screen and its small animations have run. */
  protected goTo(i: number) {
    const vh = this.pin().nativeElement.clientHeight;
    const top = this.track().nativeElement.getBoundingClientRect().top + scrollY;
    const s = AT.zoom + (i + 0.62) * AT.step;
    scrollTo({ top: top + s * vh, behavior: this.still() ? 'auto' : 'smooth' });
  }

  private watch() {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const queue = () => {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame((now) => this.render(now));
    };
    const onMotion = () => { this.still.set(motion.matches); queue(); };

    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    motion.addEventListener('change', onMotion);
    // The theme toggle recolours the canvas.
    const theme = new MutationObserver(queue);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const seen = new IntersectionObserver(([e]) => { this.onScreen = e.isIntersecting; if (this.onScreen) queue(); });
    seen.observe(this.pin().nativeElement);
    queue();

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.frame);
      removeEventListener('scroll', queue);
      removeEventListener('resize', queue);
      motion.removeEventListener('change', onMotion);
      theme.disconnect();
      seen.disconnect();
    });
  }

  /** Places everything for the current scroll position; keeps running while the arcs are in view. */
  private render(now: number) {
    const pin = this.pin().nativeElement;
    const white = this.white().nativeElement;
    const articles = white.querySelectorAll<HTMLElement>('article.step');
    const still = this.still();

    if (still) {
      pin.style.removeProperty('--e');
      white.style.visibility = '';
      white.style.clipPath = '';
      articles.forEach((el, i) => { el.style.opacity = ''; el.style.visibility = ''; el.style.setProperty('--t', '1'); this.build(el, i, 1); });
      this.drawMap(0, 0, now, true, true);
      return;
    }

    const vh = pin.clientHeight, vw = pin.clientWidth;
    const top = this.track().nativeElement.getBoundingClientRect().top;
    // The approach: from the top of the page until the stage is pinned (0–1), then pinned scrolling.
    const lead = Math.max(0.15, (top + scrollY) / vh);
    const near = top <= 0 ? 1 : clamp(1 - top / (lead * vh));
    const s = clamp(-top / vh, 0, END);
    const v = near * lead + s;
    // Grows from the first pixel, easing in and out over the approach.
    pin.style.setProperty('--e', ease(near).toFixed(4));

    const zoomEnd = lead + AT.zoom;
    const open = span(v, [zoomEnd - AT.open, zoomEnd]);
    const focus = this.drawMap(span(v, [lead * AT.lead, zoomEnd]), open, now, false, near === 0);

    // The İstanbul point opens into the page the story plays on.
    white.style.visibility = open > 0 ? 'visible' : 'hidden';
    white.style.clipPath = open >= 1 ? 'none' : `circle(${focus.hole}px at ${focus.x}px ${focus.y}px)`;
    pin.style.setProperty('--settle', clamp((open - 0.45) / 0.45).toFixed(4));

    // Story: each step fades in over the one before it. --t runs its small animations, which
    // begin just after the step arrives and are done about halfway through it.
    const story = (s - AT.zoom) / AT.step;
    pin.style.setProperty('--step', clamp(story, 0, STEPS.length - 0.001).toFixed(4));
    const last = STEPS.length - 1;
    const on = clamp(Math.floor(story + 0.25), 0, last);
    if (this.now() !== on) this.now.set(on);
    articles.forEach((el, i) => {
      const shown = i === 0 ? 1 : clamp((story - i + 0.25) * 6);
      el.style.opacity = shown.toFixed(3);
      el.style.visibility = shown > 0 ? 'visible' : 'hidden';
      const t = clamp((story - i + 0.08) / 0.55);
      el.style.setProperty('--t', t.toFixed(4));
      this.build(el, i, t);
    });

    // The arcs move on their own, so keep drawing while the map is what the visitor sees.
    if (this.onScreen && open < 1 && vw > 0) this.frame = requestAnimationFrame((t) => this.render(t));
  }

  /**
   * The last step's building (D-5a's picture): how high it stands at step progress t. Its six
   * floors finish exactly when the six agency rows tick (row j at 0.1 + j × 0.11 + 0.11), each
   * rising from its floor line to the slab above it.
   */
  private build(el: HTMLElement, i: number, t: number) {
    if (STEPS[i].key !== 'setup') return;
    const p = clamp((t - 0.1) / 0.66) * 6;
    const f = Math.min(5, Math.floor(p));
    const top = p >= 6 ? BUILDING_LEVELS[6] : lerp(BUILDING_LEVELS[f], BUILDING_LEVELS[f + 1], p - f);
    el.style.setProperty('--built', `${top.toFixed(2)}%`);
  }

  /**
   * Draws the map for zoom progress z (0–1) and returns where İstanbul is on screen and how big
   * the opening at it should be (`open` 0–1). `resting`: nothing has been scrolled yet, so the
   * dots can come from the cached picture.
   */
  private drawMap(z: number, open: number, now: number, still: boolean, resting: boolean) {
    const canvas = this.canvas().nativeElement;
    const pinBox = this.pin().nativeElement.getBoundingClientRect();
    const cardBox = this.card().nativeElement.getBoundingClientRect();
    // The canvas is as big as the window (so it need not be resized while the card grows) and
    // shifted so its corner sits on the pin's corner; the card clips it. Still pages use the card.
    const box = still ? cardBox : pinBox;
    const W = box.width, H = box.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }
    canvas.style.left = `${box.left - cardBox.left}px`;
    const ctx = canvas.getContext('2d');
    const none = { x: W / 2, y: H / 2, hole: 0 };
    if (!ctx || W < 2) return none;

    const dark = document.documentElement.classList.contains('theme-dark');
    const ink = dark ? INK.dark : INK.light;

    // The map at rest: as wide as the card allows, but never so small that it is a thin strip;
    // when it is wider than the card it is centred on İstanbul.
    const card = { x: cardBox.left - box.left, w: cardBox.width, h: cardBox.height };
    const pad = Math.min(36, card.w * 0.05);
    const mapW = Math.max(card.w - pad * 2, card.h * 0.66 * MAP_RATIO), mapH = mapW / MAP_RATIO;
    const fits = mapW <= card.w - pad * 2 + 1;
    const x0 = fits ? card.x + (card.w - mapW) / 2 : clamp(card.x + card.w / 2 - ISTANBUL[0] * mapW, card.x + card.w - pad - mapW, card.x + pad);
    const y0 = (card.h - mapH) / 2;
    const home = { x: x0 + ISTANBUL[0] * mapW, y: y0 + ISTANBUL[1] * mapH };

    // The dive: the scale grows exponentially and İstanbul slides to the middle of the window.
    // No ease-in: the scale is exponential already, and a slow start reads as a delay.
    const zz = z;
    const scale = Math.exp(zz * Math.log(ZOOM_MAX));
    const slide = ease(clamp(z * 1.8));
    const at = { x: lerp(home.x, W / 2, slide), y: lerp(home.y, H / 2, slide) };
    const place = (u: number, v: number, depth: number) => {
      const k = Math.pow(scale, 1 + (depth - 0.5) * 0.4);
      return { x: at.x + (u - ISTANBUL[0]) * mapW * k, y: at.y + (v - ISTANBUL[1]) * mapH * k, k };
    };
    const dot = clamp(mapW / 1100, 0.75, 1.5) * 1.12;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const drawDots = (g: CanvasRenderingContext2D, pts: Float32Array, rgb: string, alpha: number, grow: number) => {
      // Small dots share one path; the few large ones near the end fade as they pass.
      g.fillStyle = `rgba(${rgb}, ${alpha})`;
      g.beginPath();
      const big: number[] = [];
      for (let i = 0; i < pts.length; i += 3) {
        const p = place(pts[i], pts[i + 1], pts[i + 2]);
        const r = dot * grow * Math.pow(p.k, 0.62);
        if (p.x < -r || p.x > W + r || p.y < -r || p.y > H + r) continue;
        if (r > 2.6) { big.push(p.x, p.y, r); continue; }
        g.moveTo(p.x + r, p.y);
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      g.fill();
      for (let i = 0; i < big.length; i += 3) {
        g.fillStyle = `rgba(${rgb}, ${(alpha * (1 - clamp((big[i + 2] - 9) / 30))).toFixed(3)})`;
        g.beginPath();
        g.arc(big[i], big[i + 1], big[i + 2], 0, Math.PI * 2);
        g.fill();
      }
    };

    if (resting && z === 0) {
      // At rest the dots do not move: draw them once and reuse the picture.
      const key = [W, H, dpr, mapW.toFixed(1), x0.toFixed(1), y0.toFixed(1), dark].join('|');
      if (this.rest?.key !== key) {
        const image = document.createElement('canvas');
        image.width = canvas.width;
        image.height = canvas.height;
        const g = image.getContext('2d')!;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawDots(g, this.land, ink.land, ink.landA, 1);
        drawDots(g, this.turkey, '237, 28, 44', 0.95, 1.25);
        this.rest = { key, image };
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.rest.image, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      drawDots(ctx, this.land, ink.land, ink.landA, 1);
      drawDots(ctx, this.turkey, '237, 28, 44', 0.95, 1.25);
    }

    // Arcs: they belong to the resting picture and fade as the dive begins.
    const arcs = 1 - clamp(zz / 0.3);
    this.drawArcs(ctx, place, at, now / 1000, arcs, ink, still, card);

    // İstanbul: a red point that breathes; in the dive it grows and its middle opens.
    const cover = Math.hypot(Math.max(at.x, W - at.x), Math.max(at.y, H - at.y)) + 2;
    const base = 4.6 * Math.pow(scale, 0.45);
    const hole = open > 0 ? lerp(base * 0.5, cover, open * open) : 0;
    const breath = still ? 0.5 : 0.5 + 0.5 * Math.sin((now / 1000) * 2.1);
    ctx.fillStyle = `rgba(237, 28, 44, ${(0.16 + 0.14 * breath) * (1 - open)})`;
    ctx.beginPath();
    ctx.arc(at.x, at.y, base * 2.3 + 3 * breath, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(at.x, at.y, Math.max(base, hole + 5 + 46 * open), 0, Math.PI * 2);
    ctx.fill();
    if (open === 0) {
      ctx.strokeStyle = ink.ring;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // The point's name: it appears once the arcs are gone and the dive is under way, sits just
    // above the point's halo, and leaves as the point starts to open.
    const label = this.place().nativeElement;
    const named = still ? 0 : span(z, [0.24, 0.4]) * (1 - clamp(open * 5));
    label.style.opacity = named.toFixed(3);
    if (named > 0) {
      const lx = at.x + box.left - cardBox.left, ly = at.y - base * 2.3 - 14;
      label.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -100%) scale(${(0.9 + 0.1 * named).toFixed(3)})`;
    }
    // In the pin's coordinates, which is what the opening layer is clipped in.
    return { x: at.x + box.left - pinBox.left, y: at.y + box.top - pinBox.top, hole };
  }

  private drawArcs(
    ctx: CanvasRenderingContext2D,
    place: (u: number, v: number, depth: number) => { x: number; y: number },
    to: { x: number; y: number },
    t: number,
    fade: number,
    ink: (typeof INK)['light'],
    still: boolean,
    card: { x: number; w: number; h: number },
  ) {
    const cards = this.founderCards();
    const period = ORIGINS.length * ARC.gap;
    ORIGINS.forEach(({ uv: [u, v], founder }, i) => {
      const from = place(u, v, 0.5);
      const phase = still ? ARC.land : (t + period - i * ARC.gap) % period;
      const live = still ? 1 : clamp(phase / ARC.start) * (1 - clamp((phase - ARC.out) / ARC.fade));

      // A founder's card sits just above their city while their arc is on the map.
      const el = founder >= 0 ? cards[founder]?.nativeElement : undefined;
      if (el) {
        // On a still page only two cards that cannot overlap are shown.
        const shown = (still ? (founder === 0 || founder === GLOBE_FOUNDERS.length - 1 ? 1 : 0) : live) * fade;
        el.style.opacity = shown.toFixed(3);
        if (shown > 0) {
          const w = el.offsetWidth, h = el.offsetHeight;
          const x = clamp(from.x - card.x, w / 2 + 8, card.w - w / 2 - 8);
          const above = from.y - h - 14 >= 8;
          const y = above ? from.y - h - 14 + (1 - live) * 6 : from.y + 14 - (1 - live) * 6;
          el.style.transform = `translate(${(x - w / 2).toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      }
      if (fade <= 0) return;

      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      // Routes bow upwards, more the further they travel, like flight paths on a flat map.
      const cx = (from.x + to.x) / 2, cy = Math.min(from.y, to.y) - dist * 0.24 - 12;
      const point = (q: number) => ({
        x: (1 - q) * (1 - q) * from.x + 2 * (1 - q) * q * cx + q * q * to.x,
        y: (1 - q) * (1 - q) * from.y + 2 * (1 - q) * q * cy + q * q * to.y,
      });

      // Every city is always marked; its route shows while its light is travelling.
      ctx.fillStyle = `rgba(${ink.arc}, ${(0.5 + 0.45 * live) * fade})`;
      ctx.beginPath();
      ctx.arc(from.x, from.y, founder >= 0 ? 3 : 2.3, 0, Math.PI * 2);
      ctx.fill();
      if (live <= 0) return;

      ctx.save();
      ctx.setLineDash([1.5, 5]);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(${ink.arc}, ${(still ? 0.4 : 0.24) * live * fade})`;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(cx, cy, to.x, to.y);
      ctx.stroke();
      ctx.restore();
      if (still) return;

      // The light: an unhurried head with a long, soft tail.
      const head = ease(clamp((phase - ARC.start) / ARC.fly)), tail = ease(clamp((phase - ARC.start - ARC.tail) / ARC.fly));
      if (head > 0 && tail < 1) {
        const steps = 32;
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.6;
        for (let n = 0; n < steps; n++) {
          const a = point(tail + ((head - tail) * n) / steps), b = point(tail + ((head - tail) * (n + 1)) / steps);
          ctx.strokeStyle = `rgba(${ink.arc}, ${(0.03 + 0.62 * ((n + 1) / steps)) * live * fade})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        if (head < 1) {
          const h = point(head);
          ctx.fillStyle = ink.head;
          ctx.globalAlpha = 0.9 * fade;
          ctx.beginPath();
          ctx.arc(h.x, h.y, 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      // Arrival: İstanbul glows a little brighter for a moment.
      const glow = (phase - ARC.land) / ARC.glow;
      if (glow >= 0 && glow <= 1) {
        ctx.fillStyle = `rgba(237, 28, 44, ${0.2 * Math.sin(Math.PI * glow) * fade})`;
        ctx.beginPath();
        ctx.arc(to.x, to.y, 12 + 6 * glow, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}
