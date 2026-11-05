"""Convert Claude Design .dc.html markup into Angular templates.

Usage: python3 -I convert.py <design_dir> <angular_src_app_dir>
"""
import json, os, re, sys

SRC, OUT = sys.argv[1], sys.argv[2]

ROUTES = {
    'd0a': ('giris', 'Giriş'), 'd0b': ('kayit', 'Kayıt'),
    'd0c': ('eposta-dogrulama', 'E-posta doğrulama'), 'd0d': ('sifre-sifirlama', 'Şifre sıfırlama'),
    'd00': ('', 'Karşılama'), 'd1a': ('sunum', 'Sunum yükleme'), 'd1b': ('sunum/tarama', 'AI taraması'),
    'd1c': ('sunum/inceleme', 'Bulunanları inceleyin'), 'rejection': ('sunum/mersis-ret', 'MERSİS ret'),
    'd2a': ('uygunluk', 'Uygunluk'), 'd2b': ('uygunluk/sonuc', 'Uygunluk tamamlandı'),
    'd2c': ('uygunluk/manuel-inceleme', 'Manuel inceleme'), 'd3a': ('odeme', 'Ödeme'),
    'd3b': ('odeme/3d-secure', '3D Secure'), 'd4a': ('e-imza', 'e-İmza · görüşme öncesi'),
    'd4b': ('e-imza/gorusme', 'e-İmza · görüşme'), 'd4c': ('e-imza/hazir', 'e-İmza hazır'),
    'd4d': ('e-imza/tc-vatandasi', 'e-İmza · TC vatandaşı'), 'd5a': ('kurulus', 'Şirketiniz kuruluyor'),
    'd5b': ('kurulus/tamamlandi', 'Şirketiniz kuruldu'),
}

LINKS = {
    '#d0a': '/giris', '#d0b': '/kayit', '#d0d': '/sifre-sifirlama',
    'Ekranlar 0 - Giriş ve Kayıt.dc.html': '/giris',
    'Ekranlar 0 - Giriş ve Kayıt.dc.html#d0a': '/giris',
    'Ekranlar 0 - Giriş ve Kayıt.dc.html#d0b': '/kayit',
    'Ekranlar 1 - Karşılama ve Sunum.dc.html': '/',
    'Ekranlar 2 - Uygunluk ve Ödeme.dc.html': '/uygunluk',
    'Ekranlar 3 - e-İmza ve Kuruluş.dc.html': '/e-imza',
}

COMPONENTS = {
    'TopBar': ('app-top-bar', 'TopBar'), 'Stepper': ('app-stepper', 'Stepper'),
    'SidePanel': ('app-side-panel', 'SidePanel'), 'AiCard': ('app-ai-card', 'AiCard'),
}
INPUT_ALIAS = {'title': 'cardTitle'}
PROP_ATTRS = {'checked', 'disabled', 'type', 'value'}

TOKEN = re.compile(r'<!--.*?-->|<[^>]+>|[^<]+', re.S)
_ATTR = re.compile(r'([^\s=/>]+)(?:=("[^"]*"))?')


def parse_attrs(body):
    return [(k, None if v == '' else v[1:-1]) for k, v in _ATTR.findall(body)]
EXPR = re.compile(r'\{\{\s*(.+?)\s*\}\}')

ASSET_MAP = {
    'assets/engravings/istanbul-hero.png': '/assets/engravings/hero-dots.png',
    'assets/engravings/bosphorus-yali.png': '/assets/engravings/yali-dots.png',
}


def camel(s):
    return re.sub(r'-(\w)', lambda m: m.group(1).upper(), s)


def escape_text(t):
    out, i = [], 0
    for m in EXPR.finditer(t):
        out.append(_esc(t[i:m.start()]))
        out.append('{{ ' + m.group(1) + ' }}')
        i = m.end()
    out.append(_esc(t[i:]))
    return ''.join(out)


def _esc(s):
    return s.replace('@', '&#64;').replace('{', '&#123;').replace('}', '&#125;')


def to_literal(v):
    return '`' + EXPR.sub(lambda m: '${' + m.group(1) + '}', v) + '`'


def convert(markup, used):
    out, stack = [], []
    for tok in TOKEN.findall(markup):
        if tok.startswith('<!--'):
            continue
        if not tok.startswith('<'):
            out.append(escape_text(tok))
            continue
        if tok.startswith('</'):
            name = tok[2:-1].strip()
            if name in ('sc-for', 'sc-if'):
                out.append('}')
            elif name == 'dc-import':
                out.append('</' + stack.pop() + '>')
            elif name in ('image-slot', 'input', 'img', 'br', 'hr', 'meta', 'link', 'source'):
                pass  # void elements have no end tag in Angular templates
            else:
                out.append(tok)
            continue
        m = re.match(r'<([a-zA-Z][\w-]*)', tok)
        name = m.group(1)
        selfclose = tok.endswith('/>')
        body = tok[m.end():-2 if selfclose else -1]
        attrs = parse_attrs(body)
        if name == 'sc-for':
            a = dict(attrs)
            out.append('@for (%s of %s; track $index) {' % (a['as'], EXPR.fullmatch(a['list']).group(1)))
            continue
        if name == 'sc-if':
            a = dict(attrs)
            out.append('@if (%s) {' % EXPR.fullmatch(a['value']).group(1))
            continue
        if name == 'dc-import':
            a = dict(attrs)
            sel, cls = COMPONENTS[a.pop('name')]
            used.add(cls)
            stack.append(sel)
            parts = []
            for k, v in attrs:
                if k in ('name',) or k.startswith('hint-'):
                    continue
                k = INPUT_ALIAS.get(k, camel(k))
                mm = EXPR.fullmatch(v)
                parts.append('[%s]="%s"' % (k, mm.group(1)) if mm else '%s="%s"' % (k, v))
            out.append('<%s %s>' % (sel, ' '.join(parts)))
            continue
        if name == 'image-slot':
            a = dict(attrs)
            src = ASSET_MAP.get(a['src'], a['src'])
            out.append('<img src="%s" alt="" aria-hidden="true" decoding="async" style="%s;width:100%%;height:100%%;object-fit:cover">'
                       % (src, a['style']))
            continue
        parts = []
        has_click = False
        for k, v in attrs:
            if v is None:
                parts.append(k)  # boolean attribute
                continue
            if '{{' in v:
                mm = EXPR.fullmatch(v)
                if k in ('onClick', 'onChange', 'onInput'):
                    evt = {'onClick': 'click', 'onChange': 'input' if name in ('input', 'textarea') and 'checkbox' not in body else 'change', 'onInput': 'input'}[k]
                    arg = '$event' if evt == 'input' else ''
                    parts.append('(%s)="%s(%s)"' % (evt, mm.group(1), arg))
                elif mm and k in PROP_ATTRS:
                    parts.append('[%s]="%s"' % (k, mm.group(1)))
                elif mm and k == 'href':
                    used.add('RouterLink')
                    parts.append('[routerLink]="%s"' % mm.group(1))
                elif mm:
                    parts.append('[attr.%s]="%s"' % (k, mm.group(1)))
                else:
                    parts.append('[attr.%s]="%s"' % (k, to_literal(v)))
                continue
            if k == 'href' and name == 'a':
                if v in LINKS:
                    used.add('RouterLink')
                    parts.append('routerLink="%s"' % LINKS[v])
                    continue
                if v == '#d00-adimlar':
                    used.add('RouterLink')
                    parts.append('routerLink="/" fragment="d00-adimlar"')
                    continue
                if v == '#':
                    has_click = True
                    parts.append('href="#"')
                    continue
            parts.append('%s="%s"' % (k, v))
        if has_click:
            parts.append('(click)="$event.preventDefault()"')
        out.append('<%s%s%s>' % (name, ''.join(' ' + p for p in parts), ' /' if selfclose else ''))
    return ''.join(out)


def balanced(s, start):
    tag = re.match(r'<([a-z]+)', s[start:]).group(1)
    depth = 0
    for t in re.finditer(r'<(/?)%s\b' % tag, s[start:]):
        depth += -1 if t.group(1) else 1
        if depth == 0:
            close = s.index('>', start + t.start())
            return s[start:close + 1]
    raise ValueError('unbalanced')


def strip_text(h):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', h)).strip()


def frame_style(tag):
    def fix(m):
        st = m.group(1)
        st = re.sub(r'width:1440px;?', 'width:100%;min-height:100vh;', st)
        st = re.sub(r'border-radius:12px;?', '', st)
        st = re.sub(r'box-shadow:[^;"]*(;|$)', '', st)
        st = st.replace('overflow:hidden', 'overflow:clip')
        return 'style="%s"' % st.rstrip(';')
    return re.sub(r'style="([^"]*)"', fix, tag, count=1)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(text)


registry = []
for gi, gname in enumerate(['giris', 'karsilama', 'uygunluk', 'eimza']):
    s = open(os.path.join(SRC, 'raw%d.html' % gi)).read()
    for m in re.finditer(r'<div id="(d[0-9a-z]+|rejection)"', s):
        sid = m.group(1)
        blk = balanced(s, m.start())
        fi = blk.index('data-screen-label')
        fstart = blk.rfind('<', 0, fi)
        caption = strip_text(blk[:fstart])
        code, rest = caption.split(' ', 1)
        frame = balanced(blk, fstart)
        open_end = frame.index('>') + 1
        frame = frame_style(frame[:open_end]) + frame[open_end:]
        used = set()
        tpl = convert(frame, used)
        route, title = ROUTES[sid]
        desc = rest[len(title):].strip() if rest.startswith(title) else rest
        # caption title is the 2nd span; recover from raw spans
        spans = re.findall(r'<span[^>]*>(.*?)</span>', blk[:fstart], re.S)
        if len(spans) >= 3:
            title, desc = strip_text(spans[1]), strip_text(spans[2])
        write(os.path.join(OUT, 'screens', gname, sid + '.html'), tpl + '\n')
        registry.append({'id': sid, 'code': code, 'title': title, 'desc': desc, 'route': route,
                         'group': gname, 'uses': sorted(used)})

for comp in ['topbar', 'stepper', 'sidepanel', 'aicard']:
    s = open(os.path.join(SRC, 'c_%s.html' % comp)).read()
    body = re.search(r'<x-dc>(.*)</x-dc>', s, re.S).group(1)
    body = re.sub(r'<helmet>.*?</helmet>', '', body, flags=re.S).strip()
    used = set()
    write(os.path.join(OUT, 'shared', comp + '.html'), convert(body, used) + '\n')

print(json.dumps(registry, ensure_ascii=False, indent=1))
