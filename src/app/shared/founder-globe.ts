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
} from '@angular/core';
import { flagUrl } from '../core/countries';
import { GLOBE_LAND, GLOBE_N, GLOBE_TURKEY } from './globe-data';
import { GLOBE_FOUNDERS, GLOBE_TARGET, GlobeFounder } from './founders.data';

type V3 = [number, number, number];

interface Arc {
  id: number;
  f: GlobeFounder;
  from: V3;
  to: V3;
  /** Angle between the two ends (radians). */
  omega: number;
  /** How high the middle of the arc rises above the surface (fraction of the radius). */
  lift: number;
  born: number;
  landed: boolean;
  /** Set once if the card would cover another card; it then stays hidden for the arc's whole life
   * (rather than popping in late when the other card leaves). */
  noCard?: boolean;
}

/** Seconds: head travels to İstanbul, arc stays, then it retracts into İstanbul. */
const TRAVEL = 1.9;
const HOLD = 2.8;
const FADE = 0.9;
const LIFE = TRAVEL + HOLD + FADE;
/** A new arc every SPAWN seconds, at most MAX_ARCS at once. */
const SPAWN = 1.7;
const MAX_ARCS = 3;
/** The globe does not turn: centre of the view (latitude, longitude). Türkiye sits left of centre so
 * Europe, Africa, the Middle East and India are all in sight. */
const VIEW_LAT = 24;
const VIEW_LON = 45;

const RAD = Math.PI / 180;

const AVATAR_FILLS = [
  'linear-gradient(135deg, #2B3B8E, #061262)',
  'linear-gradient(135deg, #4A63C8, #1D2F86)',
  'linear-gradient(135deg, #3B5BDB, #0C217E)',
  'linear-gradient(135deg, #5B6FB8, #2B3B8E)',
];

type RGB = [number, number, number];
interface Palette {
  halo: RGB; haloA: number; haloDrop: number;
  body: [number, string][];
  rim: string;
  dot: RGB; dotA: number[];
  arcFrom: RGB; arcTo: RGB; head: RGB;
  marker: RGB;
  istRing: string;
}
/** Light page: a pale globe with navy land, like a printed map. */
const LIGHT: Palette = {
  halo: [43, 59, 142], haloA: 0.16, haloDrop: 0.05,
  body: [[0, '#FFFFFF'], [0.6, '#F1F4FB'], [1, '#DDE4F3']],
  rim: 'rgba(43,59,142,0.16)',
  dot: [6, 18, 98], dotA: [0.26, 0.4, 0.54, 0.68, 0.8],
  arcFrom: [157, 182, 255], arcTo: [6, 18, 98], head: [43, 59, 142],
  marker: [6, 18, 98],
  istRing: '#FFFFFF',
};
/** Dark theme: navy globe with light land. */
const DARK: Palette = {
  halo: [120, 150, 255], haloA: 0.28, haloDrop: 0,
  body: [[0, 'rgba(46,72,190,0.95)'], [0.65, 'rgba(14,30,120,0.96)'], [1, 'rgba(6,14,72,0.98)']],
  rim: 'rgba(157,182,255,0.35)',
  dot: [214, 224, 255], dotA: [0.14, 0.3, 0.46, 0.62, 0.78],
  arcFrom: [157, 182, 255], arcTo: [255, 255, 255], head: [255, 255, 255],
  marker: [255, 255, 255],
  istRing: '#FFFFFF',
};
const ARC_STEPS = 72;
/** Room a card needs (px) when checking two cards against each other. */
const CARD_W = 175;
const CARD_H = 80;

const toV3 = (lat: number, lon: number): V3 => {
  const la = lat * RAD, lo = lon * RAD;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
};

/** Fibonacci-sphere points listed by base-36 index deltas (see globe-data.ts). */
const decode = (s: string): V3[] => {
  const G = Math.PI * (3 - Math.sqrt(5));
  let i = -1;
  return s.split(',').map((d) => {
    i += parseInt(d, 36);
    const y = 1 - (2 * (i + 0.5)) / GLOBE_N;
    const r = Math.sqrt(1 - y * y);
    const th = G * i;
    const lon = Math.atan2(Math.sin(th) * r, Math.cos(th) * r);
    return [Math.cos(Math.asin(y)) * Math.sin(lon), y, Math.cos(Math.asin(y)) * Math.cos(lon)];
  });
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('tr');

/**
 * Landing-page globe: a still, dotted Earth (Türkiye in view) while arcs fly in
 * from founders' cities to İstanbul. Each founder's card (photo, name, company) sits on their city.
 * Canvas for the globe and arcs, HTML for the cards. Pauses off-screen; one still frame under
 * prefers-reduced-motion.
 */
@Component({
  selector: 'app-founder-globe',
  template: `
    <canvas #canvas aria-hidden="true"></canvas>
    <div class="cards" aria-hidden="true">
      @for (a of arcs(); track a.id) {
        <div class="card" [attr.data-arc]="a.id">
          <span class="avatar" [style.background]="a.f.photo ? null : hue(a.f.name)">
            @if (a.f.photo) {
              <img [src]="a.f.photo" alt="" />
            } @else {
              {{ initials(a.f.name) }}
            }
          </span>
          <span class="name"><img [src]="flag(a.f.iso)" [attr.title]="a.f.city" alt="" width="13" height="10" />{{ a.f.name }}</span>
          <span class="company">{{ a.f.company }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    /* The host needs a size and a position (relative or absolute) from where it is used. */
    :host { display: block; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .cards { position: absolute; inset: 0; pointer-events: none; }
    .card {
      position: absolute; left: 0; top: 0; opacity: 0; will-change: transform, opacity;
      display: flex; flex-direction: column; align-items: center; gap: 1px; max-width: 170px;
      padding: 8px 12px 7px; border-radius: 12px; box-sizing: border-box; text-align: center;
      background: var(--bg-FFFFFF); border: 1px solid var(--bd-E3E9F5);
      box-shadow: 0 10px 24px -14px rgba(6, 18, 98, .45), 0 1px 3px rgba(6, 18, 98, .1);
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
    }
    .card::after {
      content: ''; position: absolute; left: 50%; bottom: -5px; width: 8px; height: 8px; margin-left: -4px;
      background: var(--bg-FFFFFF); border-right: 1px solid var(--bd-E3E9F5); border-bottom: 1px solid var(--bd-E3E9F5);
      transform: rotate(45deg);
    }
    .avatar {
      width: 30px; height: 30px; border-radius: 50%; margin-bottom: 3px; overflow: hidden; flex: none;
      display: grid; place-items: center; color: #fff; font: 600 11px/1 'IBM Plex Sans', sans-serif; letter-spacing: .03em;
      box-shadow: 0 0 0 2px var(--bg-FFFFFF), 0 0 0 3px var(--bd-E3E9F5);
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .name { display: inline-flex; align-items: center; gap: 5px; font: 600 12.5px/16px 'IBM Plex Sans', sans-serif; color: var(--fg-061262); white-space: nowrap; }
    .company { font: 500 11.5px/15px 'IBM Plex Sans', sans-serif; color: var(--fg-5B6478); white-space: nowrap; }
    .name img { border-radius: 2px; display: block; flex: none; }
    /* Below this width the headline runs over the globe, so the cards would sit under the text. */
    @media (max-width: 1100px) { .cards { display: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FounderGlobe {
  readonly founders = input<GlobeFounder[]>(GLOBE_FOUNDERS);
  /** Show the founder cards (off on small screens, where the globe sits behind the text). */
  readonly cards = input(true);

  protected readonly arcs = signal<Arc[]>([]);
  protected readonly initials = initials;
  protected readonly flag = flagUrl;

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);

  private readonly land = decode(GLOBE_LAND);
  private readonly turkey = decode(GLOBE_TURKEY);
  private readonly target = toV3(GLOBE_TARGET.lat, GLOBE_TARGET.lon);

  private frame = 0;
  private visible = false;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private visRight = 0;
  private base?: HTMLCanvasElement;
  private baseKey = '';
  private nextId = 1;
  private lastSpawn = -Infinity;
  private queue: GlobeFounder[] = [];
  private landings: number[] = [];
  /** Current view rotation (set every frame). */
  private cl = 1; private sl = 0; private ct = 1; private st = 0;

  constructor() {
    this.setView(VIEW_LON, VIEW_LAT);
    afterNextRender(() => this.start());
  }

  /** Initials background (until there are photos): one of a few brand navy/blue gradients. */
  protected hue(name: string) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_FILLS[h % AVATAR_FILLS.length];
  }

  private start() {
    const canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const resize = () => {
      this.dpr = Math.min(devicePixelRatio || 1, 2);
      const { width, height } = this.host.getBoundingClientRect();
      this.W = width;
      this.H = height;
      // The host may run past the window's right edge; keep cards inside what is visible.
      this.visRight = Math.min(width, document.documentElement.clientWidth - this.host.getBoundingClientRect().left);
      canvas.width = Math.max(1, Math.round(width * this.dpr));
      canvas.height = Math.max(1, Math.round(height * this.dpr));
      if (still.matches) this.stillFrame(ctx);
      else this.draw(ctx, now());
    };

    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.draw(ctx, now());
    };
    const play = () => {
      cancelAnimationFrame(this.frame);
      if (still.matches) this.stillFrame(ctx);
      else if (this.visible) this.frame = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(this.host);
    const io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      play();
    });
    io.observe(this.host);
    const onMotionPref = () => {
      this.arcs.set([]);
      resize();
      play();
    };
    still.addEventListener('change', onMotionPref);

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.frame);
      ro.disconnect();
      io.disconnect();
      still.removeEventListener('change', onMotionPref);
    });
  }

  // --- view ---------------------------------------------------------------------------------

  private setView(lon: number, lat: number) {
    this.cl = Math.cos(lon * RAD);
    this.sl = Math.sin(lon * RAD);
    this.ct = Math.cos(lat * RAD);
    this.st = Math.sin(lat * RAD);
  }

  /** World vector -> view space (x right, y up, z towards the viewer), unit sphere. */
  private rot(v: V3, s = 1): V3 {
    const x = v[0] * this.cl - v[2] * this.sl;
    const z1 = v[0] * this.sl + v[2] * this.cl;
    return [x * s, (v[1] * this.ct - z1 * this.st) * s, (v[1] * this.st + z1 * this.ct) * s];
  }

  private geom() {
    // Big and low: the bottom of the globe is cut off by the hero's edge, like a horizon.
    // The halo reaches 1.3 R: keep it inside the canvas on every side so it never ends in a hard edge
    // (the bottom and right are cut by the hero itself, which is fine).
    const R = Math.min(this.W * 0.36, this.H * 0.53);
    return { R, cx: this.W / 2, cy: this.H * 0.7 };
  }

  private slerp(a: Arc, u: number): V3 {
    const { from: p, to: q, omega: w } = a;
    const s = Math.sin(w) || 1;
    const k1 = Math.sin((1 - u) * w) / s;
    const k2 = Math.sin(u * w) / s;
    const h = 1 + a.lift * Math.sin(Math.PI * u);
    return [(p[0] * k1 + q[0] * k2) * h, (p[1] * k1 + q[1] * k2) * h, (p[2] * k1 + q[2] * k2) * h];
  }

  /** Hidden when it is behind the sphere (and not sticking out past its outline). */
  private static hidden(p: V3) {
    return p[2] < 0 && p[0] * p[0] + p[1] * p[1] < 1;
  }

  // --- arcs -----------------------------------------------------------------------------------

  private makeArc(f: GlobeFounder, born: number): Arc {
    const from = toV3(f.lat, f.lon);
    const d = from[0] * this.target[0] + from[1] * this.target[1] + from[2] * this.target[2];
    const omega = Math.acos(Math.max(-1, Math.min(1, d)));
    return { id: this.nextId++, f, from, to: this.target, omega, lift: 0.06 + 0.32 * (omega / Math.PI), born, landed: false };
  }

  /** Screen position of a point on the globe. */
  private xy(v: V3) {
    const { R, cx, cy } = this.geom();
    const p = this.rot(v);
    return { x: cx + p[0] * R, y: cy - p[1] * R, z: p[2] };
  }

  private spawn(t: number, retry = true) {
    const live = this.arcs();
    if (live.length >= MAX_ARCS) return;
    if (!this.queue.length) this.queue = [...this.founders()].sort(() => Math.random() - 0.5);
    // Cards of arcs that are still showing theirs.
    // Cards sit just above the founder's city.
    const taken = live.filter((a) => !a.noCard && t - a.born < TRAVEL + HOLD).map((a) => this.xy(a.from));
    const ist = this.xy(this.target);
    for (let i = 0; i < this.queue.length; i++) {
      const f = this.queue[i];
      const arc = this.makeArc(f, t);
      const at = this.xy(arc.from);
      // The city must face us, its card must not cover another card, nor İstanbul.
      if (at.z < 0.3 || at.x > (this.visRight || this.W) - 24 || at.y > this.H - 24) continue;
      if (taken.some((q) => Math.abs(q.x - at.x) < CARD_W && Math.abs(q.y - at.y) < CARD_H)) continue;
      if (Math.abs(ist.x - at.x) < CARD_W / 2 + 10 && ist.y < at.y + 10 && ist.y > at.y - CARD_H - 20) continue;
      this.queue.splice(i, 1);
      this.lastSpawn = t;
      this.arcs.set([...live, arc]);
      return;
    }
    // Nobody left in this round faces us (the globe has turned away from them): start a new round
    // with everyone not already flying.
    if (retry) {
      const flying = new Set(live.map((a) => a.f));
      this.queue = this.founders().filter((f) => !flying.has(f)).sort(() => Math.random() - 0.5);
      this.spawn(t, false);
    }
  }

  // --- drawing --------------------------------------------------------------------------------

  private stillFrame(ctx: CanvasRenderingContext2D) {
    // Fixed view with three arcs fully drawn.
    const t = 100;
    if (!this.arcs().length) {
      const picks = ['Olivia Bennett', 'Ethan Brooks', 'Aisha Rahman']
        .map((n) => this.founders().find((f) => f.name === n))
        .filter((f): f is GlobeFounder => !!f);
      this.arcs.set(
        picks.map((f) => ({ ...this.makeArc(f, t - TRAVEL - 1), landed: true })),
      );
    }
    this.render(ctx, t, true);
  }

  private draw(ctx: CanvasRenderingContext2D, t: number) {
    const live = this.arcs().filter((a) => t - a.born < LIFE);
    if (live.length !== this.arcs().length) this.arcs.set(live);
    if (t - this.lastSpawn > SPAWN) this.spawn(t);
    this.render(ctx, t, false);
  }

  /** Halo, sphere, land dots and Türkiye: everything that does not move. */
  private drawBase(ctx: CanvasRenderingContext2D, P: Palette, R: number, cx: number, cy: number) {
    const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    // Atmosphere and body.
    const halo = ctx.createRadialGradient(cx, cy + R * P.haloDrop, R * 0.94, cx, cy + R * P.haloDrop, R * 1.25);
    halo.addColorStop(0, rgba(P.halo, P.haloA));
    halo.addColorStop(0.35, rgba(P.halo, P.haloA * 0.45));
    halo.addColorStop(1, rgba(P.halo, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy + R * P.haloDrop, R * 1.25, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    P.body.forEach(([stop, c]) => body.addColorStop(stop, c));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = P.rim;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Land dots, bucketed by depth so we change fill style only a few times. Dots fade out towards the
    // outline, where the even spacing on the sphere bunches up into stripes.
    const dotR = Math.max(0.7, R * 0.0044);
    const buckets: number[][] = [[], [], [], [], []];
    for (const v of this.land) {
      const p = this.rot(v);
      if (p[2] <= 0.04) continue;
      buckets[Math.min(4, Math.floor(p[2] * 5))].push(cx + p[0] * R, cy - p[1] * R, p[2]);
    }
    buckets.forEach((b, i) => {
      ctx.fillStyle = rgba(P.dot, P.dotA[i]);
      ctx.beginPath();
      for (let k = 0; k < b.length; k += 3) {
        const r = dotR * (0.7 + 0.3 * b[k + 2]);
        ctx.moveTo(b[k] + r, b[k + 1]);
        ctx.arc(b[k], b[k + 1], r, 0, Math.PI * 2);
      }
      ctx.fill();
    });

    // Türkiye in brand red.
    ctx.fillStyle = '#ED1C2C';
    ctx.beginPath();
    for (const v of this.turkey) {
      const p = this.rot(v);
      if (p[2] <= 0.08) continue;
      const x = cx + p[0] * R, y = cy - p[1] * R, r = dotR * 1.15;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();

  }

  private render(ctx: CanvasRenderingContext2D, t: number, still: boolean) {
    const { W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!W || !H) return;
    const { R, cx, cy } = this.geom();
    const P = document.documentElement.classList.contains('theme-dark') ? DARK : LIGHT;
    const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    // The globe itself never moves: draw it once per size/theme and reuse it.
    const key = `${W}x${H}@${dpr}:${P === DARK ? 'd' : 'l'}`;
    if (this.baseKey !== key) {
      this.base ??= document.createElement('canvas');
      this.base.width = ctx.canvas.width;
      this.base.height = ctx.canvas.height;
      const b = this.base.getContext('2d')!;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawBase(b, P, R, cx, cy);
      this.baseKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base!, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dotR = Math.max(0.7, R * 0.0044);

    // Arcs.
    const cardsOn = this.cards();
    const placed: { x: number; y: number }[] = [];
    for (const a of this.arcs()) {
      const age = t - a.born;
      const head = Math.min(1, age / TRAVEL);
      const easedHead = 1 - Math.pow(1 - head, 3);
      const tail = age > TRAVEL + HOLD ? Math.min(1, (age - TRAVEL - HOLD) / FADE) : 0;
      const easedTail = tail * tail * (3 - 2 * tail);
      if (!a.landed && head >= 1) {
        a.landed = true;
        this.landings.push(t);
      }

      // Origin marker.
      const o = this.rot(a.from);
      const ox = cx + o[0] * R, oy = cy - o[1] * R;
      if (o[2] > 0 && easedTail < 1) {
        ctx.fillStyle = rgba(P.marker, 1 - easedTail);
        ctx.beginPath();
        ctx.arc(ox, oy, dotR * 1.9, 0, Math.PI * 2);
        ctx.fill();
        const pr = (age % 1.6) / 1.6;
        ctx.strokeStyle = rgba(P.arcTo, 0.6 * (1 - pr) * (1 - easedTail));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(ox, oy, dotR * 2.2 + pr * R * 0.06, 0, Math.PI * 2);
        ctx.stroke();
      }

      // The line itself, fading in from the tail.
      const u0 = easedTail, u1 = easedHead;
      if (u1 > u0) {
        const n = Math.max(2, Math.ceil(ARC_STEPS * (u1 - u0)));
        let prev: V3 | null = null;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.6, R * 0.0055);
        for (let i = 0; i <= n; i++) {
          const u = u0 + ((u1 - u0) * i) / n;
          const p = this.rot(this.slerp(a, u));
          if (prev && !FounderGlobe.hidden(p) && !FounderGlobe.hidden(prev)) {
            const k = i / n;
            const c: RGB = [0, 1, 2].map((j) => Math.round(P.arcFrom[j] + (P.arcTo[j] - P.arcFrom[j]) * k)) as RGB;
            ctx.strokeStyle = rgba(c, 0.25 + 0.75 * k);
            ctx.beginPath();
            ctx.moveTo(cx + prev[0] * R, cy - prev[1] * R);
            ctx.lineTo(cx + p[0] * R, cy - p[1] * R);
            ctx.stroke();
          }
          prev = p;
        }
        // Glowing head while travelling.
        if (head < 1) {
          const hp = this.rot(this.slerp(a, u1));
          if (!FounderGlobe.hidden(hp)) {
            const hx = cx + hp[0] * R, hy = cy - hp[1] * R;
            const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, dotR * 6);
            g.addColorStop(0, rgba(P.head, 0.95));
            g.addColorStop(1, rgba(P.head, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(hx, hy, dotR * 6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Card pinned above the founder's city.
      const el = this.host.querySelector<HTMLElement>(`.card[data-arc="${a.id}"]`);
      if (!el) continue;
      const inT = still ? 1 : Math.min(1, Math.max(0, age / 0.45));
      const outT = Math.min(1, Math.max(0, (age - TRAVEL - HOLD + 0.1) / (FADE * 0.7)));
      let op = cardsOn && o[2] > 0.05 ? inT * (1 - outT) * Math.min(1, o[2] / 0.25) : 0;
      const w = el.offsetWidth, h = el.offsetHeight;
      let x = ox, y = oy - dotR * 3 - 8;
      x = Math.min((this.visRight || W) - w / 2 - 12, Math.max(w / 2 + 8, x));
      y = Math.min(H - 8, Math.max(h + 8, y));
      // Two cards on top of each other (the globe turned them together): the newer one gives way for good.
      if (!a.noCard && op > 0 && placed.some((q) => Math.abs(q.x - x) < w * 0.9 && Math.abs(q.y - y) < h * 0.9)) a.noCard = true;
      if (a.noCard) op = 0;
      else if (op > 0) placed.push({ x, y });
      const lift = (1 - inT) * 8;
      el.style.opacity = String(op);
      el.style.transform = `translate(${x - w / 2}px, ${y - h + lift}px) scale(${0.94 + 0.06 * inT})`;
    }

    // İstanbul: red dot, slow ripple, and a ring each time an arc lands.
    const ist = this.rot(this.target);
    if (ist[2] > 0) {
      const ix = cx + ist[0] * R, iy = cy - ist[1] * R;
      this.landings = this.landings.filter((l) => t - l < 1.2);
      const rings = still ? [] : [...this.landings.map((l) => (t - l) / 1.2), (t % 2.4) / 2.4];
      for (const k of rings) {
        ctx.strokeStyle = `rgba(237,28,44,${0.75 * (1 - k)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ix, iy, dotR * 2.4 + k * R * 0.1, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = P.istRing;
      ctx.beginPath();
      ctx.arc(ix, iy, dotR * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ED1C2C';
      ctx.beginPath();
      ctx.arc(ix, iy, dotR * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
