# Dotted engravings

The portal's illustrations are traditional Istanbul scenes drawn as fine, softly breathing dots on the
navy panels. Each picture is stored as a tiny **density map** (one pixel per dot, brightness = dot
size); `<app-dot-engraving>` (`src/app/shared/dot-engraving.ts`) draws the dots on a canvas and
animates them with a slow drifting noise field plus a random pulse per dot. It pauses off-screen and
shows a still frame under `prefers-reduced-motion`.

```
art/source/<name>.jpg   black-on-white line drawing (input, not served)
art/dots.py             converter → public/assets/engravings/<name>-map.png
```

| Slot | Command |
| --- | --- |
| Welcome hero | `python3 art/dots.py art/source/hero.jpg public/assets/engravings/hero-map.png --map 640 --floor 0.42` |
| Welcome CTA band | `python3 art/dots.py art/source/yali.jpg public/assets/engravings/yali-map.png --map 760 --floor 0.32` |
| Login | `python3 art/dots.py art/source/login.jpg public/assets/engravings/login-map.png --map 380 --floor 0.52 --gamma 0.9` |
| Register | `python3 art/dots.py art/source/register.jpg public/assets/engravings/register-map.png --map 380 --floor 0.52 --gamma 0.9` |

- `--map` = number of dot columns: higher is more detailed (and more dots to animate; ~35k dots for
  the hero draws in ~5 ms).
- `--floor` = ink level treated as empty paper: raise it for dark, busy drawings, lower it for light
  ones, so density stays similar across images.
- Breathing strength and dot colour are component inputs (`breath`, `ink`); per-image opacity is
  `DOT_OPACITY` in `tools/design-import/install.py`.
- Without `--map`, `dots.py` writes a static transparent PNG instead (handy for previews).

Current sources: the design's hero and yalı engravings, plus two 19th-century Allom engravings from
Wikimedia Commons (cropped to the artwork).

## Generating new source art

Ask the image model for clean line drawings, not dots; the converter adds the dot style.
Keep the bottom of the picture busy and the top mostly empty, since the page fades art out toward the top
and sets text over it.

Shared ending for every prompt:

> …, detailed 19th-century steel engraving, black ink line work on plain white background, strong
> contrast, fine cross-hatching, no color, no text, no border, no signature

- **Welcome hero (21:9):** Panorama of the historic peninsula of Istanbul seen from the Bosphorus at
  dawn, Süleymaniye and Hagia Sophia domes with minarets on the right, Galata Tower, small ferry boats
  and a sailing caïque on calm water, sky left mostly empty
- **Welcome CTA band (4:1):** Row of traditional wooden Ottoman yalı mansions along the Bosphorus
  shore, boats moored at their water steps, wooded hills behind
- **Login (3:2):** Galata Bridge with fishermen casting lines, a simit seller with a tray of simit on
  his head, ferries and the New Mosque in the background
- **Register (3:2):** Quiet Istanbul street with an old fountain (çeşme), a çay seller carrying
  tulip-shaped tea glasses on a tray, cats on stone steps, wooden houses with bay windows

Save the result as `art/source/<name>.jpg` and rerun that slot's command.

## Sample pitch deck

`public/assets/samples/lumora-analytics-pitch.pptx` is the downloadable "örnek sunum" on the upload
screen: a fictional start-up whose company, founder, contact and funding slides are tagged with what
AI Reviewer reads. Generator: `art/sample-deck/build.js`.
