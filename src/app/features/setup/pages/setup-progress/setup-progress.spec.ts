import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { AGENCIES } from '@core/reference/timeline';
import { Application } from '@core/models/models';
import { Assistant } from '@core/services/assistant';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { setupRoutes } from '../../setup.routes';

const routes = [...setupRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });
/** How long D-5a stays on the finished building before it moves on. */
const HOLD = 3600;

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/setup');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const all = (selector: string) => [...root().querySelectorAll(selector)].map((e) => e.textContent?.trim() ?? '');
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  const click = (label: string) => {
    button(label)!.click();
    harness.detectChanges();
  };
  const rise = () => {
    const el = root().querySelector<HTMLElement>('.wz-rise')!;
    return { label: el.getAttribute('aria-label'), built: el.style.getPropertyValue('--built'), finished: el.classList.contains('finished'), count: q('.wz-rise .count b') };
  };
  /** The list's rows as [title, institution line, state]. */
  const rows = () => [...root().querySelectorAll('.wz-setup .rows li')].map((li) => [li.querySelector('.t b')!.textContent!.trim(), li.querySelector('.t small')?.textContent?.trim() ?? '', li.querySelector('.s')!.textContent!.trim()]);
  const groups = () => [...root().querySelectorAll('.wz-setup .subs > div')].map((d) => ({ t: d.querySelector('b')!.textContent!.trim(), subs: [...d.querySelectorAll(':scope > span')].map((s) => s.textContent!.trim()) }));
  return { harness, root, text, q, all, button, click, rise, rows, groups };
}

/** D-5a against the mock API; the scripted set-up's time comes from a hand-moved `Clock`. */
describe('SetupProgressPage (D-5a), mock', () => {
  let store: ApplicationStore;
  let now: ReturnType<typeof signal<number>>;
  let started: number;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    now = signal(Date.now());
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('setup');
    // Real time from here: the set-up takes 45 s of the hand-moved clock.
    TestBed.inject(DemoSettings).set({ speed: 1 });
    started = Date.parse(store.app()!.setup!.startedAt);
    now.set(started);
  });

  afterEach(() => vi.unstubAllGlobals());

  const at = (page: Awaited<ReturnType<typeof open>>, ms: number) => {
    now.set(started + ms);
    page.harness.detectChanges();
  };

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    await open();
    expect(store.error()).toBeNull();
  });

  it('opens on the building at the ground, the list closed', async () => {
    const page = await open();
    expect(page.q('h1')).toBe('Şirketiniz kuruluyor');
    expect(page.q('.wz-lead')).toBe('Sizden başka bir işlem beklenmemektedir. Bu sayfayı kapatabilirsiniz; her aşamada e-posta ile bilgilendirilirsiniz.');
    expect(page.rise()).toEqual({ label: 'Altı adımdan 0 tanesi tamamlandı', built: '97.9%', finished: false, count: '0' });
    expect(page.root().querySelectorAll('.wz-rise img')).toHaveLength(2);
    expect(page.root().querySelector<HTMLImageElement>('.wz-rise img.built')!.getAttribute('src')).toBe('/assets/illustrations/building.webp');
    expect(page.root().querySelector('.confetti')).toBeNull();
    expect(page.root().querySelector('#setup-steps')).toBeNull();
    expect(page.button('Detayı gör')!.getAttribute('aria-expanded')).toBe('false');
    expect(page.text()).not.toContain('Kuruluş adımlarınız hazırlanıyor');
  });

  it('"Detayı gör": the nine agency steps, the current one and its sub-step, the percentage', async () => {
    const page = await open();
    page.click('Detayı gör');
    expect(page.button('Detayı gizle')!.getAttribute('aria-expanded')).toBe('true');
    expect(page.q('.wz-setup h2')).toBe('Tamamlanan işlem: 3 / 9');
    const v = store.setup()!;
    expect(page.q('.wz-setup .now p')).toBe(`${AGENCIES[3].t}: ${AGENCIES[3].subs[v.sub].t}…`);
    expect(page.q('.wz-setup .top strong')).toBe(`%${v.percent}`);
    expect(page.rows()).toEqual(AGENCIES.map((a, i) => [a.t, a.ag, i < 3 ? 'Tamamlandı' : i === 3 ? 'İşlemde' : 'Sırada']));
    expect(page.root().querySelectorAll('.wz-setup .segs span.done')).toHaveLength(3);
    expect(page.root().querySelectorAll('.wz-setup .segs span.cur')).toHaveLength(1);
    expect(page.root().querySelector('#setup-steps')!.getAttribute('role')).toBeNull();
    page.click('Detayı gizle');
    expect(page.root().querySelector('#setup-steps')).toBeNull();
  });

  it('"Alt adımları göster": the sub-steps of steps 4 to 9 with their state', async () => {
    const page = await open();
    page.click('Detayı gör');
    const total = AGENCIES.reduce((s, a) => s + a.subs.length, 0);
    const done = store.setup()!.done;
    page.click(`Alt adımları göster (${done} / ${total})`);
    expect(page.button(`Alt adımları gizle (${done} / ${total})`)).toBeDefined();
    const groups = page.groups();
    expect(groups.map((g) => g.t)).toEqual(AGENCIES.slice(3).map((a) => a.t));
    // The first sub-step of step 4 is the one running (its mark is an icon); an exempt one is struck through.
    expect(groups[0].subs[0]).toBe(`${AGENCIES[3].subs[0].t}…`);
    expect(page.root().querySelector('.wz-setup .subs > div > span app-itext app-icon')).not.toBeNull();
    const exempt = [...page.root().querySelectorAll<HTMLElement>('.wz-setup .subs > div > span')].find((s) => s.textContent?.includes('(muaf)'));
    expect(exempt!.textContent).toContain('Yoklama tutanağı (sanal ofis)');
    expect(exempt!.style.textDecoration).toBe('line-through');
  });

  it('the building rises with time, floor by floor', async () => {
    const page = await open();
    at(page, 22_500);
    const r = page.rise();
    expect(Number(r.count)).toBeGreaterThan(0);
    expect(Number(r.count)).toBeLessThan(6);
    expect(r.label).toBe(`Altı adımdan ${r.count} tanesi tamamlandı`);
    expect(parseFloat(r.built)).toBeLessThan(97.9);
    expect(parseFloat(r.built)).toBeGreaterThan(0);
  });

  it('finished: the finishing moment, then "Şirketiniz kuruldu" after the hold', async () => {
    const page = await open();
    at(page, 45_000);
    await vi.waitFor(() => expect(store.stage()).toBe('done'));
    page.harness.detectChanges();
    expect(page.q('h1')).toBe('Şirketiniz kuruldu');
    expect(page.q('.wz-lead')).toBe('Tüm adımlar tamamlandı.');
    expect(page.rise()).toEqual({ label: 'Altı adımdan 6 tanesi tamamlandı', built: '0%', finished: true, count: '6' });
    expect(page.root().querySelectorAll('.wz-rise .band')).toHaveLength(6);
    expect(page.root().querySelector<HTMLElement>('.wz-rise .band')!.style.top).toBe('79.9%');
    expect(page.root().querySelectorAll('.confetti > i')).toHaveLength(40);
    expect(page.q('.wz-rise .plate b')).toBe(store.fullTitle());
    await new Promise((r) => setTimeout(r, 1_000));
    expect(TestBed.inject(Router).url).toBe('/setup');
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/setup/complete'), { timeout: HOLD + 2_000 });
  });

  it('the panel buttons open the documents and the log', async () => {
    const assistant = TestBed.inject(Assistant);
    const page = await open();
    page.click('Belgeleri görüntüle');
    expect(assistant.panel().tab).toBe('docs');
    page.click('İşlem kaydını görüntüle');
    expect(assistant.panel().tab).toBe('log');
  });
});

/** D-5a in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('SetupProgressPage (D-5a), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (view: unknown) => toApplication(view as never, account);

  function setUp(app: Application) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }) };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T12:00:00Z')) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('no steps yet: "hazırlanıyor", no list', async () => {
    setUp(map(CAPTURED.setupStarted));
    const page = await open();
    expect(page.q('h1')).toBe('Şirketiniz kuruluyor');
    expect(page.q('.wz-lead')).toContain('Kurum işlemleri ekibimiz ve ilgili kurumlar tarafından yürütülmektedir');
    expect(page.text()).toContain('Kuruluş adımlarınız hazırlanıyor');
    expect(page.button('Detayı')).toBeUndefined();
    expect(page.rise()).toEqual({ label: 'Altı adımdan 0 tanesi tamamlandı', built: '97.9%', finished: false, count: '0' });
    expect(page.root().querySelector('[aria-label="Alınan bilgiler"]')).toBeNull();
  });

  it('the server\'s steps: the list and the sub-steps open, the server\'s titles and states, no percentage', async () => {
    const app = map(CAPTURED.setupSteps);
    const steps = app.setup!.steps!;
    setUp(app);
    const page = await open();
    expect(page.button('Detayı gizle')).toBeDefined();
    expect(page.root().querySelector('#setup-steps')!.getAttribute('role')).toBe('status');
    expect(page.root().querySelector('#setup-steps')!.getAttribute('aria-live')).toBe('polite');
    expect(page.q('.wz-setup h2')).toBe('Tamamlanan işlem: 3 / 9');
    expect(page.root().querySelector('.wz-setup .now p')).toBeNull();
    expect(page.root().querySelector('.wz-setup .top strong')).toBeNull();
    // Step 4 runs: its task is already with the institution while the step says pending.
    expect(page.rows()).toEqual(steps.map((s, i) => [s.title, '', i < 3 ? 'Tamamlandı' : i === 3 ? 'İşlemde' : 'Sırada']));
    expect(page.button('Alt adımları gizle (7 / 13)')).toBeDefined();
    const groups = page.groups();
    expect(groups.map((g) => g.t)).toEqual(steps.slice(3).map((s) => s.title));
    expect(groups[0].subs).toEqual(['Ticaret sicili tescil edildi · kurumda bekliyor']);
    expect(groups[1].subs).toEqual(['·Vergi mükellefiyeti açıldı · sırada', '–Yoklama tutanağı (sanal ofis) (muaf)']);
    expect(page.rise()).toEqual({ label: 'Altı adımdan 0 tanesi tamamlandı', built: '97.9%', finished: false, count: '0' });
    page.click('Alt adımları gizle');
    expect(page.root().querySelector('.wz-setup .subs')).toBeNull();
    page.click('Detayı gizle');
    expect(page.root().querySelector('#setup-steps')).toBeNull();
  });

  it('a step the server holds reads "Beklemede"; a step in progress "İşlemde"', async () => {
    const app = map(CAPTURED.setupSteps);
    const steps = app.setup!.steps!;
    steps[5] = { ...steps[5], status: 'other', tasks: [] };
    steps[6] = { ...steps[6], status: 'in_progress', tasks: [] };
    setUp(app);
    const page = await open();
    expect(page.rows().map((r) => r[2])).toEqual(['Tamamlandı', 'Tamamlandı', 'Tamamlandı', 'İşlemde', 'Sırada', 'Beklemede', 'İşlemde', 'Sırada', 'Sırada']);
  });

  it('numbers as they arrive; the building stands at the steps completed', async () => {
    const app = map(CAPTURED.setupResults);
    setUp(app);
    const page = await open();
    const r = app.results!;
    expect(page.rise()).toEqual({ label: 'Altı adımdan 1 tanesi tamamlandı', built: '79.9%', finished: false, count: '1' });
    const arrived = [...page.root().querySelectorAll('[aria-label="Alınan bilgiler"] li')].map((li) => [li.querySelector('b')!.textContent, li.querySelector('small')!.textContent]);
    expect(arrived).toEqual([
      [r.mersis, 'MERSİS no'],
      [r.registryNo, 'Ticaret sicili tescil no'],
    ]);
  });

  it('every step completed: finished; when done arrives it holds, then moves with the "founded" transition', async () => {
    const all = map({ ...CAPTURED.setupDone, stage: 'setup' });
    const store = setUp(all);
    const page = await open();
    expect(page.q('h1')).toBe('Şirketiniz kuruldu');
    expect(page.rise().finished).toBe(true);
    expect(page.q('.wz-setup h2')).toBe('Tamamlanan işlem: 9 / 9');

    let classAtStart: boolean | null = null;
    const startViewTransition = vi.fn((cb: () => Promise<void>) => {
      classAtStart = document.documentElement.classList.contains('vt-founded');
      void cb();
      return { finished: Promise.resolve(), ready: Promise.resolve() };
    });
    Object.assign(document, { startViewTransition });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    try {
      store.app.set(map(CAPTURED.setupDone));
      page.harness.detectChanges();
      await new Promise((r) => setTimeout(r, HOLD - 600));
      expect(startViewTransition).not.toHaveBeenCalled();
      expect(TestBed.inject(Router).url).toBe('/setup');
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/setup/complete'), { timeout: 2_000 });
      expect(startViewTransition).toHaveBeenCalledTimes(1);
      expect(classAtStart).toBe(true);
    } finally {
      delete (document as { startViewTransition?: unknown }).startViewTransition;
      delete (document as { visibilityState?: unknown }).visibilityState;
    }
  });
});
