#!/usr/bin/env python3
"""
Turn hard-coded hex colours in the Angular sources into theme tokens.

Every `#RRGGBB` used as a CSS value becomes `var(--<role>-RRGGBB)`, where the role comes
from the property it is used in. The colour is the same in light mode, but dark mode needs
different values for text and for backgrounds:
  fg  text (color, caret-color, …)          dark ink -> light ink, light ink kept (it sits on navy)
  bg  backgrounds, gradients, accent-color  light surfaces -> dark surfaces, primary navy lifted
  bd  borders, outlines, rings, shadows     light lines -> dark lines
  ic  SVG fills/strokes in illustrations    like bg, but white stays white

Writes src/tokens.scss with the light values on :root and the dark values on html.theme-dark.
Run again after adding colours: already tokenized values are left alone, and the token file is
rebuilt from every var(--role-HEX) found.

  python3 tools/theme/tokenize.py          # rewrite sources + tokens
  python3 tools/theme/tokenize.py --check  # report only
"""
import math
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'src'
TOKENS = SRC / 'tokens.scss'
FILES = [p for ext in ('ts', 'html', 'scss') for p in SRC.rglob(f'*.{ext}') if p != TOKENS and not p.name.endswith('.spec.ts')]

HEX = re.compile(r'(?<![&\w#])#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b')
SVG_ATTR = re.compile(r'\b(fill|stroke|stop-color)="#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})"')
PROP = re.compile(r'([A-Za-z][A-Za-z-]*)\s*:(?!:)|\[style\.([A-Za-z-]+)\]')
# Property / JS-key names -> role. Checked in order against the lower-cased name.
RULES = [
    (('mask', 'webkit-mask'), None),
    (('shadow',), 'bd'),
    (('background', 'accent-color'), 'bg'),
    (('border', 'outline', 'divider', 'ring'), 'bd'),
    (('caret-color', 'text-decoration-color', 'color'), 'fg'),
    (('fill', 'stroke', 'stop-color'), 'ic'),
]
JS_KEYS = {
    'bg': 'bg', 'ctabg': 'bg', 'fill': 'bg', 'bar': 'bg', 'barbg': 'bg', 'track': 'bg',
    'dot': 'bd', 'border': 'bd', 'ring': 'bd', 'line': 'bd',
    'fg': 'fg', 'ink': None, 'tone': 'fg', 'strengthcolor': 'fg', 'color': 'fg', 'text': 'fg',
}


def norm(h: str) -> str:
    h = h.upper()
    return ''.join(c * 2 for c in h) if len(h) == 3 else h


def role_of(line: str, pos: int) -> str | None:
    best = None
    for m in PROP.finditer(line, 0, pos):
        best = m
    if not best:
        return None
    name = (best.group(1) or best.group(2)).lower()
    if name in JS_KEYS:
        return JS_KEYS[name]
    for keys, role in RULES:
        if any(k in name for k in keys):
            return role
    if name.endswith('bg'):
        return 'bg'
    if name.endswith('color'):
        return 'fg'
    return None


# ------------------------------------------------------------------------------ colour maths

def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin_to_srgb(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def hex_to_oklch(h):
    r, g, b = (srgb_to_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (x ** (1 / 3) for x in (l, m, s))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360


def oklch_to_rgb(L, C, H):
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )


def oklch_to_hex(L, C, H):
    while C > 0:  # pull chroma in until the colour fits sRGB
        if all(-0.0005 <= v <= 1.0005 for v in oklch_to_rgb(L, C, H)):
            break
        C -= 0.004
    r, g, b = (round(lin_to_srgb(v) * 255) for v in oklch_to_rgb(L, max(C, 0), H))
    return f'{r:02X}{g:02X}{b:02X}'


NAVY_HUE = 268  # neutrals pick up a hint of the brand navy in dark mode

# Hand-tuned dark values for the colours that carry the layout; everything else is derived.
DARK = {
    'bg': {
        'FFFFFF': '141A30', 'F4F6FB': '0B1022', 'F7F9FE': '1A2142', 'FAFBFD': '171D35', 'F1F4FA': '1B2240',
        'EEF1F6': '1D2440', 'F4F6FA': '1B2240', 'F3F4F6': '1D2440', 'EFF4FF': '1A2550', 'F1F5FF': '1C2858',
        'E9EFFF': '1E2B5E', 'E8EEFB': '1E2B5E', 'DCE6FF': '24336E', 'E3E9F5': '222B4C', 'E5E7EB': '262E4A',
        '061262': '2E4BC6', '0C217E': '3A58D6', '9AA6C4': '2E3654',
        'F0FDF4': '0F2A1C', 'F7FCF8': '11231A', 'DCEFE2': '163A26', 'DCF3E3': '163A26', 'ECFDF3': '133523',
        'FFFBEB': '2A2210', 'F3EEFF': '251C45', 'FAF1DE': '2A2210', 'FEF3F2': '2E1515', 'F8F1F2': '2A1618',
        'F04438': 'F04438', '7EE2A8': '7EE2A8',
    },
    'fg': {
        '061262': 'D6DEFF', '0C217E': 'B9C8FF', '111827': 'E8EBF2', '1F2A44': 'DCE1EE', '2A3550': 'CDD3E2',
        '3B4660': 'B8C0D4', '5B6478': '96A0B8', '8A93A6': '7580A0', '15803D': '4ADE80', '166534': '6EE7A0',
        '14532D': '86EFAC', 'B42318': 'F97066', 'D92D20': 'F97066', '912018': 'FDA29B', 'B45309': 'F5A524',
        'B54708': 'F5A524', '78350F': 'F5C77A', '6D28D9': 'B79CFF',
    },
    'bd': {
        'E5E7EB': '262E4A', 'D6DEEE': '2C3557', 'C9D2E3': '36406A', 'E3E9F5': '283052', 'EEF1F6': '222A46',
        'C7D5F7': '334178', 'C9D4F0': '334178', 'DCE6FF': '2A3A80', '061262': '5B7BFF', 'D1D5DB': '36406A',
        'BBE5C8': '1F5A36', 'DCEFE2': '1F5A36', 'F5D9A8': '5A4520', 'FBD5D1': '5C2620', 'FFFFFF': '141A30',
    },
    'ic': {'061262': '2E4BC6', 'DCE6FF': '24336E', 'FFFFFF': 'FFFFFF'},
}


def dark_value(role: str, h: str) -> str:
    if h in DARK.get(role, {}):
        return DARK[role][h]
    L, C, H = hex_to_oklch(h)
    neutral = C < 0.025
    if role == 'fg':
        if L >= 0.6:
            return h  # light ink only ever sits on dark panels, which stay dark
        return oklch_to_hex(min(0.95, 1.12 - 0.85 * L), C * 0.9, H)
    if role == 'ic':
        return h  # illustration colours not in the table keep their light-mode value
    if role == 'bg':
        if L < 0.6 or (C >= 0.05 and L < 0.86):
            return h  # navy panels, status fills, illustration tones and accents stay as they are
        return oklch_to_hex(0.21 + (1 - L) * 0.8, 0.02 if neutral else min(C, 0.06), NAVY_HUE if neutral else H)
    if role == 'bd':
        if L < 0.6:
            return oklch_to_hex(max(L, 0.62), C, H)
        return oklch_to_hex(0.26 + (1 - L) * 0.9, 0.025 if neutral else min(C, 0.07), NAVY_HUE if neutral else H)
    return h


# ------------------------------------------------------------------------------ rewrite

def rewrite(text: str, unknown: list, path):
    def svg(m):
        attr, h = m.group(1), norm(m.group(2))
        return f'style="{attr}:var(--ic-{h})"'

    out = []
    for n, line in enumerate(text.split('\n'), 1):
        # SVG presentation attributes do not resolve var(); move them to style= when the tag has none.
        def svg_safe(m, line=line):
            tag_start = line.rfind('<', 0, m.start())
            tag_end = line.find('>', m.end())
            return m.group(0) if 'style=' in line[tag_start:tag_end] else svg(m)

        line = SVG_ATTR.sub(svg_safe, line)
        parts, last = [], 0
        for m in HEX.finditer(line):
            role = role_of(line, m.start())
            if role is None:
                unknown.append(f'{path.relative_to(ROOT)}:{n}: …{line[max(0, m.start() - 60):m.end() + 10].strip()}')
                continue
            parts.append(line[last:m.start()])
            parts.append(f'var(--{role}-{norm(m.group(1))})')
            last = m.end()
        parts.append(line[last:])
        out.append(''.join(parts))
    return '\n'.join(out)


def main():
    check = '--check' in sys.argv
    unknown, changed = [], 0
    for p in FILES:
        text = p.read_text()
        new = rewrite(text, unknown, p)
        if new != text:
            changed += 1
            if not check:
                p.write_text(new)

    used = set()
    for p in FILES:
        used |= set(re.findall(r'var\(--(fg|bg|bd|ic)-([0-9A-F]{6})\)', p.read_text()))
    used = sorted(used)
    light = '\n'.join(f'  --{r}-{h}: #{h};' for r, h in used)
    dark = '\n'.join(f'  --{r}-{h}: #{dark_value(r, h)};' for r, h in used)
    tokens = (
        '// Generated by tools/theme/tokenize.py: edit the DARK table there, then re-run.\n'
        '// --<role>-<light hex>: fg text, bg surfaces, bd lines and rings, ic illustration fills.\n'
        f':root {{\n  color-scheme: light;\n{light}\n}}\n\n'
        f'html.theme-dark {{\n  color-scheme: dark;\n{dark}\n}}\n\n'
        '// Navy panels are dark by design: they keep their light-theme colours in both themes.\n'
        f'html.theme-dark .keep-light {{\n{light}\n}}\n'
    )
    if not check:
        TOKENS.write_text(tokens)
    print(f'{changed} files rewritten, {len(used)} tokens, {len(unknown)} left as-is')
    for u in unknown:
        print('  ', u)


if __name__ == '__main__':
    main()
