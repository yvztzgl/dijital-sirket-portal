import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleQuestionMark,
  Moon,
  Sun,
  Languages,
  LogOut,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  CreditCard,
  Download,
  FileText,
  Globe,
  IdCard,
  Info,
  Landmark,
  Lock,
  Mail,
  MapPin,
  MessageSquareText,
  Mic,
  MicOff,
  Pencil,
  PhoneOff,
  ScanFace,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
  Video,
  VideoOff,
  X,
} from 'lucide-angular';

type IconNode = [string, Record<string, string | number>][];

/** Lucide icons used in the portal (tree-shaken: only these ship). */
const ICONS = {
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'badge-check': BadgeCheck,
  building: Building2,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  alert: CircleAlert,
  help: CircleQuestionMark,
  moon: Moon,
  sun: Sun,
  languages: Languages,
  'log-out': LogOut,
  copy: Copy,
  cpu: Cpu,
  eye: Eye,
  'eye-off': EyeOff,
  card: CreditCard,
  download: Download,
  file: FileText,
  globe: Globe,
  'id-card': IdCard,
  info: Info,
  landmark: Landmark,
  lock: Lock,
  mail: Mail,
  pin: MapPin,
  sms: MessageSquareText,
  mic: Mic,
  'mic-off': MicOff,
  pencil: Pencil,
  'phone-off': PhoneOff,
  face: ScanFace,
  search: Search,
  send: Send,
  shield: ShieldCheck,
  sparkles: Sparkles,
  upload: Upload,
  user: User,
  video: Video,
  'video-off': VideoOff,
  x: X,
} as unknown as Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A Lucide icon sized in `em`, so it takes the font size and colour of the text around it:
 * `<app-icon name="check" />`. `size` overrides (e.g. "18px"), `stroke` sets the line weight.
 */
@Component({
  selector: 'app-icon',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.display]': '"inline-flex"',
    '[style.flex]': '"none"',
    '[style.width]': 'size()',
    '[style.height]': 'size()',
    '[style.vertical-align]': '"-0.15em"',
  },
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input('1em');
  readonly stroke = input(2);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly node = computed(() => ICONS[this.name()] ?? ICONS['info']);

  constructor() {
    effect(() => {
      const svg = document.createElementNS(SVG_NS, 'svg');
      const attrs: Record<string, string> = {
        viewBox: '0 0 24 24',
        width: '100%',
        height: '100%',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': String(this.stroke()),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      };
      Object.entries(attrs).forEach(([k, v]) => svg.setAttribute(k, v));
      for (const [tag, a] of this.node()) {
        const el = document.createElementNS(SVG_NS, tag);
        Object.entries(a).forEach(([k, v]) => k !== 'key' && el.setAttribute(k, String(v)));
        svg.appendChild(el);
      }
      this.host.replaceChildren(svg);
    });
  }
}

/** Unicode markers from the design copy and the icon each one becomes. */
const LEADING: Record<string, string> = { '✓': 'check', '✎': 'pencil', '◍': 'globe', '›': 'chevron-right', '←': 'arrow-left', '!': 'alert' };
const TRAILING: Record<string, string> = { '▾': 'chevron-down', '▴': 'chevron-up', '→': 'arrow-right', '›': 'chevron-right' };

/** Splits "✓ Tamamlandı" / "Devam et →" into icon + text, for labels computed in code. */
export function splitGlyphs(text: string) {
  let t = text ?? '';
  let lead: string | null = null;
  let trail: string | null = null;
  const first = t.trimStart()[0];
  if (first && LEADING[first] && (t.trimStart()[1] === ' ' || t.trim().length === 1)) {
    lead = LEADING[first];
    t = t.trimStart().slice(1).trimStart();
  }
  const last = t.trimEnd().at(-1);
  if (last && TRAILING[last] && t.trimEnd().at(-2) === ' ') {
    trail = TRAILING[last];
    t = t.trimEnd().slice(0, -1).trimEnd();
  }
  return { lead, text: t, trail };
}

/** Text that may start or end with a design glyph (✓, ✎, ◍, ›, ▾, ▴, →); the glyph renders as an icon. */
@Component({
  selector: 'app-itext',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:inline-flex;align-items:center;gap:.35em' },
  template: `@let p = parts();
    @if (p.lead) {<app-icon [name]="p.lead" [stroke]="stroke()" />}{{ p.text }}@if (p.trail) {<app-icon [name]="p.trail" [stroke]="stroke()" />}`,
})
export class IText {
  readonly text = input<string | null | undefined>('');
  readonly stroke = input(2.25);
  protected readonly parts = computed(() => splitGlyphs(this.text() ?? ''));
}
