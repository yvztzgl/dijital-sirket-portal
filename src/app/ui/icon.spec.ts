import { splitGlyphs } from './icon';

describe('splitGlyphs', () => {
  it('turns leading and trailing design glyphs into icon names', () => {
    expect(splitGlyphs('✓ Tamamlandı')).toEqual({ lead: 'check', text: 'Tamamlandı', trail: null });
    expect(splitGlyphs('Detayları göster ▾')).toEqual({ lead: null, text: 'Detayları göster', trail: 'chevron-down' });
    expect(splitGlyphs('Giriş yap →')).toEqual({ lead: null, text: 'Giriş yap', trail: 'arrow-right' });
    expect(splitGlyphs('✓')).toEqual({ lead: 'check', text: '', trail: null });
  });

  it('leaves ordinary text and glued glyphs alone', () => {
    expect(splitGlyphs('Devam ediyor · 2/3')).toEqual({ lead: null, text: 'Devam ediyor · 2/3', trail: null });
    expect(splitGlyphs('3')).toEqual({ lead: null, text: '3', trail: null });
  });
});
