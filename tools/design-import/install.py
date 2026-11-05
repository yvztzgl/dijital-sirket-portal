"""Install converted templates into the Angular app and generate screen components + registry."""
import json, os, re, sys

OUT, APP, REG = sys.argv[1], sys.argv[2], sys.argv[3]

# The live app's screens are data-bound by hand (store bindings, real inputs, actions) after this
# import. Writing over src/app would wipe that, so by default refuse and ask for a scratch folder
# to diff against instead.
if os.path.isdir(os.path.join(APP, 'core')) and '--force' not in sys.argv:
    sys.exit('Refusing to overwrite data-bound screens in %s. Pass an empty output folder to diff '
             'against (e.g. /tmp/design-ref), or --force to overwrite.' % APP)
registry = json.load(open(REG))

VALS_KEYS = {
    'giris': 'email onEmail showPw pwType pwLabel togglePw remember toggleRemember trust steps paths foreign resident consents cantSubmit ctaBg cta otp'.split(),
    'topbar': 'guest signedIn guestNote guestAction guestHref'.split(),
    'aicard': 'title reason'.split(),
    'stepper': 'steps compact full cur curLabel curSub'.split(),
    'sidepanel': 'height radius tabs isAi isDocs isLog ctxLabel bubbles chips groups noDocs logs'.split(),
}
DATA = {'giris': 'GirisData', 'karsilama': 'KarsilamaData', 'uygunluk': 'UygunlukData', 'eimza': 'EimzaData'}
GROUP_TITLES = {
    'giris': 'Giriş ve kayıt', 'karsilama': 'Karşılama ve Adım 1 — Sunum',
    'uygunluk': 'Adım 2–3 — Uygunluk ve ödeme', 'eimza': 'Adım 4–5 — e-İmza ve kuruluş',
}
IMPORTS = {
    'TopBar': "import { TopBar } from '../../shared/top-bar';",
    'Stepper': "import { Stepper } from '../../shared/stepper';",
    'SidePanel': "import { SidePanel } from '../../shared/side-panel';",
    'AiCard': "import { AiCard } from '../../shared/ai-card';",
    'RouterLink': "import { RouterLink } from '@angular/router';",
    'DotEngraving': "import { DotEngraving } from '../../shared/dot-engraving';",
}


# Engravings render as animated stippling (<app-dot-engraving>, fed by art/dots.py --map density
# maps): swap the design's <img> for the component, drop the invert/blend filters the design used on
# raw scans and the img-only sizing, and set a per-image opacity.
DOT_OPACITY = {'hero': '.6', 'yali': '.5', 'login': '.55', 'register': '.55'}


def dotted(tpl):
    def fix(m):
        name, style = m.group(1), m.group(2)
        align = 'bottom' if 'object-position:center bottom' in style else 'center'
        style = re.sub(r'filter:[^;]*;mix-blend-mode:screen;', '', style)
        style = re.sub(r'opacity:[\d.]+', 'opacity:' + DOT_OPACITY[name], style)
        style = re.sub(r';width:100%;height:100%;object-fit:cover(;object-position:center bottom)?$', '', style)
        return ('<app-dot-engraving src="/assets/engravings/%s-map.png" align="%s" style="%s"></app-dot-engraving>'
                % (name, align, style))
    return re.sub(r'<img src="/assets/engravings/(\w+)-dots\.png"[^>]*?style="([^"]*)">', fix, tpl)


def cta_band(tpl):
    """Welcome footer: keep the yalı art inside the CTA block (not behind the legal bar) and stack
    the button under the heading."""
    footer = ('<footer style="position:relative;isolation:isolate;overflow:hidden;background:linear-gradient'
              '(160deg,#0F2557 0%,#132E6B 55%,#1A3C86 100%);color:#fff">')
    cta = '<div style="padding:104px 80px 120px;display:flex;align-items:flex-end;gap:48px">'
    f = tpl.index(footer)
    a = tpl.index('<div aria-hidden="true"', f)
    art = tpl[a:tpl.index('</div>', a) + len('</div>')]
    old = tpl[f:tpl.index(cta) + len(cta)]
    new = ('<footer style="background:linear-gradient(160deg,#0F2557 0%,#132E6B 55%,#1A3C86 100%);color:#fff">\n'
           '        <div style="position:relative;isolation:isolate;overflow:hidden;padding:104px 80px 120px;'
           'display:flex;flex-direction:column;align-items:flex-start;gap:32px">\n          ' + art.strip())
    tpl = tpl.replace(old, new)
    return tpl.replace('<h2 style="flex:1;margin:0;max-width:720px;font:400 44px/54px',
                       '<h2 style="margin:0;max-width:720px;font:400 44px/54px', 1)


def with_lets(tpl, keys):
    used = [k for k in keys if re.search(r'(?<![\w.$])%s\b' % re.escape(k), tpl)]
    lets = ''.join('@let %s = vals().%s;\n' % (k, k) for k in used)
    return lets + tpl


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w').write(text)


for comp in ['topbar', 'stepper', 'sidepanel', 'aicard']:
    tpl = open(os.path.join(OUT, 'shared', comp + '.html')).read()
    if comp == 'sidepanel':
        tpl = tpl.replace('<button role="tab" ', '<button role="tab" type="button" (click)="activeTab.set(t.id)" ')
    write(os.path.join(APP, 'shared', comp + '.html'), with_lets(tpl, VALS_KEYS[comp]))

for r in registry:
    g, sid = r['group'], r['id']
    tpl = open(os.path.join(OUT, 'screens', g, sid + '.html')).read()
    uses = list(r['uses'])
    if sid == 'd4d':
        # Content-only frame in the design: place it in the regular step-4 page chrome.
        tpl = ('<div style="min-height:100vh;background:#F4F6FB;display:flex;flex-direction:column">\n'
               '<app-top-bar></app-top-bar>\n'
               '<div style="padding:20px 32px 0"><app-stepper [current]="4"></app-stepper></div>\n'
               '<div style="padding:24px 32px 56px;display:flex;justify-content:center">\n' + tpl + '</div>\n</div>\n')
        uses += ['TopBar', 'Stepper']
    if sid == 'd00':
        # Welcome hero always fills the viewport (design had a fixed 760px min-height).
        tpl = tpl.replace('padding:32px 80px 0;min-height:760px;display:flex',
                          'padding:32px 80px 0;height:100vh;height:100dvh;box-sizing:border-box;display:flex')
    if sid == 'd00':
        tpl = cta_band(tpl)
    if sid == 'd00':
        # Hero headline: sans lines with a serif-italic accent, staggered reveal and a live dot
        # (classes styled in src/styles.scss).
        for a, b in [('<span style="font:600 12px/16px \'IBM Plex Sans\',sans-serif;letter-spacing:.12em;color:#9DB6FF">TEK PAY SAHİPLİ ANONİM ŞİRKET · TAMAMEN ÇEVRİMİÇİ</span>', '<span class="hero-line" style="display:inline-flex;align-items:center;gap:10px;font:600 12px/16px \'IBM Plex Sans\',sans-serif;letter-spacing:.12em;color:#9DB6FF"><span class="live-dot" aria-hidden="true"></span>DÜNYANIN HER YERİNDEN - ZAHMETSİZ KURULUM</span>'), ('<h1 style="margin:0;font:600 60px/66px \'IBM Plex Sans\',sans-serif;letter-spacing:-.022em;color:#fff;text-wrap:balance">Türkiye\'de şirketinizi tek başvuruyla dijital kurun.</h1>', '<h1 class="hero-title" style="margin:0;font:600 64px/70px \'IBM Plex Sans\',sans-serif;letter-spacing:-.025em;color:#fff"><span class="hero-line">Türkiye\'de</span><span class="hero-line"><em class="hero-accent">Dijital Şirketinizi</em></span><span class="hero-line">Kurun</span></h1>')]:
            tpl = tpl.replace(a, b)
    if sid in ('d0a', 'd0b'):
        # Login / register: full-height 50/50 split; form column content stays 480px wide.
        for a, b in [('display:grid;grid-template-columns:minmax(0,1fr) 640px;min-height:900px;align-items:stretch', 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:100vh;min-height:100dvh;align-items:stretch'), ('position:relative;background:#fff;padding:112px 80px 40px;display:flex', 'position:relative;background:#fff;padding:112px max(80px, calc((100% - 480px) / 2)) 40px;display:flex')]:
            tpl = tpl.replace(a, b)
    if sid in ('d0a', 'd0b'):
        # Center the form vertically; pin the legal note to the bottom of the column.
        for a, b in [('position:relative;background:#fff;padding:112px max(80px, calc((100% - 480px) / 2)) 40px;display:flex;flex-direction:column;gap:20px', 'position:relative;background:#fff;padding:112px max(80px, calc((100% - 480px) / 2)) 112px;display:flex;flex-direction:column;justify-content:center;gap:20px'), ('<span style="margin-top:auto;font:400 12px/17px', '<span style="position:absolute;left:max(80px, calc((100% - 480px) / 2));right:max(80px, calc((100% - 480px) / 2));bottom:40px;font:400 12px/17px')]:
            tpl = tpl.replace(a, b)
    if sid in ('d0a', 'd0b'):
        # Left panel: logo pinned top, copy centred vertically, engraving anchored to the bottom.
        for a, b in [('background:linear-gradient(160deg,#0F2557 0%,#132E6B 55%,#1A3C86 100%);padding:40px 64px 56px;display:flex;flex-direction:column;gap:20px;color:#fff;overflow:hidden;isolation:isolate', 'position:relative;background:linear-gradient(160deg,#0F2557 0%,#132E6B 55%,#1A3C86 100%);padding:112px 64px 112px;display:flex;flex-direction:column;justify-content:center;gap:20px;color:#fff;overflow:hidden;isolation:isolate'), ('display:flex;align-items:center;gap:12px;margin-bottom:auto;padding-bottom:40px', 'position:absolute;top:40px;left:64px;right:64px;display:flex;align-items:center;gap:12px'), ('position:relative;flex:1;min-height:300px;margin:16px -64px -56px;min-height:340px', 'position:absolute;left:0;right:0;bottom:0;height:55%;z-index:-1;pointer-events:none')]:
            tpl = tpl.replace(a, b)
    if sid in ('d0a', 'd0b'):
        # Engravings are hosted locally, cropped to the artwork (the Wikimedia scans include blank page
        # margins that read as a dark strip once inverted); anchor them to the bottom edge.
        tpl = re.sub(r'src="https://commons\.wikimedia\.org/[^"]*"',
                     'src="/assets/engravings/%s-dots.png"' % ('login' if sid == 'd0a' else 'register'), tpl)
        tpl = tpl.replace(';width:100%;height:100%;object-fit:cover">',
                          ';width:100%;height:100%;object-fit:cover;object-position:center bottom">')
    tpl = dotted(tpl)
    if '<app-dot-engraving' in tpl:
        uses.append('DotEngraving')
    if g == 'giris':
        tpl = with_lets(tpl, VALS_KEYS['giris'])
    write(os.path.join(APP, 'screens', g, sid + '.html'), tpl)
    cls = 'Screen' + sid[0].upper() + sid[1:]
    imps = sorted(set(uses))
    ts = ["import { ChangeDetectionStrategy, Component } from '@angular/core';"]
    ts += [IMPORTS[u] for u in imps]
    ts.append("import { %s } from '../data/%s.data';" % (DATA[g], g))
    ts.append('')
    ts.append('/** %s — %s. %s */' % (r['code'], r['title'], r['desc']))
    ts.append('@Component({')
    ts.append("  selector: 'app-screen-%s'," % sid)
    if imps:
        ts.append('  imports: [%s],' % ', '.join(imps))
    ts.append("  templateUrl: './%s.html'," % sid)
    ts.append("  host: { style: 'display:block' },")
    ts.append('  changeDetection: ChangeDetectionStrategy.OnPush,')
    ts.append('})')
    ts.append('export class %s extends %s {}' % (cls, DATA[g]))
    write(os.path.join(APP, 'screens', g, sid + '.ts'), '\n'.join(ts) + '\n')
    r['cls'] = cls

lines = [
    "import { Routes } from '@angular/router';",
    "import { flowGuard } from '../core/flow.guard';",
    '',
    '/** One entry per designed screen, in wizard order. Generated from the Claude Design canvases. */',
    'export interface ScreenInfo {',
    '  id: string;',
    '  code: string;',
    '  title: string;',
    '  desc: string;',
    '  path: string;',
    '  group: string;',
    '}',
    '',
    'export const SCREEN_GROUPS: { id: string; title: string }[] = [',
]
for g in ['giris', 'karsilama', 'uygunluk', 'eimza']:
    lines.append("  { id: '%s', title: %s }," % (g, json.dumps(GROUP_TITLES[g], ensure_ascii=False).replace('"', "'")))
lines.append('];')
lines.append('')
lines.append('export const SCREENS: ScreenInfo[] = [')
for r in registry:
    lines.append('  { id: %s, code: %s, title: %s, desc: %s, path: %s, group: %s },' % tuple(
        "'" + str(v).replace("\\", "\\\\").replace("'", "\\'") + "'" for v in (r['id'], r['code'], r['title'], r['desc'], r['route'], r['group'])))
lines.append('];')
lines.append('')
lines.append('export const screenRoutes: Routes = [')
for r in registry:
    lines.append("  {\n    path: '%s',\n    title: '%s · Dijital Şirket Platformu',\n    data: { screen: '%s' },\n    canActivate: [flowGuard],\n    loadComponent: () => import('./%s/%s').then((m) => m.%s),\n  }," % (
        r['route'], r['title'].replace("'", "\\'"), r['id'], r['group'], r['id'], r['cls']))
lines.append('];')
write(os.path.join(APP, 'screens', 'screens.ts'), '\n'.join(lines) + '\n')
print('ok', len(registry))
