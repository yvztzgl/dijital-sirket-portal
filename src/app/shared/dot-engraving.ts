import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';

interface Dot {
  /** Grid position (column, row) in the density map. */
  c: number;
  r: number;
  /** Rest size, 0–1 (from the map). */
  size: number;
  /** Per-dot random phase and speed so neighbours never pulse in lockstep. */
  phase: number;
  speed: number;
}

const FPS = 30;

/**
 * Stippled engraving drawn on a canvas from a density map (see art/dots.py --map).
 * Each dot "breathes": its size follows a slow drifting noise field plus its own random pulse.
 * Stops animating when off-screen and draws a single still frame under prefers-reduced-motion.
 */
@Component({
  selector: 'app-dot-engraving',
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: `
    :host { display: block; overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DotEngraving {
  /** Grayscale density map: one pixel per dot, brightness = dot size. */
  readonly src = input.required<string>();
  /** Vertical anchoring when the map is cropped to cover the box. */
  readonly align = input<'center' | 'bottom'>('center');
  /** Dot colour. */
  readonly ink = input('#E9EFFF');
  /** How strongly dots breathe (0 = static, 1 = shrink to nothing at the low point). */
  readonly breath = input(0.45);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);

  private dots: Dot[] = [];
  private cols = 0;
  private rows = 0;
  private frame = 0;
  private lastDraw = 0;
  private visible = false;

  constructor() {
    afterNextRender(() => this.start());
  }

  private async start() {
    const canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    await this.loadMap(this.src());
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const { width, height } = this.host.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      this.draw(ctx, performance.now() / 1000, still.matches);
    };

    const loop = (now: number) => {
      this.frame = requestAnimationFrame(loop);
      if (now - this.lastDraw < 1000 / FPS) return;
      this.lastDraw = now;
      this.draw(ctx, now / 1000, false);
    };
    const play = () => {
      cancelAnimationFrame(this.frame);
      if (this.visible && !still.matches) this.frame = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(this.host);
    const io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      play();
    });
    io.observe(this.host);
    const onMotionPref = () => {
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

  private async loadMap(url: string) {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = this.cols = img.naturalWidth;
    c.height = this.rows = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    const dots: Dot[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let col = 0; col < this.cols; col++) {
        const v = data[(r * this.cols + col) * 4] / 255;
        if (v < 0.06) continue;
        dots.push({ c: col, r, size: v, phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 0.9 });
      }
    }
    this.dots = dots;
  }

  private draw(ctx: CanvasRenderingContext2D, t: number, still: boolean) {
    const { width: W, height: H } = ctx.canvas;
    ctx.clearRect(0, 0, W, H);
    if (!this.cols) return;

    // "cover" fit: dot pitch so the map fills the box; crop centred horizontally.
    const pitch = Math.max(W / this.cols, H / this.rows);
    const x0 = (W - this.cols * pitch) / 2;
    const y0 = this.align() === 'bottom' ? H - this.rows * pitch : (H - this.rows * pitch) / 2;
    const maxR = pitch * 0.55;
    const depth = still ? 0 : this.breath();

    ctx.fillStyle = this.ink();
    ctx.beginPath();
    for (const d of this.dots) {
      const x = x0 + (d.c + (d.r & 1 ? 0.5 : 0) + 0.5) * pitch;
      const y = y0 + (d.r + 0.5) * pitch;
      if (x < -pitch || x > W + pitch || y < -pitch || y > H + pitch) continue;

      let s = d.size;
      if (depth) {
        // Slow drifting field (waves rolling across the picture) + each dot's own pulse.
        const field =
          Math.sin(d.c * 0.045 + t * 0.55) * Math.sin(d.r * 0.06 - t * 0.4) +
          Math.sin((d.c + d.r) * 0.021 - t * 0.3);
        const own = Math.sin(t * d.speed + d.phase);
        const b = 0.5 + 0.25 * field * 0.5 + 0.25 * own; // ~0–1
        s *= 1 - depth + depth * b * 1.4;
      }
      const r = Math.min(maxR, maxR * s);
      if (r < 0.3) continue;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
