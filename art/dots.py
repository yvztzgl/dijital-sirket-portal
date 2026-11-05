"""Turn a black-on-white line drawing into the portal's dotted-engraving style.

Two outputs:

* Density map (what the site uses): `--map COLS` writes a tiny grayscale PNG with one pixel per
  dot (value = dot size). The <app-dot-engraving> component draws and animates the dots from it.

    python3 art/dots.py art/source/hero.jpg public/assets/engravings/hero-map.png --map 640

* Static PNG: light dots on a transparent background (a staggered halftone grid,
  dot size = local ink density), for previews or places without the component.

    python3 art/dots.py art/source/hero.jpg hero-dots.png --width 1920

Tuning:
  --cell   grid pitch in output pixels (smaller = finer, denser image)
  --floor  ink level (0–1) treated as empty paper; raise it if light hatching turns into noise
  --gamma  <1 grows mid-tone dots, >1 keeps only the darkest lines strong
"""
import argparse

from PIL import Image, ImageDraw, ImageOps

INK = (233, 239, 255)  # near-white with the platform's blue cast
SS = 3  # supersampling factor for smooth dot edges


def load(src, crop_bottom):
    base = Image.open(src).convert('L')
    if crop_bottom:
        base = base.crop((0, 0, base.width, round(base.height * (1 - crop_bottom))))
    return ImageOps.autocontrast(base, cutoff=1)


def density_map(src, dst, cols, floor, gamma, crop_bottom):
    base = load(src, crop_bottom)
    rows = round(base.height * cols / base.width)
    ink = ImageOps.invert(base).resize((cols, rows), Image.BOX)
    ink = ink.point(lambda p: round(255 * max(0.0, (p / 255 - floor) / (1 - floor)) ** gamma))
    ink.save(dst, optimize=True)
    print(f'{dst}: {cols}x{rows} dot map')


def render(src, dst, width, cell, floor, gamma, crop_bottom):
    base = load(src, crop_bottom)
    height = round(base.height * width / base.width)
    cols, rows = width // cell, height // cell
    # Ink density per cell (engravings are dark lines on light paper).
    ink = ImageOps.invert(base).resize((cols, rows), Image.BOX)
    px = ink.load()

    alpha = Image.new('L', (width * SS, height * SS), 0)
    draw = ImageDraw.Draw(alpha)
    half = cell * SS / 2
    for y in range(rows):
        shift = half if y % 2 else 0  # staggered rows read as hand stippling, not a screen grid
        for x in range(cols):
            v = max(0.0, (px[x, y] / 255 - floor) / (1 - floor))
            r = half * 1.1 * v ** gamma
            if r < 0.35 * SS:
                continue
            cx = x * cell * SS + half + shift
            cy = y * cell * SS + half
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)

    alpha = alpha.resize((width, height), Image.LANCZOS)
    out = Image.new('RGBA', (width, height), INK + (0,))
    out.putalpha(alpha)
    out.save(dst, optimize=True)
    print(f'{dst}: {width}x{height}, {cols}x{rows} cells')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('src')
    p.add_argument('dst')
    p.add_argument('--width', type=int, default=1920)
    p.add_argument('--cell', type=int, default=6)
    p.add_argument('--floor', type=float, default=0.4)
    p.add_argument('--gamma', type=float, default=0.7)
    p.add_argument('--crop-bottom', type=float, default=0, help='fraction of height to drop (scan margins)')
    p.add_argument('--map', type=int, metavar='COLS', help='write a density map with this many dot columns')
    a = p.parse_args()
    if a.map:
        density_map(a.src, a.dst, a.map, a.floor, a.gamma, a.crop_bottom)
    else:
        render(a.src, a.dst, a.width, a.cell, a.floor, a.gamma, a.crop_bottom)
