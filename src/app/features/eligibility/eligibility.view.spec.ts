import { Application } from '@core/models/models';
import { hm } from '@core/utils/format';
import { doneStages, listTime, passportLine, screeningListTimes } from './eligibility.view';

const app = (extra: Partial<Application> = {}) =>
  ({
    createdAt: '2026-03-10T09:00:00Z',
    founder: { firstName: 'Ayşe', lastName: 'Kaya', nationality: 'Almanya', passportNo: 'C01X00T47' },
    contact: { email: '', phone: '', address: 'Torstraße 45, Berlin', postalCode: '10119', country: 'Almanya' },
    funding: 'own-abroad',
    eligibility: { screeningStartedAt: '2026-03-10T10:00:00Z', score: 98.25, address: { fileName: 'fatura.pdf', sizeKb: 10, at: '' } },
    ...extra,
  }) as Application;

describe('eligibility view', () => {
  it('screeningListTimes: one per list, a fifth of the search apart; none with the server', () => {
    const start = Date.parse('2026-03-10T10:00:00Z');
    expect(screeningListTimes(app(), false, 1).map(Date.parse)).toEqual([1, 2, 3, 4, 5].map((i) => start + i * 1000));
    expect(screeningListTimes(app(), false, 10).map(Date.parse)).toEqual([1, 2, 3, 4, 5].map((i) => start + i * 100));
    expect(screeningListTimes(app(), true, 1)).toEqual([]);
    expect(screeningListTimes(app({ eligibility: undefined }), false, 1)).toEqual([]);
    expect(screeningListTimes(null, false, 1)).toEqual([]);
  });

  it('listTime: hours, minutes and seconds; empty without a time', () => {
    const at = '2026-03-10T10:00:07Z';
    expect(listTime(at)).toBe(`${hm(at)}:07`);
    expect(listTime(undefined)).toBe('');
  });

  it('passportLine: nationality, the last four of the passport, five years from the application', () => {
    expect(passportLine(app())).toBe('Almanya · Pasaport no ●●●●0T47 · Son geçerlilik 03/2031');
    expect(passportLine(app({ founder: { firstName: '', lastName: '', nationality: '', passportNo: '' } }))).toBe('— · Pasaport no ●●●● · Son geçerlilik 03/2031');
    expect(passportLine(null)).toBe('');
  });

  it('doneStages: the score and the file name when known, the server\'s plain lines otherwise', () => {
    expect(doneStages(app(), false)).toEqual([
      { t: 'Kimlik doğrulama', s: 'Pasaport MRZ doğrulandı · canlılık eşleşmesi 98,3', d: passportLine(app()) },
      { t: 'Beyan', s: 'Adres belgesi: fatura.pdf · fon kaynağı: yurt dışı banka transferi', d: 'Torstraße 45, Berlin, 10119 Almanya' },
    ]);
    const server = app({ funding: 'third-party', eligibility: {} });
    expect(doneStages(server, true)).toEqual([
      { t: 'Kimlik doğrulama', s: 'Kimliğiniz doğrulandı', d: '' },
      { t: 'Beyan', s: 'Adres belgesi alındı · fon kaynağı: üçüncü taraf transferi', d: 'Torstraße 45, Berlin, 10119 Almanya' },
    ]);
    expect(doneStages(app({ eligibility: undefined }), false)).toEqual([]);
    expect(doneStages(null, true)).toEqual([]);
  });
});
