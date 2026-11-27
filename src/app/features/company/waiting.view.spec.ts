import { Application } from '@core/models/models';
import { dateTime } from '@core/utils/format';
import { since, uploadedFiles } from './waiting.view';

describe('waiting screens (D-1b, D-1g, D-1f)', () => {
  it('the files received, those that exist', () => {
    expect(uploadedFiles({ deck: { fileName: 'a.pdf', sizeKb: 1 }, cv: { fileName: 'b.pdf', sizeKb: 1 } } as Application)).toBe('a.pdf · b.pdf');
    expect(uploadedFiles({ deck: { fileName: 'a.pdf', sizeKb: 1 } } as Application)).toBe('a.pdf');
    expect(uploadedFiles(null)).toBe('');
  });

  it('a start time, or null when unknown', () => {
    expect(since('2026-11-25T14:18:50Z')).toBe(dateTime('2026-11-25T14:18:50Z'));
    expect(since(undefined)).toBeNull();
    expect(since('')).toBeNull();
  });
});
