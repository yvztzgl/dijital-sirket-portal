// Sample investor deck for the Dijital Şirket Platformu upload step ("örnek sunum"), served from
// public/assets/samples/lumora-analytics-pitch.pptx and linked on the upload screen (D-1a).
// Fictional company; slides that AI Reviewer reads are tagged so founders see what is expected.
//
// Rebuild: npm i pptxgenjs (anywhere), then
//   NODE_PATH=<that>/node_modules SKILL=<pptx skill dir> node art/sample-deck/build.js public/assets/samples/lumora-analytics-pitch.pptx
// SKILL provides scripts/apply_theme.js (writes the theme colours into the deck).
const pptxgen = require('pptxgenjs');
const { applyTheme } = require(process.env.SKILL + '/scripts/apply_theme.js');

const OUT = process.argv[2] || 'ornek-sunum.pptx';

const THEME = {
  name: 'Lumora',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '10242C', lt1: 'FFFFFF', dk2: '0B3C49', lt2: 'EEF5F6',
    accent1: 'F2A541', accent2: '1C7C8C', accent3: '7FB8C2', accent4: 'E4572E', accent5: '5B6C73', accent6: 'D7E8EB',
    hlink: '1C7C8C', folHlink: '5B6C73',
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9'; // 10 x 5.625 in
pres.title = 'Lumora Analytics — Yatırımcı Sunumu';
pres.author = 'Dijital Şirket Platformu · Örnek sunum';
pres.company = 'Lumora Analytics';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

// ------------------------------------------------------------------------------------ layouts
pres.defineSlideMaster({
  title: 'Dark',
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.55, w: 8.8, h: 1.3, fontSize: 44, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 2.95, w: 8.2, h: 0.9, fontSize: 18, color: C.accent6, valign: 'top', margin: 0 }, text: '' } },
  ],
});
pres.defineSlideMaster({
  title: 'Content',
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.5, 0.6],
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.4, w: 8.8, h: 0.75, fontSize: 30, bold: true, color: C.text2, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
    { text: { text: 'Lumora Analytics · Yatırımcı sunumu 2026', options: { x: 0.6, y: 5.2, w: 6, h: 0.25, fontSize: 9, color: C.accent5, margin: 0 } } },
  ],
  slideNumber: { x: 9.0, y: 5.2, w: 0.4, h: 0.25, fontSize: 9, color: C.accent5, align: 'right' },
});

// -------------------------------------------------------------------------------- helpers
/** Small tag telling the founder which fields the platform reads from this slide. */
function readsTag(slide, text) {
  // Sits in the top-right corner of the footer line, clear of titles of any length.
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.7, y: 5.1, w: 3.2, h: 0.36, rectRadius: 0.18, fill: { color: C.background2 }, line: { color: C.accent3, width: 0.75 }, objectName: 'AI tag',
  });
  slide.addText([{ text: 'AI Reviewer okur: ', options: { bold: true, color: C.accent2 } }, { text, options: { color: C.text2 } }], {
    x: 5.85, y: 5.1, w: 3.0, h: 0.36, fontSize: 10, valign: 'middle', margin: 0, isTextBox: true, objectName: 'AI tag text',
  });
}
/** Numbered amber circle — the deck's motif. */
function badge(slide, x, y, n, size = 0.42) {
  slide.addShape(pres.shapes.OVAL, { x, y, w: size, h: size, fill: { color: C.accent1 }, line: { type: 'none' }, objectName: `badge ${n}` });
  slide.addText(String(n), { x, y, w: size, h: size, align: 'center', valign: 'middle', fontSize: 14, bold: true, color: C.text2, margin: 0, isTextBox: true });
}
function card(slide, x, y, w, h, name) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: C.background2 }, line: { type: 'none' }, objectName: name,
  });
}
/** Label / value rows used on the data slides the platform reads. */
function fieldRows(slide, x, y, w, rows) {
  rows.forEach(([k, v], i) => {
    const yy = y + i * 0.62;
    slide.addText(k, { x, y: yy, w: 2.0, h: 0.5, fontSize: 12, color: C.accent5, valign: 'middle', margin: 0, isTextBox: true });
    slide.addText(v, { x: x + 2.05, y: yy, w: w - 2.05, h: 0.5, fontSize: 15, bold: true, color: C.text2, valign: 'middle', margin: 0, isTextBox: true });
    if (i < rows.length - 1) slide.addShape(pres.shapes.LINE, { x, y: yy + 0.56, w, h: 0, line: { color: HEX.accent6, width: 0.75 } });
  });
}

// --------------------------------------------------------------------------------- slides
// 1 · Cover
pres.addSection({ title: 'Giriş' });
let s = pres.addSlide({ masterName: 'Dark', sectionTitle: 'Giriş' });
s.addText('Lumora Analytics', { placeholder: 'title' });
s.addText('KOBİ’ler için yapay zekâ destekli satış tahmini · Yatırımcı sunumu 2026', { placeholder: 'body' });
s.addShape(pres.shapes.OVAL, { x: 0.6, y: 0.75, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { type: 'none' }, objectName: 'logo dot' });
s.addText('ÖRNEK SUNUM · DİJİTAL ŞİRKET PLATFORMU', { x: 1.25, y: 0.75, w: 6, h: 0.5, fontSize: 11, bold: true, charSpacing: 2, color: C.accent3, valign: 'middle', margin: 0, isTextBox: true });
s.addText('Bu dosya kurgusal bir girişimdir. Başvurunuzda kendi şirketinizin bilgilerini kullanın.', {
  x: 0.6, y: 4.65, w: 8.8, h: 0.4, fontSize: 12, italic: true, color: C.accent3, margin: 0, isTextBox: true,
});
s.addNotes('Kapak: şirket adı (marka) burada geçmeli. AI Reviewer unvan önerisini buradan başlatır.');

// 2 · Problem
pres.addSection({ title: 'Fırsat' });
s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Fırsat' });
s.addText('KOBİ’ler satışlarını tahmin edemiyor', { placeholder: 'title' });
[
  ['%62', 'stok fazlası veya eksiğiyle her çeyrek kaybediyor'],
  ['11 saat', 'haftalık manuel tablo çalışması'],
  ['%34', 'tahmin hatası ile ortalama sapma'],
].forEach(([big, small], i) => {
  const x = 0.6 + i * 3.0;
  card(s, x, 1.55, 2.75, 2.6, `stat ${i + 1}`);
  s.addText(big, { x: x + 0.25, y: 1.85, w: 2.3, h: 1.0, fontSize: 48, bold: true, fontFace: THEME.headFontFace, color: C.accent2, margin: 0, isTextBox: true });
  s.addText(small, { x: x + 0.25, y: 2.95, w: 2.3, h: 0.9, fontSize: 14, color: C.text2, valign: 'top', margin: 0, isTextBox: true });
});
s.addText('Kaynak: Lumora müşteri görüşmeleri, 2025 (n = 120 KOBİ)', { x: 0.6, y: 4.45, w: 8.8, h: 0.3, fontSize: 10, color: C.accent5, margin: 0, isTextBox: true });

// 3 · Product
s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Fırsat' });
s.addText('Ürün: tahmin, uyarı ve öneri tek panelde', { placeholder: 'title' });
[
  ['Bağla', 'e-ticaret, ERP ve POS verisi 10 dakikada bağlanır.'],
  ['Tahmin et', 'Ürün bazında 12 haftalık satış tahmini, günlük güncellenir.'],
  ['Harekete geç', 'Stok, fiyat ve kampanya önerileri ekibe otomatik gider.'],
].forEach(([h, d], i) => {
  const y = 1.45 + i * 1.12;
  badge(s, 0.6, y + 0.05, i + 1);
  s.addText(h, { x: 1.2, y, w: 3.6, h: 0.42, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true });
  s.addText(d, { x: 1.2, y: y + 0.42, w: 3.8, h: 0.55, fontSize: 14, color: C.accent5, valign: 'top', margin: 0, isTextBox: true });
});
card(s, 5.4, 1.45, 4.0, 3.3, 'product mock');
s.addText('BU HAFTA', { x: 5.7, y: 1.7, w: 3.4, h: 0.3, fontSize: 10, bold: true, charSpacing: 2, color: C.accent5, margin: 0, isTextBox: true });
s.addText('Beklenen ciro', { x: 5.7, y: 2.05, w: 3.4, h: 0.3, fontSize: 12, color: C.accent5, margin: 0, isTextBox: true });
s.addText('₺ 1,84 M', { x: 5.7, y: 2.35, w: 3.4, h: 0.7, fontSize: 36, bold: true, fontFace: THEME.headFontFace, color: C.text2, margin: 0, isTextBox: true });
s.addText([
  { text: '3 ürün stok riski taşıyor', options: { bullet: true, breakLine: true } },
  { text: '“Kış kampanyası” %18 ek satış öngörüyor', options: { bullet: true } },
], { x: 5.7, y: 3.2, w: 3.5, h: 1.2, fontSize: 13, color: C.text2, paraSpaceAfter: 6, margin: 0, isTextBox: true });

// 4 · Market + traction
s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Fırsat' });
s.addText('Pazar ve ilk çekiş', { placeholder: 'title' });
s.addChart(pres.charts.BAR, [{ name: 'Pazar (milyon €)', labels: ['TAM', 'SAM', 'SOM'], values: [4200, 610, 48] }], {
  x: 0.6, y: 1.35, w: 4.3, h: 3.45, barDir: 'bar', catAxisOrientation: 'maxMin', chartColors: [HEX.accent2],
  showTitle: true, title: 'Pazar büyüklüğü (milyon €)', titleFontSize: 12, titleColor: HEX.dk2, titleFontFace: '+mn-lt',
  showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelColor: HEX.dk2, dataLabelFontFace: '+mn-lt',
  catAxisLabelColor: HEX.accent5, catAxisLabelFontSize: 11, catAxisLabelFontFace: '+mn-lt', valAxisHidden: true,
  valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, objectName: 'market chart',
});
s.addChart(pres.charts.LINE, [{ name: 'MRR (bin €)', labels: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl'], values: [4, 6, 9, 11, 15, 19, 24, 31, 38] }], {
  x: 5.1, y: 1.35, w: 4.3, h: 3.45, chartColors: [HEX.accent1], lineSize: 3, lineDataSymbol: 'circle', lineDataSymbolSize: 6,
  showTitle: true, title: 'Aylık yinelenen gelir 2025 (bin €)', titleFontSize: 12, titleColor: HEX.dk2, titleFontFace: '+mn-lt',
  showValue: true, dataLabelPosition: 't', dataLabelFontSize: 10, dataLabelColor: HEX.dk2, dataLabelFontFace: '+mn-lt',
  catAxisLabelColor: HEX.accent5, catAxisLabelFontSize: 10, catAxisLabelFontFace: '+mn-lt', valAxisHidden: true,
  valGridLine: { color: HEX.accent6, size: 0.5 }, catGridLine: { style: 'none' }, showLegend: false, objectName: 'mrr chart',
});

// 5 · Company & activity (read by AI Reviewer)
pres.addSection({ title: 'Başvuru bilgileri' });
s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Başvuru bilgileri' });
s.addText('Şirket ve faaliyet', { placeholder: 'title' });
readsTag(s, 'unvan, faaliyet, NACE');
fieldRows(s, 0.6, 1.5, 4.6, [
  ['Şirket adı', 'Lumora Analytics'],
  ['Kurulacak tür', 'Tek pay sahipli anonim şirket'],
  ['Merkez', 'İstanbul (sanal ofis)'],
  ['Kuruluş hedefi', '2026 1. çeyrek'],
]);
card(s, 5.6, 1.45, 3.8, 3.3, 'activities');
s.addText('FAALİYET ALANLARI', { x: 5.85, y: 1.65, w: 3.3, h: 0.3, fontSize: 10, bold: true, charSpacing: 2, color: C.accent5, margin: 0, isTextBox: true });
[
  ['62.01', 'Bilgisayar programlama (SaaS yazılım)'],
  ['63.11', 'Veri işleme ve barındırma'],
  ['62.02', 'Kurumsal danışmanlık ve kurulum'],
].forEach(([code, name], i) => {
  const y = 2.05 + i * 0.85;
  s.addText(code, { x: 5.85, y, w: 0.9, h: 0.6, fontSize: 16, bold: true, fontFace: 'Courier New', color: C.accent2, valign: 'middle', margin: 0, isTextBox: true });
  s.addText(name, { x: 6.8, y, w: 2.45, h: 0.6, fontSize: 13, color: C.text2, valign: 'middle', margin: 0, isTextBox: true });
});

// 6 · Founder (read by AI Reviewer)
s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Başvuru bilgileri' });
s.addText('Kurucu ve pay yapısı', { placeholder: 'title' });
readsTag(s, 'ad soyad, uyruk, pay');
s.addShape(pres.shapes.OVAL, { x: 0.6, y: 1.55, w: 1.5, h: 1.5, fill: { color: C.accent2 }, line: { type: 'none' }, objectName: 'founder avatar' });
s.addText('DW', { x: 0.6, y: 1.55, w: 1.5, h: 1.5, align: 'center', valign: 'middle', fontSize: 36, bold: true, fontFace: THEME.headFontFace, color: C.background1, margin: 0, isTextBox: true });
s.addText('Daniel Weber', { x: 0.6, y: 3.2, w: 3.2, h: 0.5, fontSize: 22, bold: true, fontFace: THEME.headFontFace, color: C.text2, margin: 0, isTextBox: true });
s.addText('Kurucu & CEO · 12 yıl perakende analitiği, ex-Zalando veri ekibi lideri', { x: 0.6, y: 3.7, w: 3.4, h: 0.8, fontSize: 13, color: C.accent5, valign: 'top', margin: 0, isTextBox: true });
fieldRows(s, 4.5, 1.5, 4.9, [
  ['Ad / Soyad', 'Daniel Weber'],
  ['Uyruk', 'Almanya'],
  ['Pay sahipliği', '%100 · tek pay sahibi'],
  ['Yönetim kurulu', 'Tek üye: Daniel Weber'],
]);

// 7 · Contact (read by AI Reviewer)
s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Başvuru bilgileri' });
s.addText('İletişim ve adres', { placeholder: 'title' });
readsTag(s, 'e-posta, telefon, adres');
[
  ['E-POSTA', 'daniel.weber@lumora-analytics.com'],
  ['TELEFON', '+49 151 2345 6789'],
  ['ADRES', 'Torstraße 45, 10119 Berlin, Almanya'],
].forEach(([k, v], i) => {
  const x = 0.6 + i * 3.0;
  card(s, x, 1.55, 2.75, 1.9, `contact ${i + 1}`);
  badge(s, x + 0.25, 1.8, i + 1, 0.4);
  s.addText(k, { x: x + 0.25, y: 2.35, w: 2.3, h: 0.3, fontSize: 10, bold: true, charSpacing: 2, color: C.accent5, margin: 0, isTextBox: true });
  s.addText(v, { x: x + 0.25, y: 2.65, w: 2.3, h: 0.65, fontSize: 14, bold: true, color: C.text2, valign: 'top', margin: 0, isTextBox: true });
});
s.addText('İpucu: telefonu ülke koduyla (+49 …) ve adresi posta koduyla yazın; aksi halde AI Reviewer bu alanları “kontrol edin” olarak işaretler.', {
  x: 0.6, y: 3.85, w: 8.8, h: 0.6, fontSize: 13, italic: true, color: C.accent2, margin: 0, isTextBox: true,
});

// 8 · Funding (read by AI Reviewer)
s = pres.addSlide({ masterName: 'Content', sectionTitle: 'Başvuru bilgileri' });
s.addText('Sermaye ve fon kaynağı', { placeholder: 'title' });
readsTag(s, 'fon kaynağı');
card(s, 0.6, 1.45, 4.0, 3.3, 'capital');
s.addText('ESAS SERMAYE', { x: 0.85, y: 1.7, w: 3.5, h: 0.3, fontSize: 10, bold: true, charSpacing: 2, color: C.accent5, margin: 0, isTextBox: true });
s.addText('250.000 TL', { x: 0.85, y: 2.05, w: 3.5, h: 0.8, fontSize: 40, bold: true, fontFace: THEME.headFontFace, color: C.text2, margin: 0, isTextBox: true });
s.addText('%25’i (62.500 TL) tescil öncesi Türkiye’deki şirket hesabında bloke edilir.', { x: 0.85, y: 2.95, w: 3.5, h: 0.9, fontSize: 13, color: C.accent5, valign: 'top', margin: 0, isTextBox: true });
fieldRows(s, 5.0, 1.5, 4.4, [
  ['Fon kaynağı', 'Kurucunun kişisel birikimi'],
  ['Transfer yolu', 'Yurt dışı banka transferi'],
  ['Gönderen hesap', 'Kurucu adına · Deutsche Bank'],
  ['Ek yatırım', '€ 750 bin tohum turu (2026 Q2)'],
]);

// 9 · Closing
pres.addSection({ title: 'Kapanış' });
s = pres.addSlide({ masterName: 'Dark', sectionTitle: 'Kapanış' });
s.addText('Teşekkürler', { placeholder: 'title' });
s.addText('daniel.weber@lumora-analytics.com · +49 151 2345 6789', { placeholder: 'body' });
s.addShape(pres.shapes.OVAL, { x: 0.6, y: 0.75, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { type: 'none' }, objectName: 'logo dot' });
s.addText('Lumora Analytics', { x: 1.25, y: 0.75, w: 6, h: 0.5, fontSize: 14, bold: true, color: C.accent3, valign: 'middle', margin: 0, isTextBox: true });

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('wrote', OUT);
})();
