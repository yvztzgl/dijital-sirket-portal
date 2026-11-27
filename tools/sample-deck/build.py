"""Builds the sample pitch deck in the Terminal Şirket deck format (src/app/core/reference/deck-format.json).

Outputs, all under public/assets/samples/:
  lumora-analytics-pitch.pptx   the sample deck founders can download from D-1a
  lumora-analytics-pitch.pdf    the same deck as PDF (needs LibreOffice)
  format/NN.webp                one small picture per slide, shown in the deck format dialog

The slide titles and the "Terminal AI okur" chips come from deck-format.json, so the deck and the
dialog cannot drift apart. The values on the slides are the sample values in that file; the extra
presentational content (stats, steps, tables) is written here.

Usage (from the repository root, Python 3.10+):
  python3 -m venv .venv-deck && .venv-deck/bin/pip install python-pptx pymupdf pillow
  .venv-deck/bin/python tools/sample-deck/build.py
LibreOffice is looked up at /Applications/LibreOffice.app or as `soffice` on PATH; without it only
the PPTX is written.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).resolve().parents[2]
FORMAT = json.loads((ROOT / 'src/app/core/reference/deck-format.json').read_text(encoding='utf-8'))
OUT = ROOT / 'public/assets/samples'
PPTX = OUT / 'lumora-analytics-pitch.pptx'

# Lumora's own (fictional) brand: the deck is the founder's file, not portal UI.
INK = RGBColor(0x0B, 0x3B, 0x4C)
TEXT = RGBColor(0x1F, 0x33, 0x3D)
MUTED = RGBColor(0x5E, 0x72, 0x7B)
LINE = RGBColor(0xD9, 0xE4, 0xE8)
PANEL = RGBColor(0xEC, 0xF4, 0xF6)
ACCENT = RGBColor(0xF2, 0xA1, 0x41)
CODE = RGBColor(0x1C, 0x7C, 0x8C)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
SERIF = 'Georgia'
SANS = 'Arial'

SLIDES = {s['no']: s for g in FORMAT['groups'] for s in g['slides']}
TOTAL = len(SLIDES)
FOOT = 'Lumora Analytics · Yatırımcı sunumu · Kasım 2026'


def sample(no: int, label: str) -> str:
    return next(f['sample'] for f in SLIDES[no]['fields'] if f['label'] == label)


# ------------------------------------------------------------------------------------ helpers

def text(slide, x, y, w, h, value, size=14, color=TEXT, bold=False, font=SANS, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, italic=False, spacing=None):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    for i, line in enumerate(value.split('\n')):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        if spacing:
            p.line_spacing = spacing
        r = p.add_run()
        r.text = line
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.italic = italic
        r.font.name = font
        r.font.color.rgb = color
    return box


def rect(slide, x, y, w, h, fill, line=None, shape=MSO_SHAPE.RECTANGLE, radius=None):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    # Drop the theme style (it carries a shadow and default colours); everything is set below.
    style = s._element.find('{http://schemas.openxmlformats.org/presentationml/2006/main}style')
    if style is not None:
        s._element.remove(style)
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(1)
    if radius is not None and shape == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = radius
    return s


def hline(slide, x, y, w, color=LINE):
    rect(slide, x, y, w, 0.012, color)


def chrome(slide, no: int):
    """Page tag, title, footer and the chip naming what Terminal AI reads from this page."""
    spec = SLIDES[no]
    text(slide, 0.7, 0.45, 4, 0.3, f'{no:02d} / {TOTAL}', 11, MUTED, font=SANS)
    text(slide, 0.7, 0.72, 11.5, 0.8, spec['title'], 34, INK, bold=True, font=SERIF)
    text(slide, 0.7, 6.95, 6, 0.3, FOOT, 10, MUTED)
    labels = ', '.join(f['label'].lower() if i else f['label'] for i, f in enumerate(spec['fields']))
    chip_w = min(7.2, 1.9 + len(labels) * 0.075)
    chip = rect(slide, 12.0 - chip_w, 6.86, chip_w, 0.38, PANEL, LINE, MSO_SHAPE.ROUNDED_RECTANGLE, 0.5)
    tf = chip.text_frame
    tf.margin_left = tf.margin_right = Inches(0.14)
    tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    r1 = p.add_run()
    r1.text = 'Terminal AI okur: '
    r2 = p.add_run()
    r2.text = labels
    for r, b in ((r1, True), (r2, False)):
        r.font.size = Pt(10)
        r.font.bold = b
        r.font.name = SANS
        r.font.color.rgb = INK
    text(slide, 12.25, 6.95, 0.4, 0.3, str(no), 10, MUTED, align=PP_ALIGN.RIGHT)


def rows(slide, x, y, w, items, label_w=2.3, gap=0.62, size=17):
    hline(slide, x, y, w)
    for i, (k, v) in enumerate(items):
        yy = y + i * gap
        text(slide, x, yy + 0.17, label_w, 0.4, k, 12.5, MUTED)
        text(slide, x + label_w, yy + 0.13, w - label_w, 0.45, v, size, TEXT, bold=True)
        hline(slide, x, yy + gap, w)


def stat(slide, x, y, w, big, caption, color=INK, size=40):
    text(slide, x, y, w, 0.9, big, size, color, bold=True, font=SERIF)
    text(slide, x, y + 0.9, w, 0.8, caption, 13, MUTED, spacing=1.1)


def source(slide, value, y=6.35):
    text(slide, 0.7, y, 11, 0.3, f'Kaynak: {value}', 10.5, MUTED, italic=True)


def chips(slide, x, y, options, chosen, w=1.35, h=0.46):
    for i, o in enumerate(options):
        on = o in chosen
        c = rect(slide, x + (i % 2) * (w + 0.12), y + (i // 2) * (h + 0.12), w, h,
                 INK if on else WHITE, None if on else LINE, MSO_SHAPE.ROUNDED_RECTANGLE, 0.5)
        tf = c.text_frame
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        r = p.add_run()
        r.text = o
        r.font.size = Pt(13)
        r.font.bold = on
        r.font.name = SANS
        r.font.color.rgb = WHITE if on else MUTED


def initials(slide, x, y, d, value, fill=INK, size=None):
    c = rect(slide, x, y, d, d, fill, shape=MSO_SHAPE.OVAL)
    tf = c.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = value
    r.font.size = Pt(size or (d * 18 if len(value) > 1 else max(13, d * 26)))
    r.font.bold = True
    r.font.name = SERIF
    r.font.color.rgb = WHITE


# ------------------------------------------------------------------------------------- slides

SUMMARY = ('Lumora, yıllık cirosu 10–250 milyon TL olan perakende KOBİ’lerinin satışlarını ürün bazında '
           '12 hafta önceden tahmin eder. E-ticaret, ERP ve kasa verisini on dakikada bağlar; stok, fiyat ve '
           'kampanya önerilerini ekibe her gün iletir. Pilot müşterilerde tahmin hatası %34’ten %12’ye inmiş, '
           'stok fazlası dörtte bir azalmıştır. Abonelikle satılır; kurulum ve eğitim ayrıca ücretlendirilir.')
assert len(SUMMARY) <= 500, len(SUMMARY)


def s01(s):
    rect(s, 0, 0, 13.333, 7.5, INK)
    rect(s, 0.7, 0.75, 0.42, 0.42, ACCENT, shape=MSO_SHAPE.OVAL)
    text(s, 1.3, 0.83, 10, 0.3, f'Örnek sunum · {FORMAT["name"]} {FORMAT["version"]}', 12, RGBColor(0xA9, 0xC6, 0xCF), bold=True)
    text(s, 0.7, 2.55, 11, 1.1, sample(1, 'Girişim adı'), 60, WHITE, bold=True, font=SERIF)
    text(s, 0.7, 3.75, 11, 0.5, sample(1, 'Tek cümlelik tanım'), 22, RGBColor(0xDD, 0xEA, 0xEE))
    text(s, 0.7, 4.45, 11, 0.4, f'{sample(1, "Web sitesi veya uygulama bağlantısı")}   ·   {sample(1, "Sunum tarihi")}', 15, ACCENT, bold=True)
    text(s, 0.7, 6.7, 12, 0.35, 'Bu dosya kurgusal bir girişime aittir. Başvurunuzda kendi şirketinizin bilgilerini kullanınız.', 12, RGBColor(0xA9, 0xC6, 0xCF), italic=True)


def s02(s):
    chrome(s, 2)
    rows(s, 0.7, 1.95, 7.2, [(f['label'], f['sample']) for f in SLIDES[2]['fields']], gap=0.78)
    rect(s, 8.5, 1.95, 4.15, 3.12, PANEL, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.06)
    initials(s, 8.85, 2.3, 1.0, 'DW')
    text(s, 8.85, 3.5, 3.5, 0.4, 'Başvurudan birinci derecede sorumlu', 13, INK, bold=True)
    text(s, 8.85, 3.95, 3.5, 1.0, 'Resmî yazışmalar ve komite iletişimi bu kişiyle yürütülür.', 13, MUTED, spacing=1.15)


def s03(s):
    chrome(s, 3)
    rect(s, 0.7, 1.95, 11.95, 3.9, PANEL, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.04)
    rect(s, 0.7, 1.95, 0.1, 3.9, ACCENT)
    text(s, 1.2, 2.3, 11.0, 3.3, SUMMARY, 20, TEXT, font=SERIF, spacing=1.25)
    text(s, 0.7, 6.05, 6, 0.3, f'{len(SUMMARY)} / 500 karakter · tek paragraf', 11, MUTED)


def s04(s):
    chrome(s, 4)
    text(s, 0.7, 1.85, 11.5, 0.6, sample(4, 'Problem tanımı'), 20, TEXT, font=SERIF)
    for i, (big, cap) in enumerate([('%62', 'her çeyrek stok fazlası veya\neksiği nedeniyle kayıp yaşıyor'),
                                    ('11 saat', 'haftalık elle yürütülen\ntablo çalışması'),
                                    ('%34', 'tahmin ile gerçekleşen satış\narasındaki ortalama sapma')]):
        x = 0.7 + i * 4.05
        hline(s, x, 2.95, 3.6, INK)
        stat(s, x, 3.15, 3.6, big, cap)
    source(s, sample(4, 'Kaynak ve yıl'))


def s05(s):
    chrome(s, 5)
    steps = [('Bağla', 'E-ticaret, ERP ve kasa verisi\non dakikada bağlanır.'),
             ('Tahmin et', 'Ürün bazında 12 haftalık satış\ntahmini her gün güncellenir.'),
             ('Harekete geç', 'Stok, fiyat ve kampanya önerileri\nekibe otomatik iletilir.')]
    for i, (h, d) in enumerate(steps):
        y = 1.95 + i * 1.45
        initials(s, 0.7, y, 0.55, str(i + 1), CODE)
        text(s, 1.5, y + 0.02, 5.5, 0.4, h, 18, INK, bold=True)
        text(s, 1.5, y + 0.45, 5.5, 0.8, d, 13, MUTED, spacing=1.1)
    rect(s, 7.6, 1.95, 5.05, 4.0, PANEL, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.05)
    text(s, 7.95, 2.25, 4.4, 0.3, 'Bu hafta', 12, MUTED, bold=True)
    text(s, 7.95, 2.6, 4.4, 0.3, 'Beklenen ciro', 13, MUTED)
    text(s, 7.95, 2.95, 4.4, 0.7, '1,84 milyon TL', 32, INK, bold=True, font=SERIF)
    for i, line in enumerate(['3 üründe stok riski bulunuyor', '“Kış kampanyası” %18 ek satış öngörüyor', 'Fiyat önerisi: 12 ürün']):
        y = 3.95 + i * 0.6
        hline(s, 7.95, y, 4.35)
        text(s, 7.95, y + 0.15, 4.4, 0.35, line, 13, TEXT)


def s06(s):
    chrome(s, 6)
    rows(s, 0.7, 1.95, 7.2, [(f['label'], f['sample']) for f in SLIDES[6]['fields']], gap=0.78)
    text(s, 0.7, 5.25, 7.2, 0.3, f'Web sitesi: {sample(1, "Web sitesi veya uygulama bağlantısı")}', 13, MUTED)
    rect(s, 8.5, 1.95, 4.15, 3.9, PANEL, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.05)
    text(s, 8.85, 2.25, 3.5, 0.3, 'Girişim aşaması', 13, INK, bold=True)
    for i, st in enumerate(['Fikir', 'Pre-seed', 'Seed', 'Seri A', 'Seri B ve sonrası']):
        y = 2.75 + i * 0.6
        on = st == sample(6, 'Girişim aşaması')
        rect(s, 8.85, y + 0.08, 0.26, 0.26, INK if on else WHITE, None if on else LINE, MSO_SHAPE.OVAL)
        text(s, 9.3, y + 0.04, 3.0, 0.35, st, 15, INK if on else MUTED, bold=on)


def s07(s):
    chrome(s, 7)
    cols = [0.7, 4.85, 9.0]
    for x, h in zip(cols, ['İş modeli', 'Gelir modelleri', 'Ürün tipi']):
        text(s, x, 1.95, 3.6, 0.35, h, 15, INK, bold=True)
        hline(s, x, 2.4, 3.65, INK)
    chips(s, cols[0], 2.65, ['B2B', 'B2C', 'B2G', 'C2C'], {'B2B'})
    text(s, cols[0], 4.0, 3.6, 1.2, 'Satış, perakende işletmelerine\nyıllık sözleşmeyle yapılır.', 13, MUTED, spacing=1.1)
    for i, (name, note) in enumerate([('Abonelik', 'Baskın · aylık lisans, ürün sayısına göre'),
                                      ('Kullanım bazlı', 'Ek veri kaynağı başına ücret'),
                                      ('Hizmet', 'Kurulum ve eğitim')]):
        y = 2.65 + i * 1.0
        initials(s, cols[1], y, 0.45, str(i + 1), INK if i == 0 else CODE)
        text(s, cols[1] + 0.6, y - 0.02, 3.0, 0.35, name, 16, TEXT, bold=True)
        text(s, cols[1] + 0.6, y + 0.36, 3.0, 0.4, note, 12, MUTED)
    chips(s, cols[2], 2.65, ['Fiziksel', 'Dijital', 'Hizmet', 'Diğer'], {'Dijital'}, w=1.7)
    text(s, cols[2], 4.0, 3.6, 1.2, 'Bulut tabanlı yazılım (SaaS).\nKurulum hizmeti gelir modelinde\nayrıca belirtilmiştir.', 13, MUTED, spacing=1.1)
    text(s, 0.7, 6.3, 11.5, 0.3, 'Gelir modelleri önem sırasıyla yazılmıştır; ilk sıradaki baskın gelir modelidir.', 11, MUTED, italic=True)


def s08(s):
    chrome(s, 8)
    segs = [('Birincil segment', sample(8, 'Segment tanımı'), '18.400', 'işletme · Türkiye, 2025'),
            ('İkincil segment · 2028’den itibaren', 'Aynı ölçütlere uyan Almanya, Avusturya ve İsviçre’deki perakende KOBİ’leri', '31.000', 'işletme · DACH, 2025')]
    for i, (h, d, n, cap) in enumerate(segs):
        x = 0.7 + i * 6.1
        rect(s, x, 1.95, 5.85, 3.95, PANEL if i == 0 else WHITE, None if i == 0 else LINE, MSO_SHAPE.ROUNDED_RECTANGLE, 0.05)
        text(s, x + 0.35, 2.25, 5.2, 0.35, h, 13, CODE, bold=True)
        text(s, x + 0.35, 2.7, 5.2, 1.4, d, 18, TEXT, font=SERIF, spacing=1.15)
        text(s, x + 0.35, 4.35, 5.2, 0.8, n, 40, INK, bold=True, font=SERIF)
        text(s, x + 0.35, 5.2, 5.2, 0.4, cap, 13, MUTED)
    source(s, 'Lumora pazar çalışması, 2025 · işletme sayıları ticaret sicili kayıtları üzerinden hesaplanmıştır')


def s09(s):
    chrome(s, 9)
    bars = [('TAM', 'Toplam pazar', '9,2 milyar TL', 11.95), ('SAM', 'Hizmet verilebilir pazar', '1,6 milyar TL', 6.2), ('SOM', 'İlk üç yılda elde edilebilir', '48 milyon TL', 2.2)]
    for i, (k, d, v, w) in enumerate(bars):
        y = 1.95 + i * 1.2
        rect(s, 0.7, y, w, 0.95, [INK, CODE, ACCENT][i], shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.12)
        text(s, 0.95, y + 0.14, 1.0, 0.7, k, 22, WHITE, bold=True, font=SERIF, anchor=MSO_ANCHOR.MIDDLE)
        text(s, 0.7 + w + 0.25 if w < 6 else 2.1, y + 0.12, 4.5, 0.4, v, 18, INK if w < 6 else WHITE, bold=True)
        text(s, 0.7 + w + 0.25 if w < 6 else 2.1, y + 0.52, 4.5, 0.35, d, 12, MUTED if w < 6 else RGBColor(0xDD, 0xEA, 0xEE))
    text(s, 0.7, 5.65, 11.5, 0.35, f'Hesaplama: {sample(9, "Hesaplama yöntemi")} (ortalama 7.200 TL / yıl).', 13, TEXT)
    source(s, sample(9, 'Kaynak ve yıl'))


def s10(s):
    chrome(s, 10)
    head = ['', 'Kurulum süresi', 'Aylık maliyet', 'Ürün bazında tahmin']
    data = [['Lumora', '10 dakika', '6.000 TL’den', 'Var, günlük'],
            ['Elle tutulan tablolar', 'Yok', 'Personel zamanı', 'Yok'],
            ['ERP tahmin modülleri', '2–4 ay', '40.000 TL+', 'Kategori bazında'],
            ['Kurumsal tahmin yazılımları', '6+ ay', '150.000 TL+', 'Var, haftalık']]
    xs, ws = [0.7, 4.3, 7.0, 9.6], [3.6, 2.7, 2.6, 3.05]
    for j, h in enumerate(head):
        text(s, xs[j], 1.95, ws[j], 0.35, h, 12.5, MUTED, bold=True)
    for i, r in enumerate(data):
        y = 2.4 + i * 0.85
        if i == 0:
            rect(s, 0.55, y, 12.2, 0.85, PANEL, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.12)
        else:
            hline(s, 0.7, y, 11.95)
        for j, v in enumerate(r):
            text(s, xs[j], y + 0.25, ws[j], 0.4, v, 16 if j == 0 else 15, INK if i == 0 else TEXT, bold=(j == 0 or i == 0))
    source(s, 'Lumora rakip incelemesi, Eylül 2026 · fiyatlar liste fiyatlarıdır')


def s11(s):
    chrome(s, 11)
    for i, (big, cap) in enumerate([('14', 'pilot müşteri'), ('6', 'ücretli müşteri'),
                                    ('180.000 TL', 'aylık yinelenen gelir'), ('%12', 'tahmin hatası\n(başlangıçta %34)')]):
        x = 0.7 + i * 3.05
        hline(s, x, 2.0, 2.75, INK)
        stat(s, x, 2.2, 2.85, big, cap, size=32)
    text(s, 0.7, 4.6, 11.5, 0.8, 'Pilotlar Mart 2026’da başladı. Ücretli müşterilerin tamamı yıllık sözleşme imzaladı; hiçbir müşteri ayrılmadı.', 15, TEXT, font=SERIF, spacing=1.2)
    source(s, f'Lumora müşteri paneli · ölçüm tarihi {sample(11, "Ölçüm tarihi")}')


def s12(s):
    chrome(s, 12)
    team = [('DW', 'Daniel Weber', 'Kurucu ve Genel Müdür', '12 yıl perakende analitiği; veri ekibi yöneticiliği.'),
            ('EK', 'Elif Kaya', 'Teknoloji Direktörü', '9 yıl makine öğrenmesi; talep tahmini üzerine yüksek lisans.'),
            ('JB', 'Jonas Brandt', 'Satış Direktörü', '8 yıl KOBİ yazılım satışı; DACH bölgesi.')]
    for i, (ini, n, role, exp) in enumerate(team):
        x = 0.7 + i * 4.05
        initials(s, x, 2.0, 1.1, ini, INK if i == 0 else CODE)
        text(s, x, 3.35, 3.7, 0.4, n, 19, INK, bold=True, font=SERIF)
        text(s, x, 3.8, 3.7, 0.35, role, 13.5, CODE, bold=True)
        text(s, x, 4.25, 3.6, 1.0, exp, 13, MUTED, spacing=1.15)


def s13(s):
    chrome(s, 13)
    rows(s, 0.7, 1.95, 6.6, [(f['label'], f['sample']) for f in SLIDES[13]['fields'][:3]] + [('Kuruluş hedefi', '2027 1. çeyrek')], gap=0.78)
    rect(s, 7.8, 1.95, 4.85, 3.9, PANEL, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.05)
    text(s, 8.15, 2.25, 4.2, 0.3, 'Faaliyet alanları', 13, INK, bold=True)
    for i, (code, d) in enumerate([('62.01', 'Bilgisayar programlama (SaaS yazılım)'), ('63.11', 'Veri işleme ve barındırma'), ('62.02', 'Kurumsal danışmanlık ve kurulum')]):
        y = 2.8 + i * 0.95
        text(s, 8.15, y, 1.2, 0.4, code, 20, CODE, bold=True, font='Courier New')
        text(s, 9.45, y + 0.02, 3.0, 0.8, d, 14, TEXT, spacing=1.1)


def s14(s):
    chrome(s, 14)
    rows(s, 0.7, 1.95, 6.6, [(f['label'], f['sample'] if f['label'] != 'Pay oranı' else '%100 · tek pay sahibi') for f in SLIDES[14]['fields']], gap=0.78)
    rect(s, 7.8, 1.95, 4.85, 3.9, PANEL, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.05)
    initials(s, 8.15, 2.3, 1.0, 'DW')
    text(s, 8.15, 3.5, 4.2, 0.4, 'Daniel Weber', 19, INK, bold=True, font=SERIF)
    text(s, 8.15, 3.95, 4.2, 1.4, 'Kurucu ve tek pay sahibi. Almanya vatandaşı; Türkiye’de yabancı kurucu olarak şirket kuracaktır.', 13, MUTED, spacing=1.15)


def s15(s):
    chrome(s, 15)
    for i, f in enumerate(SLIDES[15]['fields']):
        y = 1.95 + i * 1.3
        initials(s, 0.7, y + 0.05, 0.55, str(i + 1), CODE)
        text(s, 1.5, y, 4, 0.3, f['label'], 12, MUTED, bold=True)
        text(s, 1.5, y + 0.35, 10, 0.5, f['sample'], 22, INK, bold=True, font=SERIF)
    text(s, 0.7, 5.95, 11.5, 0.35, 'Telefon ülke koduyla, adres posta koduyla yazılmıştır; eksik yazılan alanlar kontrol edilmek üzere işaretlenir.', 11, MUTED, italic=True)


def s16(s):
    chrome(s, 16)
    rect(s, 0.7, 1.95, 5.6, 3.9, INK, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.05)
    text(s, 1.05, 2.3, 4.9, 0.3, 'Esas sermaye', 13, RGBColor(0xA9, 0xC6, 0xCF), bold=True)
    text(s, 1.05, 2.7, 4.9, 1.0, sample(16, 'Esas sermaye'), 44, WHITE, bold=True, font=SERIF)
    text(s, 1.05, 3.85, 4.9, 1.5, '%25’i (62.500 TL) tescil öncesinde Türkiye’deki şirket hesabında bloke edilir.', 14, RGBColor(0xDD, 0xEA, 0xEE), spacing=1.15)
    rows(s, 6.8, 1.95, 5.85, [('Fon kaynağı', sample(16, 'Fon kaynağı')), ('Transfer yolu', sample(16, 'Transfer yolu')),
                              ('Gönderen hesap', 'Kurucu adına · Almanya'), ('Ek yatırım', '750.000 € tohum turu (2027 2. çeyrek)')],
         label_w=2.0, gap=0.95, size=15)


BUILDERS = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16]
assert len(BUILDERS) == TOTAL


def build():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    blank = prs.slide_layouts[6]
    for b in BUILDERS:
        b(prs.slides.add_slide(blank))
    prs.core_properties.title = 'Lumora Analytics · Örnek sunum'
    prs.core_properties.author = 'Terminal Şirket'
    prs.save(PPTX)
    print('wrote', PPTX.relative_to(ROOT))


def soffice() -> str | None:
    mac = Path('/Applications/LibreOffice.app/Contents/MacOS/soffice')
    return str(mac) if mac.exists() else shutil.which('soffice')


def render():
    exe = soffice()
    if not exe:
        print('LibreOffice not found: PDF and thumbnails not written', file=sys.stderr)
        return
    import pymupdf
    from PIL import Image

    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([exe, '--headless', '--convert-to', 'pdf', '--outdir', tmp, str(PPTX)], check=True, capture_output=True)
        pdf = Path(tmp) / (PPTX.stem + '.pdf')
        shutil.copy(pdf, OUT / pdf.name)
        print('wrote', (OUT / pdf.name).relative_to(ROOT))
        thumbs = OUT / 'format'
        thumbs.mkdir(exist_ok=True)
        doc = pymupdf.open(pdf)
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=72)  # 960 × 540
            img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            img.save(thumbs / f'{i + 1:02d}.webp', 'WEBP', quality=82, method=6)
        print('wrote', len(doc), 'thumbnails to', thumbs.relative_to(ROOT))


if __name__ == '__main__':
    build()
    render()
