import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { flagUrl } from '../core/countries';

/**
 * Cities the trails come from. They illustrate "from anywhere": no person or company is named,
 * so nothing here reads as a claim about a real founder.
 */
const CITIES: { city: string; iso: string }[] = [
  { city: 'Lizbon', iso: 'pt' },
  { city: 'Londra', iso: 'gb' },
  { city: 'Stockholm', iso: 'se' },
  { city: 'Dubai', iso: 'ae' },
  { city: 'Nairobi', iso: 'ke' },
  { city: 'Berlin', iso: 'de' },
  { city: 'Singapur', iso: 'sg' },
  { city: 'New York', iso: 'us' },
  { city: 'Tokyo', iso: 'jp' },
  { city: 'São Paulo', iso: 'br' },
];

/** Where the city labels sit in the sky band, as fractions of it (x, y). Wide hosts, then narrow. */
const SLOTS_WIDE: [number, number][] = [[0.1, 0.5], [0.3, 0.2], [0.52, 0.66], [0.72, 0.12], [0.9, 0.58]];
const SLOTS_NARROW: [number, number][] = [[0.16, 0.3], [0.4, 0.95], [0.64, 0.25], [0.86, 0.9]];

/** One label's life, in seconds: appear, fly to İstanbul, land, stay, leave, rest. */
const PERIOD = 7;
const T = { in: 0.5, fly: 1.6, flyStart: 0.5, land: 2.1, ripple: 1.3, out: 4.4 };

const INK = '201, 212, 240';
const RED = '#ED1C2C';

interface Pt { x: number; y: number }

/**
 * The story layer of the navy welcome hero: city labels in the sky, and a trail of light from each
 * one down to a "Terminal İstanbul" pin in the skyline engraving. Canvas for the trails and the
 * pin, HTML for the labels. Pauses off-screen; one still frame under prefers-reduced-motion.
 *
 * The host needs a size and a position (absolute) from where it is used. `map` is the element that
 * holds the engraving, so the pin stays on the same spot of the picture at every width.
 */
@Component({
  selector: 'app-arrivals',
  template: `
    <canvas #canvas></canvas>
    @for (c of shown(); track $index) {
      <span #chip class="chip"><img [src]="flag(c.iso)" alt="" width="16" height="12" />{{ c.city }}</span>
    }
    <span #pinLabel class="pin-label">Terminal İstanbul</span>
  `,
  styles: `
    :host { display: block; pointer-events: none; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .chip {
      position: absolute; left: 0; top: 0; opacity: 0; will-change: transform, opacity;
      display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px 5px 8px; border-radius: 999px; white-space: nowrap;
      background: rgba(255, 255, 255, .09); border: 1px solid rgba(255, 255, 255, .24);
      font: 600 12.5px/16px 'IBM Plex Sans', sans-serif; letter-spacing: .01em; color: #EEF2FF;
    }
    .chip img { display: block; flex: none; border-radius: 2px; }
    .pin-label {
      position: absolute; left: 0; top: 0; padding: 4px 9px; border-radius: 6px; white-space: nowrap;
      background: rgba(4, 8, 80, .78); border: 1px solid rgba(255, 255, 255, .3);
      font: 600 11.5px/15px 'IBM Plex Sans', sans-serif; letter-spacing: .03em; color: #FFFFFF;
    }
    @media (max-width: 640px) {
      .chip { font-size: 11.5px; padding: 4px 9px 4px 7px; gap: 6px; }
    }
  `,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Arrivals {
  /** The element holding the skyline engraving. */
  readonly map = input.required<HTMLElement>();
  /** Where the trails land, as fractions (x, y) of `map`. */
  readonly pin = input<[number, number]>([0.7, 0.5]);

  /** The city each label shows right now. */
  protected readonly shown = signal(CITIES.slice(0, SLOTS_WIDE.length));
  protected readonly flag = flagUrl;

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly chips = viewChildren<ElementRef<HTMLElement>>('chip');
  private readonly pinLabel = viewChild.required<ElementRef<HTMLElement>>('pinLabel');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);

  private frame = 0;
  private visible = false;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private target: Pt = { x: 0, y: 0 };
  private origins: Pt[] = [];
  /** Which round each label is on, so its city changes only between rounds. */
  private rounds: number[] = [];

  constructor() {
    afterNextRender(() => this.start());
  }

  private start() {
    const canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const resize = () => {
      this.layout(canvas);
      this.draw(ctx, now(), still.matches);
    };
    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.draw(ctx, now(), false);
    };
    const play = () => {
      cancelAnimationFrame(this.frame);
      if (still.matches) this.draw(ctx, 0, true);
      else if (this.visible) this.frame = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(this.host);
    ro.observe(this.map());
    const io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      play();
    });
    io.observe(this.host);
    still.addEventListener('change', play);

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.frame);
      ro.disconnect();
      io.disconnect();
      still.removeEventListener('change', play);
    });
  }

  /** Works out where the pin and the labels are, in host pixels. */
  private layout(canvas: HTMLCanvasElement) {
    const box = this.host.getBoundingClientRect();
    const map = this.map().getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = box.width;
    this.H = box.height;
    canvas.width = Math.max(1, Math.round(box.width * this.dpr));
    canvas.height = Math.max(1, Math.round(box.height * this.dpr));

    const [px, py] = this.pin();
    this.target = { x: map.left - box.left + px * map.width, y: map.top - box.top + py * map.height };

    // The sky band: from the top of the host down to just above the tallest roofs in the picture.
    const narrow = box.width < 520;
    const slots = narrow ? SLOTS_NARROW : SLOTS_WIDE;
    const skyBottom = Math.max(narrow ? 78 : 120, map.top - box.top + 0.1 * map.height);
    this.origins = slots.map(([u, v]) => ({ x: u * box.width, y: 30 + v * (skyBottom - 30) }));
    if (this.shown().length !== slots.length) {
      this.rounds = [];
      this.shown.set(CITIES.slice(0, slots.length));
    }

    const label = this.pinLabel().nativeElement;
    label.style.transform = `translate(${Math.round(this.target.x + 12)}px, ${Math.round(this.target.y - 30)}px)`;
  }

  private draw(ctx: CanvasRenderingContext2D, now: number, still: boolean) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const P = this.target;
    const chips = this.chips();
    const n = this.origins.length;
    const stagger = PERIOD / n;

    this.origins.forEach((O, i) => {
      const clock = now + i * stagger;
      const phase = still ? T.out - 0.1 : clock % PERIOD;
      const round = still ? 0 : Math.floor(clock / PERIOD);
      if (this.rounds[i] !== round) {
        this.rounds[i] = round;
        const city = CITIES[(i + round * n) % CITIES.length];
        if (this.shown()[i] !== city) this.shown.update((s) => s.map((c, j) => (j === i ? city : c)));
      }

      // The label: fades in, stays through the flight, fades out.
      const vis = still ? 1 : clamp(phase / T.in) * (1 - clamp((phase - T.out) / 0.5));
      const el = chips[i]?.nativeElement;
      if (el) {
        el.style.opacity = vis.toFixed(3);
        el.style.transform = `translate(${O.x}px, ${O.y - 9 + (1 - vis) * 5}px) translate(-50%, -100%)`;
      }
      if (vis <= 0) return;

      // The trail leaves sideways and comes down onto the pin from above.
      const C: Pt = { x: P.x + (O.x - P.x) * 0.12, y: O.y - 4 };
      const at = (t: number): Pt => ({
        x: (1 - t) * (1 - t) * O.x + 2 * (1 - t) * t * C.x + t * t * P.x,
        y: (1 - t) * (1 - t) * O.y + 2 * (1 - t) * t * C.y + t * t * P.y,
      });

      // Faint dotted route, so the link reads even between flights.
      ctx.save();
      ctx.setLineDash([1.5, 5]);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgba(${INK}, ${(still ? 0.4 : 0.2) * vis})`;
      ctx.beginPath();
      ctx.moveTo(O.x, O.y);
      ctx.quadraticCurveTo(C.x, C.y, P.x, P.y);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = `rgba(${INK}, ${0.9 * vis})`;
      ctx.beginPath();
      ctx.arc(O.x, O.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (still) return;

      // The light: a bright head with a tail that catches up after it lands.
      const head = ease(clamp((phase - T.flyStart) / T.fly));
      const tail = ease(clamp((phase - T.flyStart - 0.55) / T.fly));
      if (head > 0 && tail < 1) {
        const steps = 28;
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.8;
        for (let s = 0; s < steps; s++) {
          const a = tail + ((head - tail) * s) / steps;
          const b = tail + ((head - tail) * (s + 1)) / steps;
          const p = at(a);
          const q = at(b);
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.05 + 0.9 * ((s + 1) / steps)) * vis})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
        if (head < 1) {
          const h = at(head);
          ctx.save();
          ctx.shadowColor = 'rgba(157, 182, 255, .9)';
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(h.x, h.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // A ring spreads from the pin each time a trail lands.
      const r = (phase - T.land) / T.ripple;
      if (r >= 0 && r <= 1) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * (1 - r)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(P.x, P.y, 6 + ease(r) * 26, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // The pin: brand red, with a slow breath of its own.
    const breath = still ? 0.5 : 0.5 + 0.5 * Math.sin(now * 2.2);
    ctx.fillStyle = `rgba(237, 28, 44, ${0.16 + 0.14 * breath})`;
    ctx.beginPath();
    ctx.arc(P.x, P.y, 11 + 3 * breath, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = RED;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(P.x, P.y, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
