import { Application } from '@core/models/models';
import { tl0 } from '@core/utils/format';
import { brandOf, cardPatch, editorCards, inputErrors, logoError, naceChoices, naceName, naceTitles, reviewRows, rowErrors, titleParts } from './review.view';

const APP = {
  marks: { name: 'edited', funding: 'profile', address: 'profile', title: 'profile' },
  founder: { firstName: 'Ayşe', lastName: 'Kaya', nationality: 'Almanya', passportNo: '' },
  company: { brand: 'lumora', logo: '', root: 'Lumora', activity: 'Veri', nace: ['62.01', '99.99'], suggestedNace: ['62.01', '63.11', '58.29', '47.91', '62.02'], capital: 250_000 },
  contact: { email: 'a@example.test', phone: '+49 1', address: 'Hauptstr. 1', postalCode: '', country: 'Almanya' },
  funding: 'investor',
} as unknown as Application;
const TITLES = naceTitles({
  sectors: [],
  funding: [],
  naceCodes: [
    { code: '62.01', title: 'Bilgisayar programlama', translationKey: '' },
    { code: '62.02', title: 'Bilgisayar danışmanlığı', translationKey: '' },
    { code: '63.11', title: 'Veri işleme', translationKey: '' },
    { code: '58.29', title: 'Diğer yazılım programlarının yayımlanması', translationKey: '' },
    { code: '47.91', title: 'İnternet üzerinden perakende', translationKey: '' },
  ],
});

describe('review view (D-1c)', () => {
  it('the twelve rows, with values, editors and marks', () => {
    const rows = reviewRows(APP, 'Lumora Veri Anonim Şirketi', TITLES);
    expect(rows.map((r) => [r.key, r.label, r.value, r.edit, r.fromProfile, r.edited])).toEqual([
      ['title', 'Şirket unvanı', 'Lumora Veri Anonim Şirketi', 'title', true, false],
      ['name', 'Kurucu', 'Ayşe Kaya', 'founder', false, true],
      ['nace', 'Faaliyet', 'Bilgisayar programlama, 99.99', 'nace', false, false],
      ['nationality', 'Uyruk', 'Almanya', 'founder', false, true],
      ['type', 'Şirket türü', 'Tek pay sahipli anonim şirket', null, false, false],
      ['share', 'Pay sahipliği', '%100, Ayşe Kaya', null, false, false],
      ['capital', 'Sermaye', tl0(250_000), null, false, false],
      ['funding', 'Sermaye kaynağı', 'Yatırımcı sermayesi (sözleşmeli)', 'funding', true, false],
      ['email', 'E-posta', 'a@example.test', 'contact', false, false],
      ['phone', 'Telefon', '+49 1', 'contact', false, false],
      ['address', 'Adres', 'Hauptstr. 1, Almanya', 'contact', true, false],
      ['office', 'Merkez adresi', 'Terminal İstanbul sanal ofisi, Gebze / Kocaeli', null, false, false],
    ]);
    expect(reviewRows(APP, '', TITLES)[0].value).toBe('—');
    expect(reviewRows(null, '', TITLES)).toEqual([]);
  });

  it('a refusal\'s sentences: joined per row, one per editor input', () => {
    const errors = { given_name: ['Ad eksik.'], family_name: ['Soyad eksik.'], postal_code: ['Posta kodu eksik.'], unknown: ['?'], email: [] };
    expect(rowErrors(errors)).toEqual({ name: 'Ad eksik. Soyad eksik.', address: 'Posta kodu eksik.' });
    expect(inputErrors(errors)).toEqual({ firstName: 'Ad eksik.', lastName: 'Soyad eksik.', postalCode: 'Posta kodu eksik.' });
  });

  it('the three editors\' fields with the current values; the funding one with the given options', () => {
    const cards = editorCards(APP, [{ value: 'investor', label: 'Yatırımcı' }]);
    expect(cards.map((c) => [c.id, c.fields.map((f) => [f.key, f.value])])).toEqual([
      ['founder', [['firstName', 'Ayşe'], ['lastName', 'Kaya'], ['nationality', 'Almanya']]],
      ['contact', [['email', 'a@example.test'], ['phone', '+49 1'], ['address', 'Hauptstr. 1'], ['postalCode', ''], ['country', 'Almanya']]],
      ['funding', [['funding', 'investor']]],
    ]);
    expect(cards[2].fields[0].options).toEqual([{ value: 'investor', label: 'Yatırımcı' }]);
    expect(editorCards(null, [])).toEqual([]);
  });

  it('what each editor sends and marks', () => {
    const d = { firstName: 'A', lastName: 'B', nationality: 'C', email: 'e', phone: 'p', address: 'ad', postalCode: 'pc', country: 'co', funding: 'own-turkey' };
    expect(cardPatch('founder', d)).toEqual({ patch: { founder: { firstName: 'A', lastName: 'B', nationality: 'C' } }, edited: ['name'] });
    expect(cardPatch('contact', d)).toEqual({ patch: { contact: { email: 'e', phone: 'p', address: 'ad', postalCode: 'pc', country: 'co' } }, edited: ['phone', 'address', 'email'] });
    expect(cardPatch('funding', d)).toEqual({ patch: { funding: 'own-turkey' }, edited: ['funding'] });
  });

  it('a typed title loses its suffix and splits into root and activity', () => {
    expect(titleParts('Nova Veri Teknolojileri A.Ş.')).toEqual({ root: 'Nova', activity: 'Veri Teknolojileri' });
    expect(titleParts('  Nova   Veri anonim şirketi ')).toEqual({ root: 'Nova', activity: 'Veri anonim şirketi' });
    expect(titleParts('Nova Anonim Şirketi')).toEqual({ root: 'Nova', activity: '' });
    expect(titleParts('')).toEqual({ root: '', activity: '' });
  });

  it('NACE: up to three suggestions from the profile without a search; up to five matches with one', () => {
    expect(naceChoices(APP.company, TITLES, '')).toEqual([
      { code: '63.11', name: 'Veri işleme', suggested: true },
      { code: '58.29', name: 'Diğer yazılım programlarının yayımlanması', suggested: true },
      { code: '47.91', name: 'İnternet üzerinden perakende', suggested: true },
    ]);
    expect(naceChoices(APP.company, TITLES, ' BİLGİSAYAR ').map((o) => o.code)).toEqual(['62.02']);
    expect(naceChoices(APP.company, TITLES, '6').map((o) => o.code)).toEqual(['62.02', '63.11']);
    expect(naceChoices(undefined, TITLES, '')).toEqual([]);
    expect(naceName(TITLES, '12.34')).toBe('12.34');
  });

  it('the brand\'s name, logo and initial', () => {
    expect(brandOf(APP.company)).toEqual({ name: 'lumora', logo: '', initials: 'L' });
    expect(brandOf({ ...APP.company, brand: 'ışık' }).initials).toBe('I');
    expect(brandOf(undefined)).toEqual({ name: '', logo: '', initials: '' });
  });

  it('a logo must be PNG, JPEG, SVG or WebP and at most 500 KB', () => {
    const f = (type: string, size: number) => {
      const file = new File(['x'], 'logo', { type });
      Object.defineProperty(file, 'size', { value: size });
      return file;
    };
    expect(logoError(f('image/gif', 10))).toBe('Logo için PNG, JPEG, SVG veya WebP biçiminde bir görsel seçiniz.');
    expect(logoError(f('image/png', 500 * 1024 + 1))).toBe('Görsel 500 KB’tan büyüktür. Daha küçük bir dosya seçiniz.');
    for (const t of ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']) expect(logoError(f(t, 500 * 1024))).toBeNull();
  });
});
