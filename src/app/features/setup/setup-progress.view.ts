import { Application, SetupStep, SetupTask, Stage } from '@core/models/models';
import { AGENCIES, setupView } from '@core/reference/timeline';

/** The mock's scripted set-up as the store reports it (`ApplicationStore.setup`). */
export type SetupRun = ReturnType<typeof setupView>;
/** The server's steps: undefined in the mock, null while the server has not created them. */
export type ServerSteps = SetupStep[] | null | undefined;

/**
 * The picture, and the seven heights in it, in % of its height from the top: the ground line,
 * then the top of the slab above each of the six floors (the last is the top of the picture,
 * so the roof and its sign come with the sixth floor). Measured from the file; measure again
 * when the picture is replaced (art/README.md, "Building scene").
 */
export const BUILDING = { src: '/assets/illustrations/building.webp', levels: [97.9, 79.9, 66.4, 52.6, 38.2, 23.2, 0] };

/** How long D-5a stays after the sixth floor is finished, in ms: long enough for the finishing moment below. */
export const FINISHED_HOLD = 3600;

/**
 * The finishing moment's parts, drawn over the picture once the sixth floor is done (the order
 * and timing are in wizard.scss, "finishing moment"): a band of light for each floor, running
 * up the building, and a burst of paper from the roof in the picture's own colours.
 */
export const FLOOR_BANDS = BUILDING.levels.slice(0, 6).map((bottom, i) => ({ i, top: BUILDING.levels[i + 1], height: bottom - BUILDING.levels[i + 1] }));
export const CONFETTI = Array.from({ length: 40 }, (_, i) => {
  // The same burst every time: a fixed pseudo-random spread, not Math.random.
  const r = (n: number) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    dx: Math.round((r(1) - 0.5) * 560),
    up: Math.round(40 + r(2) * 110),
    fall: Math.round(170 + r(3) * 220),
    rot: Math.round((r(4) - 0.5) * 1080),
    delay: (0.95 + r(5) * 0.22).toFixed(2) + 's',
    dur: (1.5 + r(6) * 0.9).toFixed(2) + 's',
    w: Math.round(5 + r(7) * 4),
    h: i % 4 === 0 ? Math.round(5 + r(7) * 4) : Math.round(9 + r(8) * 6),
    round: i % 4 === 0,
    color: ['#061262', '#9DB6FF', '#C7D5F7', '#E5484D', '#4F7CF0'][i % 5],
  };
});

/** How high the building stands: floors finished (the count on the picture), the built line in %, and whether all six are. */
export interface Rise {
  done: number;
  top: number;
  finished: boolean;
}

/**
 * Mock: the height follows time, not finished sub-steps: where the run stands among all its
 * sub-steps, as a fraction, so the building rises without jumps at any demo speed. The six agency
 * steps that run on D-5a (AGENCIES 4 to 9) are the six floors.
 */
export function mockRise(v: SetupRun | null): Rise {
  const lens = AGENCIES.slice(3).map((a) => a.subs.length);
  let pos = (v?.p ?? 0) * lens.reduce((s, n) => s + n, 0);
  let floor = 0;
  while (floor < 6 && pos >= lens[floor]) pos -= lens[floor++];
  const lv = BUILDING.levels;
  return {
    /** Floors finished: the count on the picture. Equals the agency steps finished. */
    done: floor,
    top: floor >= 6 ? lv[6] : lv[floor] + (pos / lens[floor]) * (lv[floor + 1] - lv[floor]),
    finished: floor >= 6,
  };
}

/** The steps of the formation run itself (4 to 9); 1 to 3 were finished in the earlier wizard steps. */
export function runSteps(steps: ServerSteps) {
  return (steps ?? []).filter((s) => s.no >= 4).sort((a, b) => a.no - b.no);
}

/**
 * HTTP mode: the building stands at the number of formation steps (4 to 9) the server reports
 * completed, a whole floor each; nothing rises with time. The floors stand for a count, not for a
 * particular step: on the server several steps run side by side.
 */
export function serverRise(steps: ServerSteps, stage: Stage | null): Rise {
  const run = runSteps(steps);
  const done = Math.min(6, run.filter((s) => s.status === 'completed').length);
  const finished = stage === 'done' || (run.length > 0 && done >= run.length);
  const lv = BUILDING.levels;
  return { done: finished ? 6 : done, top: lv[finished ? 6 : done], finished };
}

/** A row of D-5a's step list. */
export interface AgencyRow {
  n: string;
  t: string;
  ag: string;
  done: boolean;
  cur: boolean;
  up: boolean;
  label: string;
  bg: string;
  weight: number;
  color: string;
}

function row(n: number, t: string, ag: string, done: boolean, cur: boolean, label: string): AgencyRow {
  return {
    n: String(n).padStart(2, '0'),
    t,
    ag,
    done,
    cur,
    up: !done && !cur,
    label,
    bg: cur ? 'var(--bg-F7F9FE)' : 'transparent',
    weight: cur ? 600 : 500,
    color: done || cur ? 'var(--fg-061262)' : 'var(--fg-5B6478)',
  };
}

/** Mock: the nine agency steps, finished up to the one the scripted run is at. */
export function mockAgencies(v: SetupRun | null): AgencyRow[] {
  const cur = v?.agency ?? 0;
  return AGENCIES.map((a, i) => row(i + 1, a.t, a.ag, i < cur, i === cur, i < cur ? 'Tamamlandı' : i === cur ? 'İşlemde' : 'Sırada'));
}

/**
 * HTTP mode: the rows of D-5a's list are the server's nine steps with their own titles and states.
 * The server leaves a step `pending` until one of its tasks is completed, even while a task is
 * already with the institution, so a step counts as running ("İşlemde") when the server says so or
 * when one of its tasks has started. No institution line under the title: the API sends none.
 */
export function serverAgencies(steps: ServerSteps): AgencyRow[] {
  return (steps ?? []).map((st) => {
    const done = st.status === 'completed';
    const cur = !done && (st.status === 'in_progress' || st.tasks.some((t) => t.status === 'waiting' || t.status === 'in_progress' || t.status === 'done'));
    const held = !done && !cur && st.status === 'other';
    return row(st.no, st.title, '', done, cur, done ? 'Tamamlandı' : cur ? 'İşlemde' : held ? 'Beklemede' : 'Sırada');
  });
}

/** Mock: the agency step running now and its current sub-step, for the line above the list. */
export function currentStep(v: SetupRun | null) {
  if (!v) return null;
  const a = AGENCIES[Math.min(v.agency, AGENCIES.length - 1)];
  const sub = a.subs[Math.min(v.sub, a.subs.length - 1)];
  return { idx: Math.min(v.agency + 1, AGENCIES.length), total: AGENCIES.length, t: a.t, ag: a.ag, sub: `${sub.t}…`, percent: v.percent };
}

/** Agency steps finished so far (HTTP mode: the server's completed steps). */
export function doneCount(v: SetupRun | null, steps: ServerSteps, serverDecides: boolean) {
  return serverDecides ? (steps ?? []).filter((s) => s.status === 'completed').length : Math.min(v?.agency ?? 0, AGENCIES.length);
}

/** "Alt adımları göster (12 / 34)": sub-steps finished and in all (HTTP mode: the server's tasks; an exempt one counts as finished). */
export function subCount(v: SetupRun | null, steps: ServerSteps, serverDecides: boolean) {
  if (!serverDecides) return { done: v?.done ?? 0, total: AGENCIES.reduce((s, a) => s + a.subs.length, 0) };
  const tasks = (steps ?? []).flatMap((s) => s.tasks);
  return { done: tasks.filter((t) => t.status === 'done' || t.status === 'exempt').length, total: tasks.length };
}

/** A group of sub-steps under "Alt adımları göster": its step, and each sub-step's mark, colours and text. */
export interface DetailGroup {
  n: string;
  t: string;
  subs: { i: string; ic: string; color: string; t: string; exempt: boolean; deco: string }[];
}

/** Mock: sub-steps of the agencies still running or queued (steps 4 to 9). */
export function mockDetails(v: SetupRun | null): DetailGroup[] {
  if (!v) return [];
  let k = 0;
  const out: DetailGroup[] = [];
  AGENCIES.forEach((a, ai) => {
    const subs = a.subs.map((s, si) => {
      const idx = k + si;
      const state = s.kind === 'exempt' ? 'x' : idx < v.done ? 'd' : idx === v.done ? 'c' : 'u';
      const [i, ic, color] = { d: ['✓', 'var(--fg-15803D)', 'var(--fg-1F2A44)'], c: ['›', 'var(--fg-061262)', 'var(--fg-061262)'], u: ['·', 'var(--fg-8A93A6)', 'var(--fg-5B6478)'], x: ['–', 'var(--fg-8A93A6)', 'var(--fg-5B6478)'] }[state];
      return { i, ic, color, t: s.t + (state === 'c' ? '…' : ''), exempt: state === 'x', deco: state === 'x' ? 'line-through' : 'none' };
    });
    k += a.subs.length;
    if (ai >= 3) out.push({ n: String(ai + 1).padStart(2, '0'), t: a.t, subs });
  });
  return out;
}

/** How each server task state looks in D-5a's sub-step list: [mark, mark colour, text colour]. */
const TASK_LOOK: Record<SetupTask['status'], [string, string, string]> = {
  done: ['✓', 'var(--fg-15803D)', 'var(--fg-1F2A44)'],
  waiting: ['›', 'var(--fg-061262)', 'var(--fg-061262)'],
  in_progress: ['›', 'var(--fg-061262)', 'var(--fg-061262)'],
  pending: ['·', 'var(--fg-8A93A6)', 'var(--fg-5B6478)'],
  exempt: ['–', 'var(--fg-8A93A6)', 'var(--fg-5B6478)'],
  other: ['·', 'var(--fg-8A93A6)', 'var(--fg-5B6478)'],
};

/** What follows a server task's title in that list. */
const TASK_NOTE: Record<SetupTask['status'], string> = {
  done: '',
  waiting: ' · kurumda bekliyor',
  in_progress: ' · işlemde',
  pending: ' · sırada',
  exempt: '',
  other: ' · beklemede',
};

/** HTTP mode: the tasks of steps 4 to 9 as the server reports them; `waiting` reads "kurumda bekliyor". */
export function serverDetails(steps: ServerSteps): DetailGroup[] {
  return runSteps(steps).map((st) => ({
    n: String(st.no).padStart(2, '0'),
    t: st.title,
    subs: st.tasks.map((task) => {
      const [i, ic, color] = TASK_LOOK[task.status];
      return { i, ic, color, t: task.title + TASK_NOTE[task.status], exempt: task.status === 'exempt', deco: task.status === 'exempt' ? 'line-through' : 'none' };
    }),
  }));
}

/**
 * HTTP mode: the company's numbers that have arrived so far (each comes when staff complete the
 * institution task that issues it). Only what the API sent.
 */
export function arrivedNumbers(results: Application['results']) {
  if (!results) return [];
  const r = results;
  return [
    { k: 'MERSİS no', v: r.mersis },
    { k: 'Ticaret sicili tescil no', v: r.registryNo },
    { k: 'Vergi kimlik no', v: r.vkn },
    { k: 'Vergi dairesi', v: r.taxOffice },
    { k: 'IBAN', v: r.iban },
    { k: 'e-Fatura kayıt no', v: r.eInvoiceNo },
    { k: 'SGK işyeri sicil no', v: r.sgkNo },
  ].filter((x): x is { k: string; v: string } => !!x.v);
}
