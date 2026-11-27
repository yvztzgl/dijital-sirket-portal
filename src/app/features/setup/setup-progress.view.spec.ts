import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { SetupStep } from '@core/models/models';
import { AGENCIES, setupView } from '@core/reference/timeline';
import {
  arrivedNumbers,
  BUILDING,
  CONFETTI,
  currentStep,
  doneCount,
  FLOOR_BANDS,
  mockAgencies,
  mockDetails,
  mockRise,
  runSteps,
  serverAgencies,
  serverDetails,
  serverRise,
  subCount,
} from './setup-progress.view';

const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
const steps = () => toApplication(CAPTURED.setupSteps as never, account).setup!.steps!;
const allSubs = AGENCIES.reduce((s, a) => s + a.subs.length, 0);

describe('D-5a view, mock', () => {
  it('the building rises with the run: ground, part of a floor, all six', () => {
    expect(mockRise(null)).toEqual({ done: 0, top: 97.9, finished: false });
    expect(mockRise(setupView(0))).toEqual({ done: 0, top: 97.9, finished: false });
    const mid = mockRise(setupView(0.5));
    expect(mid.done).toBeGreaterThan(0);
    expect(mid.done).toBeLessThan(6);
    expect(mid.top).toBeLessThanOrEqual(BUILDING.levels[mid.done]);
    expect(mid.top).toBeGreaterThan(BUILDING.levels[mid.done + 1]);
    expect(mockRise(setupView(1))).toEqual({ done: 6, top: 0, finished: true });
  });

  it('the nine agency steps around the one running', () => {
    const rows = mockAgencies(setupView(0));
    expect(rows.map((r) => r.label)).toEqual(['Tamamlandı', 'Tamamlandı', 'Tamamlandı', 'İşlemde', 'Sırada', 'Sırada', 'Sırada', 'Sırada', 'Sırada']);
    expect(rows[3]).toEqual({ n: '04', t: AGENCIES[3].t, ag: AGENCIES[3].ag, done: false, cur: true, up: false, label: 'İşlemde', bg: 'var(--bg-F7F9FE)', weight: 600, color: 'var(--fg-061262)' });
    expect(rows[8]).toMatchObject({ n: '09', up: true, bg: 'transparent', weight: 500, color: 'var(--fg-5B6478)' });
    expect(mockAgencies(null)[0].label).toBe('İşlemde');
  });

  it('the current step and sub-step, the counts', () => {
    const v = setupView(0);
    expect(currentStep(null)).toBeNull();
    expect(currentStep(v)).toEqual({ idx: 4, total: 9, t: AGENCIES[3].t, ag: AGENCIES[3].ag, sub: `${AGENCIES[3].subs[0].t}…`, percent: v.percent });
    expect(currentStep(setupView(1))).toMatchObject({ idx: 9, t: AGENCIES[8].t });
    expect(doneCount(v, undefined, false)).toBe(3);
    expect(doneCount(setupView(1), undefined, false)).toBe(9);
    expect(subCount(v, undefined, false)).toEqual({ done: v.done, total: allSubs });
    expect(subCount(null, undefined, false)).toEqual({ done: 0, total: allSubs });
  });

  it('the sub-steps of steps 4 to 9: running, queued, exempt', () => {
    expect(mockDetails(null)).toEqual([]);
    const groups = mockDetails(setupView(0));
    expect(groups.map((g) => g.n)).toEqual(['04', '05', '06', '07', '08', '09']);
    expect(groups[0].subs[0]).toEqual({ i: '›', ic: 'var(--fg-061262)', color: 'var(--fg-061262)', t: `${AGENCIES[3].subs[0].t}…`, exempt: false, deco: 'none' });
    expect(groups[0].subs[1]).toMatchObject({ i: '·', t: AGENCIES[3].subs[1].t });
    expect(groups[1].subs.find((s) => s.exempt)).toEqual({ i: '–', ic: 'var(--fg-8A93A6)', color: 'var(--fg-5B6478)', t: 'Yoklama tutanağı (sanal ofis)', exempt: true, deco: 'line-through' });
    expect(mockDetails(setupView(1)).flatMap((g) => g.subs).filter((s) => !s.exempt).every((s) => s.i === '✓')).toBe(true);
  });
});

describe('D-5a view, HTTP mode', () => {
  it('runSteps: steps 4 to 9 in order', () => {
    const shuffled = [...steps()].reverse();
    expect(runSteps(shuffled).map((s) => s.no)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(runSteps(null)).toEqual([]);
    expect(runSteps(undefined)).toEqual([]);
  });

  it('the building stands at the run steps completed; done means all six', () => {
    expect(serverRise(null, 'setup')).toEqual({ done: 0, top: 97.9, finished: false });
    expect(serverRise(steps(), 'setup')).toEqual({ done: 0, top: 97.9, finished: false });
    const two = steps().map((s) => (s.no === 4 || s.no === 6 ? { ...s, status: 'completed' as const } : s));
    expect(serverRise(two, 'setup')).toEqual({ done: 2, top: 66.4, finished: false });
    const all = steps().map((s) => ({ ...s, status: 'completed' as const }));
    expect(serverRise(all, 'setup')).toEqual({ done: 6, top: 0, finished: true });
    expect(serverRise(steps(), 'done')).toEqual({ done: 6, top: 0, finished: true });
  });

  it('rows: the server\'s titles; running when a task has started; held when the server says so', () => {
    const s: SetupStep[] = steps();
    s[5] = { ...s[5], status: 'other', tasks: [] };
    s[6] = { ...s[6], status: 'in_progress', tasks: [] };
    const rows = serverAgencies(s);
    expect(rows.map((r) => r.t)).toEqual(s.map((x) => x.title));
    expect(rows.map((r) => r.label)).toEqual(['Tamamlandı', 'Tamamlandı', 'Tamamlandı', 'İşlemde', 'Sırada', 'Beklemede', 'İşlemde', 'Sırada', 'Sırada']);
    expect(rows.every((r) => r.ag === '')).toBe(true);
    expect(serverAgencies(null)).toEqual([]);
  });

  it('counts from the server: completed steps, tasks done or exempt', () => {
    expect(doneCount(null, steps(), true)).toBe(3);
    expect(subCount(null, steps(), true)).toEqual({ done: 7, total: 13 });
    expect(subCount(null, null, true)).toEqual({ done: 0, total: 0 });
  });

  it('the tasks of steps 4 to 9 with their state notes', () => {
    const groups = serverDetails(steps());
    expect(groups.map((g) => g.n)).toEqual(['04', '05', '06', '07', '08', '09']);
    expect(groups[0].subs).toEqual([{ i: '›', ic: 'var(--fg-061262)', color: 'var(--fg-061262)', t: 'Ticaret sicili tescil edildi · kurumda bekliyor', exempt: false, deco: 'none' }]);
    expect(groups[1].subs.map((x) => [x.i, x.t, x.deco])).toEqual([
      ['·', 'Vergi mükellefiyeti açıldı · sırada', 'none'],
      ['–', 'Yoklama tutanağı (sanal ofis)', 'line-through'],
    ]);
    const notes = (status: SetupStep['tasks'][number]['status']) => serverDetails([{ no: 4, code: 'x', title: 'X', status: 'pending', tasks: [{ code: 't', title: 'T', status }] }])[0].subs[0];
    expect(notes('done')).toMatchObject({ i: '✓', t: 'T', color: 'var(--fg-1F2A44)' });
    expect(notes('in_progress')).toMatchObject({ i: '›', t: 'T · işlemde' });
    expect(notes('other')).toMatchObject({ i: '·', t: 'T · beklemede' });
  });

  it('arrived numbers: only what the API sent, in a fixed order', () => {
    expect(arrivedNumbers(undefined)).toEqual([]);
    expect(arrivedNumbers({ registryNo: '1', mersis: '2' })).toEqual([
      { k: 'MERSİS no', v: '2' },
      { k: 'Ticaret sicili tescil no', v: '1' },
    ]);
    const all = toApplication(CAPTURED.setupDone as never, account).results!;
    expect(arrivedNumbers(all).map((x) => x.k)).toEqual(['MERSİS no', 'Ticaret sicili tescil no', 'Vergi kimlik no', 'Vergi dairesi', 'IBAN', 'e-Fatura kayıt no', 'SGK işyeri sicil no']);
  });
});

describe('D-5a finishing moment', () => {
  it('a band per floor, from the ground up', () => {
    expect(FLOOR_BANDS).toHaveLength(6);
    expect(FLOOR_BANDS[0]).toEqual({ i: 0, top: 79.9, height: 97.9 - 79.9 });
    expect(FLOOR_BANDS[5]).toEqual({ i: 5, top: 0, height: 23.2 });
  });

  it('the same forty pieces of paper every time', () => {
    expect(CONFETTI).toHaveLength(40);
    expect(CONFETTI.filter((c) => c.round)).toHaveLength(10);
    expect(CONFETTI[0].color).toBe('#061262');
    expect(CONFETTI.every((c) => /^\d\.\d\ds$/.test(c.delay) && /^\d\.\d\ds$/.test(c.dur))).toBe(true);
  });
});
