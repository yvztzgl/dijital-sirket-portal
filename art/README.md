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

## Landing steps

**Replaced on 2026-11-19.** The owner found the landing's story "really bad" and its dotted
pictures "not good". The story no longer uses dotted engravings: each step's panel has one picture
in the wizard's flat style (see "The wizard's illustration style" below) across its top and a
piece of the real screen under it. Until the landing set below is generated, matching wizard
pictures stand in (`STEPS[].pic` in `src/app/screens/karsilama/landing.ts`): `upload-read`,
`id-camera`, `next-bank`, `call-show`, `building`. The dotted step maps
(`public/assets/engravings/step-*-map.png`) are no longer used by any screen. The notes below on
the dotted versions are kept as the record of what was tried.

### The landing set (to generate)

The picture is shown across the top of the step's panel at 3.2 : 1, up to 720 px wide (1440 px on
a 2x screen); the white screen piece sits directly under it, not over it. The panel takes on the
picture's background colour, so the picture has no visible edge. Two images in the band style, so
each set is drawn in one hand; attach `art/source/set-next.webp` as the style reference to both,
so the founder and the colours match the wizard. Start each with the band style paragraph from
"The wizard's illustration style" below, then:

Image A (steps 1 to 3):

```
Three bands, image 1536x1440, each band 1536x480 (3.2 times wider than tall). Inside every
band: the scene sits in the middle 70% of the width; the tallest head stays well below the top
edge, with at least a fifth of the band's height of empty wall above it; figures about two
thirds of the band's height tall; the left and right ends of every band are empty wall. The
same founder appears in every band, exactly as in the attached reference: a man with short dark
hair in a navy suit and white shirt.
From top to bottom:
1. The founder sits at a white desk with an open laptop. From the laptop a row of five white
   presentation slides with simple charts floats to the right towards a small friendly round
   robot assistant with a mid-blue body and a dark visor, who holds one slide and reads it.
   Beside the robot a tall white board shows a short list of lines with tick marks. One slide
   is the soft red accent.
2. The founder sits at a desk facing his laptop and holds his open passport up beside his
   face; on the laptop screen his own head and shoulders inside an oval frame, with a few small
   tick marks beside the oval. A desk lamp and a window with a plain sky. The passport cover is
   the soft red accent.
3. The founder sits at a desk and pays online: he holds a soft red bank card in one hand while
   the laptop screen shows a simple payment form and a large tick. A short white receipt slip
   curls out beside the laptop. A potted plant and a shelf with two folders behind him.
```

Image B (steps 4 and 5):

```
Two bands, image 1536x960, each band 1536x480 (3.2 times wider than tall). Same framing rules:
scene in the middle 70% of the width, a fifth of the band's height of empty wall above the
tallest head, the left and right ends empty. The same founder as in the attached reference: a
man with short dark hair in a navy suit and white shirt.
From top to bottom:
1. A video call. The founder sits at a desk facing a large monitor; on the screen, head and
   shoulders, a woman operator with dark hair tied back and a headset. The founder holds his
   open passport towards the screen's camera. On the desk lies a single document with a round
   seal on it; the seal is the soft red accent.
2. The founder sits relaxed at his desk with a soft red coffee mug, his laptop open. From the
   laptop a dotted path runs to the right through three small simple buildings standing in a
   row: a low building with columns, a bank with a round vault door, and a modern glass office
   tower. A small white document envelope travels along the path towards them. Far behind,
   very pale, the modern Istanbul skyline with the Bosphorus suspension bridge.
```

When they arrive: cut each band at its measured gap (the model rarely keeps the exact size),
save as `public/assets/illustrations/landing-deck.webp`, `landing-id.webp`, `landing-pay.webp`,
`landing-sign.webp`, `landing-setup.webp`, keep the sources as `art/source/set-landing-a.webp` and
`set-landing-b.webp`, then set each step's `pic` and `bg` (the picture's corner colour) in
`STEPS`. Restart `ng serve` after adding the files.

### The dotted versions (retired 2026-11-19)

Each of the five story steps on the landing (`src/app/screens/karsilama/landing.ts`, `STEPS[].art`)
has a dotted band across the lower half of its screen.

**No Ottoman or old-İstanbul imagery here** (owner, 2026-11-16: "we are way past that"). The
subject is today's İstanbul and people working today: glass towers, the Bosphorus bridge, ferries,
laptops, phones. The older engravings above are still used on the login and register screens and
on the previous landing.

All five maps in use (`public/assets/engravings/step-<name>-map.png`) come from drawings the
owner generated with the prompts below (sources: `art/source/step-deck.webp`, `step-id.webp`,
`step-pay.webp`, `step-sign.webp`, `step-setup.webp`; 2000×667). Each was converted with

```
python3 art/dots.py art/source/step-<name>.webp public/assets/engravings/step-<name>-map.png --map 760 --floor 0.38
```

Each picture has two settings in `STEPS` (`landing.ts`): `fade`, where it starts to appear and
where it is fully there (percent from the top; set around the point where that drawing begins),
and `focus`, which part to keep when the sides are cropped (the e-İmza picture keeps its left,
so the figure's head is not cut). A new drawing needs both checked.

To replace one with a real drawing, generate at **3:1 or 4:1**, with a strong foreground on the
left, depth behind it, and water and skyline running off to the right; keep the upper third as
empty sky (the step's text and app window sit over the top of the band).

**Modern subject, engraving technique.** The first modern prompts also swapped the style for a
"clean contemporary line illustration" and came back thin and flat, like a colouring book, next to
the dense old engravings. The richness comes from the technique words, so keep those and change
only what is drawn. Use this ending:

> …, rendered as a highly detailed steel engraving, intaglio banknote-engraving technique, dense
> fine cross-hatching and stippling, rich tonal range with deep blacks, black ink on plain white
> background, strong contrast, present-day 2020s scene with modern clothing and modern
> architecture, no historical costume, no color, no text, no logos, no border, no signature

- **Step 1, Sunum (`step-deck`):** Wide panorama. In the foreground on the left a founder standing
  beside a large screen of charts, presenting to two colleagues seated at a table with laptops,
  inside a modern glass-walled co-working space with plants and chairs. Through the
  floor-to-ceiling windows the Bosphorus with ferries and a container ship, and in the distance on
  the right the suspension bridge and a skyline of glass towers. Upper third of the image empty sky
- **Step 2, Uygunluk (`step-id`):** Wide panorama. In the foreground on the left a traveller with
  a backpack seated at a waterfront café table, holding up a smartphone that frames their face, an
  open biometric passport and a laptop on the table. Behind, a modern ferry terminal with a glass
  canopy and people walking. Across the water on the right, modern Istanbul: towers and the
  Bosphorus bridge. Upper third of the image empty sky
- **Step 3, Ödeme (`step-pay`):** Wide panorama. In the foreground on the left, close on a hand
  tapping a bank card against a phone on a desk with a laptop and a coffee cup, inside a modern
  office. Beyond the window wall a busy street with a tram and glass towers, and on the right the
  water with ferries. Upper third of the image empty sky
- **Step 4, e-İmza (`step-sign`):** Wide panorama. In the foreground on the left a woman at a desk
  on a video call, the laptop screen showing an operator wearing a headset, beside it a tablet and
  stylus signing a document. A modern office with glass partitions and plants. On the right a wide
  view through the windows over the Bosphorus to the bridge and towers. Upper third of the image
  empty sky
- **Step 5, Kuruluş (`step-setup`):** Wide panorama of a modern technology campus on the
  waterfront. On the left low glass-and-steel buildings with people walking and talking between
  them, bicycles, and a tower crane over a building under construction. In the middle a promenade
  with bollards and moored modern boats. On the right, across the water, a cluster of high-rise
  towers and the Bosphorus suspension bridge, a ferry crossing. Upper third of the image empty sky

**Top edge.** The landing fades the picture in from above, but a drawing whose scene starts with
a straight line (a ceiling, a roofline right across) still looks cut off. For the next ones, add
to the prompt: *"the top of the scene dissolves into the empty paper as loose, unfinished sketch
lines, vignette style, no ceiling and no hard horizontal top edge"*.

Restart `ng serve` after adding new files under `public/`: the dev server does not pick them up.

## Sample pitch deck

`public/assets/samples/lumora-analytics-pitch.pptx` is the downloadable "örnek sunum" on the upload
screen: a fictional start-up whose company, founder, contact and funding slides are tagged with what
AI Reviewer reads. Generator: `art/sample-deck/build.js`.

## Building scene (D-5a "Şirketiniz kuruluyor")

Not a dotted engraving made with `dots.py`: one ordinary picture that the screen shows twice
(`.wz-rise` in `src/wizard.scss`, `rise` and `BUILDING` in
`src/app/screens/data/eimza.data.ts`).

| File | What |
| --- | --- |
| `public/assets/illustrations/building.webp` | 1536×1024, generated by the owner with an image model on 2026-11-17. A six-storey office building cut open, one small scene with figures per floor, a pale modern skyline behind. |

The six floors are the six agency steps that run on D-5a, from the ground up, and each floor's
scene belongs to its step: 1 trade registry (a clerk stamping a document), 2 tax office
(calculator, framed certificate), 3 financial seal (a technician with a chip card, a laptop
showing a shield), 4 bank (teller, customer, vault door), 5 social security and e-ledger (a
person at two screens, filing cabinets, a server rack), 6 the accountant (two people shaking
hands). There are no words in the picture and the page adds none.

How the screen uses it:
- Underneath, the whole picture as faint dots (a CSS mask): the plan.
- On top, the same picture in full, except that **the building's own column** is cut off above
  the height built so far. Sky, skyline and ground beside the building are always in full.
- While a step runs, its floor fills in from its floor line to the slab above it. The page adds
  a dashed line at that height and the "n / 6" count in the quiet top-left corner.

Measured from this file; **measure again if the picture is replaced**:
- `BUILDING.levels` (% of the picture's height from the top): ground line 97.9, then the top of
  the slab above each floor: 79.9, 66.4, 52.6, 38.2, 23.2, and 0 for the sixth so the roof and
  its sign come with it. (Slab rows in pixels: 818, 680, 539, 391, 238; roof slab 60; ground
  line 1004.)
- `.wz-rise { --l; --r }`: the building's left and right edges, 33.2% and 90.8% of the width.
- `.wz-rise { background }`: the picture's edge colour, `#F0F3FB`. The scene is 3 : 2 like the
  picture and at most 680px wide so the screen fits one view.

Three scenes cut from this picture head the "Sonraki adımlar" tiles on D-5b ("Şirketiniz
kuruldu"), so the two screens share one drawing. **Cut them again if the picture is replaced**
(pixel boxes left, top, right, bottom in the 1536×1024 file):

| File | Floor | Box | Tile |
| --- | --- | --- | --- |
| `public/assets/illustrations/next-bank.webp` | 4, the bank | 628, 412, 1010, 536 | Sermayenin %25’ini yatırınız |
| `public/assets/illustrations/next-invoice.webp` | 2, the tax office | 730, 702, 1095, 815 | İlk e-faturanızı kesiniz |
| `public/assets/illustrations/next-advisor.webp` | 6, the handshake | 742, 86, 1152, 235 | Mali müşavirinizle tanışınız |

A replacement must keep: flat straight-on cutaway, six floors, the building's column clear of
other things, top-left corner quiet, no text, no shadows; modern İstanbul only, nothing Ottoman
or historic.

Tried and rejected by the owner on 2026-11-17 before this: a drawn sheet with six seals; a
"take-off" scene (night airport, a plane rolling past six runway lights), whose two pictures are
kept, unused, as `art/source/takeoff-bg.webp` and `art/source/takeoff-plane.webp`; and a first
generated building that was a plain glass facade without people.

## The wizard's illustration style, and the prompts for it

On 2026-11-17 the owner chose the look of the building picture for the wizard's explanatory rows
("what if we do everything like this? i really like that"). The landing page and the sign-in
screens keep their dotted engravings; this style is for the wizard only. (Since 2026-11-19 the
landing's five-step story uses this style too; see "Landing steps".)

What made the building work, and what every further picture must repeat: **one image per set of
steps, drawn as a cutaway building with one floor per step.** The model then draws all scenes of
a set in one hand (same people, same line, same colours), and each floor is cut out as a wide
strip for its tile. Asking for separate pictures gives pictures that do not match.

Style paragraph (goes at the start of every prompt, unchanged):

```
Flat vector illustration in a clean editorial style. A cutaway (dollhouse section) front view
of a modern office building, perfectly straight-on with no perspective, the front wall removed
so every floor is an open, softly lit room. All floors exactly the same height, floor slabs of
equal thickness in deep navy, navy columns at the left and right edges only. Each floor shows
one calm scene with one or two simple figures drawn as flat shapes without facial features,
all at the same scale, with simple geometric furniture. Palette limited to deep navy #061262,
mid blue #9DB6FF, pale blues #DCE6FF and #EFF4FF, white, plus one soft red accent used once
per floor on a single object. Background one flat colour, exactly #F0F3FB. No text, no
letters, no numbers, no logos, no shadows, no gradients, no textures.
```

**When cutting a floor out, stay 4 to 5 px inside the slabs above and below it.** The first cut
on D-1a started on the slab's soft edge and left a dark line along the top of the tiles, which
the owner noticed at once.

**The other way, which the owner asked about ("why we just dont create it?"): one image per
tile, no building, no cutting.** It gives a picture of exactly the tile's shape with no edges to
trim. The price is that separately generated pictures drift apart (a different robot, other
blues) unless an existing picture is attached as a style reference. Single-scene style
paragraph for that:

```
Flat vector illustration in a clean editorial style. One wide interior scene seen perfectly
straight-on with no perspective: a softly lit pale-blue room that fills the whole image edge
to edge, with no frame, no border, no floor slab and no ceiling line. One or two simple
figures drawn as flat shapes without facial features, simple geometric furniture, generous
empty wall around them. Palette limited to deep navy #061262, mid blue #9DB6FF, pale blues
#DCE6FF and #EFF4FF, white, plus one soft red accent on a single object. No text, no letters,
no numbers, no logos, no shadows, no gradients, no textures. Wide image, 1536x640. Match the
attached reference image exactly in drawing style, colours and characters.
```

followed by one scene from the table below, and with `art/source/set-upload.webp` or the
building picture attached as the reference.

**The way chosen for the remaining sets (owner, 2026-11-17: "lets do it like that but no
borders between the images"): one image per set, the scenes stacked in equal bands on one
continuous background, with nothing drawn between them.** It keeps a set in one hand like the
building did, and leaves no slab or column to trim: each band is cut at exact thirds (or
quarters) of the height. Band style paragraph:

```
Flat vector illustration in a clean editorial style. One image containing several separate
wide scenes stacked vertically in equal horizontal bands, each band exactly the same height.
The same flat pale-blue background #DCE6FF continues behind all of them from edge to edge:
no lines, borders, frames, floor slabs, columns, dividers or panels between or around the
bands. Leave clear empty background above and below each scene so nothing crosses from one
band into the next. Every scene is seen perfectly straight-on with no perspective and shows
one or two simple figures drawn as flat shapes without facial features, all at the same
scale, with simple geometric furniture. Palette limited to deep navy #061262, mid blue
#9DB6FF, pale blue #EFF4FF, white, plus one soft red accent used once per scene on a single
object. No text, no letters, no numbers, no logos, no shadows, no gradients, no textures.
```

followed by "Three bands, image 1536x1920." (or "Four bands, image 1536x2560.") and the scenes
"from top to bottom", as listed in the table below. When it arrives: check that the bands are
equal and nothing crosses a boundary, cut at the boundaries, and set the tiles' header colour
(`.wz-tiles .pic { background }`) to the picture's background.

The sets (all generated and placed as of 2026-11-18; the table is the record of what each is and where its cuts are):

| Set | Screen and row | Floors, from the top | Image |
| --- | --- | --- | --- |
| Upload — **done** | D-1a "Dosyayı yükledikten sonra" | the assistant robot reading slides; details moving from the slides into a form; the founder checking the form | generated in the band style on 2026-11-17 (the model made it 1254×1254, with uneven gaps, so the bands were measured, not cut at thirds); kept as `art/source/set-upload.webp`; cut into `public/assets/illustrations/upload-read.webp` (box 138, 136, 1098, 466), `upload-fill.webp` (138, 500, 1098, 830), `upload-check.webp` (138, 857, 1098, 1187); each floats in its tile header on the picture's background `#E8EFFE` (`.wz-after`) |
| Identity — **done** | D-2a "Doğrulama için gerekenler" | a passport held open; a laptop camera and a phone on a stand; a bright room by a window | generated 2026-11-17 (the model made it portrait, 916×1717, with large nearly square scenes); kept as `art/source/set-identity.webp`; **each scene cut whole**, one box size for all (740×500): `public/assets/illustrations/id-passport.webp` (box 83, 44, 823, 544), `id-camera.webp` (87, 640, 827, 1140), `id-light.webp` (87, 1217, 827, 1717); shown whole but small, fitted by height into short headers (2.5 : 1, `.wz-need`, header colour `#D3E0FE`). Tried and rejected by the owner first: close-ups cut from the scenes ("they are not showing correctly"), then the whole scenes filling tall headers ("too big") |
| Call, before — **no set needed** | D-4a "Görüşme için gerekenler" | — | the owner pointed out that the call needs the same three things as the identity check (passport, camera, a bright room), so this row **uses the identity set's three pictures** (`id-passport`, `id-camera`, `id-light`) with its own texts |
| Call, during — **done** | D-4a "Görüşme sırasında" (the camera-preview view) | passport shown to an operator on screen; face matched to the passport photo; spoken consent; the certificate with its seal | generated 2026-11-18 (971×1619, four scenes one above the other, each on its own white desk line; scenes 2, 3 and 4 touch, so the cuts follow the desk legs); kept as `art/source/set-call.webp`; cut whole into `public/assets/illustrations/call-show.webp` (box 70, 17, 900, 429), `call-match.webp` (70, 457, 900, 833), `call-consent.webp` (70, 833, 900, 1211), `call-sign.webp` (70, 1211, 900, 1619); fitted by height into short headers (2.6 : 1, `.wz-during`, header colour `#D4E2FD`) |

Already done from the building picture itself: D-5a (the whole building) and D-5b's "Sonraki
adımlar" (three floors cut out, see above). The full prompts as given to the owner are in
`PROJECT_LOG.md`, 2026-11-17 thirty-eighth entry.

**D-5b "Sonraki adımlar" — done 2026-11-18.** The owner generated the set below (1295×1214,
three scenes on `#D3E0FE`, well apart); kept as `art/source/set-next.webp`. Each scene is cut
whole into the same 3.2 : 1 box, 1248×390, centred on the scene: `next-bank.webp` (box 22, 43,
1270, 433), `next-invoice.webp` (22, 449, 1270, 839), `next-advisor.webp` (22, 834, 1270, 1224;
the last 10 px below the source are filled with the background colour). Header colour
`.wz-next .pic { background: #D3E0FE }`. The prompt it came from:

**The prompt (owner, 2026-11-18: "can you give me better prompts?").**
The floors cut from the building are small (about 380×125 px, blurry on a 2× screen) and the
3.2 : 1 headers crop the figures' heads. New set, band style, written for that header shape:
each band 3.2 : 1, figures small and in the middle with room above their heads, the bottom
corners left empty because the step number (bottom left) and the "30 gün içinde" / "Hazır" /
"Önerilir" tag (bottom right) sit there. Prompt, after the band style paragraph above:

```
Three bands, image 1536x1440, each band 1536x480 (3.2 times wider than tall). Inside every
band: the scene sits in the middle 60% of the width; the tallest head stays well below the
top edge, with at least a fifth of the band's height of empty wall above it; figures are
shown full length, standing or seated, about two thirds of the band's height tall; the
bottom-left and bottom-right corners of every band are empty floor and wall, nothing drawn
there. The same founder appears in all three bands: a man with short dark hair in a navy
suit and white shirt, drawn identically each time.
From top to bottom:
1. A bank branch. Behind a low navy counter stands a bank clerk with short grey hair, white
   shirt and navy waistcoat. On the other side the founder stands and hands over a single
   soft red bank card. On the back wall a round mid-blue vault door and one tall window.
2. The founder's own office. He sits at a simple white desk with an open laptop. From the
   laptop screen a sheet of white paper with a few grey lines folds into a paper plane and
   flies off to the right; the paper plane is the soft red accent. A potted plant and a
   shelf with two folders behind him.
3. A video call with an accountant. The founder sits at a desk facing a large wall-mounted
   screen; on the screen, head and shoulders, a woman with dark hair in a bun and a mid-blue
   jacket, both raising a hand to greet each other. A round wall clock beside the screen,
   one soft red mug on the desk.
```

Attach the building picture or `art/source/set-call.webp` as the style reference. When it
arrives: cut at thirds of the height (or at the measured gaps if the model does not keep the
size), save as `next-bank.webp`, `next-invoice.webp`, `next-advisor.webp` at full width, and
set `.wz-next .pic { background }` to the picture's background if it differs from `#DCE6FF`.
