import { fundingOptions } from './funding-options';

describe('fundingOptions', () => {
  it('the reference\'s sources with a hint each; a source without a hint keeps none', () => {
    const ref = { sectors: [], naceCodes: [], funding: [{ key: 'investor', label: 'Yatırımcı' }, { key: 'other', label: 'Diğer' }] };
    expect(fundingOptions(ref)).toEqual([
      { value: 'investor', label: 'Yatırımcı', hint: 'Yatırım sözleşmesiyle gelen sermaye' },
      { value: 'other', label: 'Diğer', hint: undefined },
    ]);
  });

  it('nothing before the reference is loaded', () => {
    expect(fundingOptions(null)).toEqual([]);
  });
});
