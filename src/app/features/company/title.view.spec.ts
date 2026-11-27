import { titleSuggestions } from './title.view';

describe('titleSuggestions (D-1d)', () => {
  it('the suggestions in order, the first marked', () => {
    expect(titleSuggestions({ status: 'conflict', candidate: 'Acme', alternatives: ['Acme Bulut Yazılım', 'Acmenova Bilişim'] })).toEqual([
      { full: 'Acme Bulut Yazılım', first: true },
      { full: 'Acmenova Bilişim', first: false },
    ]);
  });

  it('none without a refusal', () => {
    expect(titleSuggestions(undefined)).toEqual([]);
    expect(titleSuggestions({ status: 'checking', candidate: 'Acme' })).toEqual([]);
  });
});
