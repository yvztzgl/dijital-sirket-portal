import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Terminal AI's face, drawn part by part so that each part can move.
 *
 * - `idle` (default): it floats, the antenna trails a moment behind the head, the smiling eyes
 *   blink and now and then glance to each side, and every few seconds it gives itself a short
 *   shake.
 * - `thinking`: the eyes open and scan left and right, the float quickens and the antenna sends
 *   out rings; it holds still otherwise.
 *
 * Pointing at it makes it shake at once. Nothing moves when the visitor asked for reduced motion.
 *
 * The width comes from `size` (any CSS length) or from the caller's stylesheet; the height follows
 * the drawing's 126:96 proportions. Colours are the mark's own and stay the same in both themes;
 * a caller can change them through `--bot-head`, `--bot-visor` and `--bot-eye`.
 */
@Component({
  selector: 'app-bot',
  template: `
    <svg viewBox="0 0 126 96" aria-hidden="true" focusable="false">
      <g class="float">
        <g class="tilt">
          <g class="antenna">
            <circle class="ping" cx="63" cy="4" r="4" />
            <circle class="skin" cx="63" cy="4" r="4" />
          </g>
          <g class="skin">
            <rect x="0" y="33" width="20" height="27" rx="8" />
            <rect x="106" y="33" width="20" height="27" rx="8" />
            <rect x="8" y="10" width="110" height="73" rx="27" ry="36.5" />
            <path d="M64 80 75 96 100 82.5Q108 78 112 68z" />
          </g>
          <rect class="visor" x="20" y="24" width="86" height="45" rx="16" ry="22.5" />
          <g class="eyes">
            <g class="happy"><path d="M42.5 46a5.5 5.5 0 0 1 11 0" /><path d="M72.5 46a5.5 5.5 0 0 1 11 0" /></g>
            <g class="open"><circle cx="48" cy="45" r="3.6" /><circle cx="78" cy="45" r="3.6" /></g>
          </g>
        </g>
      </g>
    </svg>
  `,
  styles: `
    :host {
      --bot-head: #B8CFFF; --bot-visor: #669BFF; --bot-eye: #FFFFFF;
      display: inline-block; flex: none; width: 30px; aspect-ratio: 126 / 96; line-height: 0;
    }
    /* The float and the shake leave the drawing's box by a pixel or two. */
    svg { display: block; width: 100%; height: 100%; overflow: visible; }
    .skin { fill: var(--bot-head); }
    .visor { fill: var(--bot-visor); }
    .happy path { fill: none; stroke: var(--bot-eye); stroke-width: 2.6; stroke-linecap: round; }
    .open circle { fill: var(--bot-eye); }
    .ping { fill: none; stroke: var(--bot-head); stroke-width: 1.4; opacity: 0; }

    /* Lengths below are in the drawing's own units (126 across), so the motion scales with it. */
    .float { animation: float 3.8s ease-in-out infinite; }
    .antenna { animation: trail 3.8s ease-in-out infinite; }
    .eyes { animation: glance 9s ease-in-out infinite; }
    .happy path { transform-box: fill-box; transform-origin: 50% 100%; animation: blink 5.2s ease-in-out infinite; }
    .happy { transition: opacity .18s ease; }
    .open { opacity: 0; scale: .4; transform-box: fill-box; transform-origin: center; transition: opacity .18s ease, scale .28s cubic-bezier(.34, 1.56, .64, 1); }
    .ping { transform-box: fill-box; transform-origin: center; }
    /* The shake: a second of wobble around the chin, then rest. Pointing at it starts one at once. */
    .tilt { transform-origin: 63px 70px; animation: shake 4.6s ease-in-out infinite; }
    :host(:hover) .tilt { animation: wobble .7s ease-in-out; }

    :host([data-mood='thinking']) .float { animation: hop 1.1s ease-in-out infinite; }
    :host([data-mood='thinking']) .antenna { animation: trail 1.1s ease-in-out infinite; }
    :host([data-mood='thinking']) .eyes { animation: scan 1.7s ease-in-out infinite; }
    :host([data-mood='thinking']) .happy { opacity: 0; }
    :host([data-mood='thinking']) .open { opacity: 1; scale: 1; }
    :host([data-mood='thinking']) .tilt { animation: none; }
    :host([data-mood='thinking']) .ping { animation: ping 1.1s ease-out infinite; }

    @keyframes float { 0%, 100% { translate: 0 2px; } 50% { translate: 0 -3px; } }
    @keyframes hop { 0%, 100% { translate: 0 2px; } 50% { translate: 0 -5px; } }
    /* The head moves up fastest a quarter of the way in: the antenna is left behind there. */
    @keyframes trail { 0%, 50%, 100% { translate: 0 0; } 25% { translate: 0 1.8px; } 75% { translate: 0 -1.8px; } }
    @keyframes blink { 0%, 91%, 100% { scale: 1 1; } 95% { scale: 1 .12; } }
    @keyframes glance { 0%, 58%, 96%, 100% { translate: 0 0; } 64%, 74% { translate: -4px 0; } 82%, 90% { translate: 4px 0; } }
    @keyframes scan { 0%, 12%, 100% { translate: -5px 0; } 50%, 62% { translate: 5px 0; } }
    @keyframes shake {
      0%, 78%, 100% { rotate: 0deg; translate: 0 0; }
      81% { rotate: -10deg; translate: -3px 0; } 85% { rotate: 9deg; translate: 3px 0; }
      89% { rotate: -7deg; translate: -2px 0; } 93% { rotate: 5deg; translate: 1px 0; } 97% { rotate: -2deg; translate: 0 0; }
    }
    @keyframes wobble {
      0%, 100% { rotate: 0deg; translate: 0 0; }
      15% { rotate: -11deg; translate: -3px 0; } 35% { rotate: 10deg; translate: 3px 0; }
      55% { rotate: -7deg; translate: -2px 0; } 75% { rotate: 5deg; translate: 1px 0; } 90% { rotate: -2deg; translate: 0 0; }
    }
    @keyframes ping { from { scale: 1; opacity: .9; } to { scale: 3.4; opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      .float, .tilt, .antenna, .eyes, .happy path, .ping { animation: none !important; }
      .happy, .open { transition: none; }
    }
  `,
  // An attribute, not a class: a class on the host would also pick up the caller's own rules for
  // that name (the side panel has a `.thinking` row).
  host: { '[attr.data-mood]': 'mood()', '[style.width]': 'size()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Bot {
  readonly mood = input<'idle' | 'thinking'>('idle');
  /** Width as a CSS length. Left out, the caller's stylesheet (or the 30px default) decides. */
  readonly size = input<string>();
}
