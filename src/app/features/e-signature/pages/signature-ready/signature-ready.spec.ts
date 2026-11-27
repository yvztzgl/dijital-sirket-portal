import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { dateTime } from '@core/utils/format';
import { eSignatureRoutes } from '../../e-signature.routes';

const routes = [...eSignatureRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });
const HOUR = 3600_000;

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/e-signature/ready');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  /** The certificate card's rows as [term, value]. */
  const rows = () => [...root().querySelectorAll('.wz-cert dl > div')].map((d) => [d.querySelector('dt')!.textContent!.trim(), d.querySelector('dd')!.textContent!.trim()]);
  const start = () => [...root().querySelectorAll('button')].find((b) => b.textContent?.includes('Kuruluşu başlat'))!;
  const tick = () => {
    const box = root().querySelector<HTMLInputElement>('.tickbox input')!;
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    harness.detectChanges();
  };
  const leftBar = () => root().querySelector<HTMLElement>('.wz-cert .bar span')!.style.width;
  return { harness, root, q, rows, start, tick, leftBar };
}

/** D-4c against the mock API; the time left comes from a hand-moved `Clock`. */
describe('SignatureReadyPage (D-4c), mock', () => {
  let store: ApplicationStore;
  let now: ReturnType<typeof signal<number>>;

  async function seed(founderType: 'foreign' | 'resident' = 'foreign') {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    now = signal(Date.now());
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('signed', founderType);
    // Two hours after the certificate was issued.
    now.set(Date.parse(store.app()!.signature!.issuedAt) + 2 * HOUR);
  }

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    await seed();
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(page.root().querySelector('[role=alert]')).toBeNull();
  });

  it('the video call\'s daily certificate: holder with passport, scope, validity, time left, the call record', async () => {
    await seed();
    const a = store.app()!;
    const page = await open();
    expect(page.q('.wz-chip')).toBe('Görüşme tamamlandı');
    expect(page.q('.wz-cert header b')).toBe('Günlük e-imza');
    expect(page.rows()).toEqual([
      ['Sahibi', `${a.founder.firstName} ${a.founder.lastName} · Pasaport GBR`],
      ['Seri no', a.signature!.serial],
      ['Kapsam', `Yalnızca ${store.title()} A.Ş. kuruluş belgeleri`],
      ['Geçerlilik', `${dateTime(a.signature!.validUntil)} tarihine kadar geçerli`],
    ]);
    expect(page.q('.wz-cert .left .row b')).toBe('22:00');
    expect(page.leftBar()).toBe('92%');
    expect(page.q('.wz-foot')).toBe('Görüşme tutanağı belgelerinize eklendi.');
  });

  it('another nationality: its first three letters', async () => {
    await seed();
    store.app.update((a) => ({ ...a!, founder: { ...a!.founder, nationality: 'Almanya' } }));
    const page = await open();
    expect(page.rows()[0][1]).toMatch(/ · Pasaport ALM$/);
  });

  it('the time left runs down with the clock', async () => {
    await seed();
    const page = await open();
    now.set(Date.parse(store.app()!.signature!.validUntil) - 90 * 60_000);
    page.harness.detectChanges();
    expect(page.q('.wz-cert .left .row b')).toBe('01:30');
    expect(page.leftBar()).toBe('6%');
  });

  it('a resident\'s own e-signature: qualified, holder with T.C. number masked, the undertaking', async () => {
    await seed('resident');
    const a = store.app()!;
    const page = await open();
    expect(page.q('.wz-chip')).toBe('E-imza doğrulandı');
    expect(page.q('.wz-cert header b')).toBe('Nitelikli e-imza');
    expect(page.rows()[0][1]).toBe(`${a.founder.firstName} ${a.founder.lastName} · T.C. ${a.founder.tckn!.slice(0, 3)}●●●●●${a.founder.tckn!.slice(-3)}`);
    expect(page.q('.wz-foot')).toBe('Taahhütname belgelerinize eklendi.');
  });

  it('"Kuruluşu başlat" waits for the confirmation tick, then starts the set-up with it', async () => {
    await seed();
    const startSetup = vi.spyOn(TestBed.inject(Api), 'startSetup');
    const page = await open();
    expect(page.start().disabled).toBe(true);
    expect(page.root().querySelector('.wz-confirm')!.classList.contains('ok')).toBe(false);
    page.tick();
    expect(page.root().querySelector('.wz-confirm')!.classList.contains('ok')).toBe(true);
    page.tick();
    expect(page.start().disabled).toBe(true);
    page.tick();
    page.start().click();
    page.harness.detectChanges();
    expect(startSetup).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/setup'));
  });
});

/** D-4c in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('SignatureReadyPage (D-4c), HTTP mode', () => {
  const foreign = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const resident = { ...foreign, founderType: 'resident' as const };

  function setUp(app: Application, account: typeof foreign, now: number, calls: Record<string, unknown> = {}) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }), ...calls };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(now) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('only what the API reports: the holder\'s name, no scope, no document note', async () => {
    const app = toApplication(CAPTURED.esignSigned, foreign);
    setUp(app, foreign, Date.parse(app.signature!.issuedAt) + HOUR);
    const page = await open();
    expect(page.q('.wz-cert header b')).toBe('Günlük e-imza');
    expect(page.rows()).toEqual([
      ['Sahibi', 'Deneme Kurucu'],
      ['Seri no', CAPTURED.esignSigned.signature!.serial],
      ['Geçerlilik', `${dateTime(app.signature!.validUntil)} tarihine kadar geçerli`],
    ]);
    expect(page.q('.wz-cert .left .row b')).toBe('23:00');
    expect(page.leftBar()).toBe('96%');
    expect(page.root().querySelector('.wz-foot')).toBeNull();
  });

  it('a certificate valid for more than two days: the days left', async () => {
    const view = CAPTURED.residentSigned;
    const issuedAt = view.signature!.issuedAt;
    const long = { ...view, signature: { ...view.signature!, validUntil: new Date(Date.parse(issuedAt) + 365 * 24 * HOUR).toISOString() } };
    setUp(toApplication(long as never, resident), resident, Date.parse(issuedAt) + 24 * HOUR);
    const page = await open();
    expect(page.q('.wz-chip')).toBe('E-imza doğrulandı');
    expect(page.q('.wz-cert header b')).toBe('Nitelikli e-imza');
    expect(page.rows()[0][1]).toBe('Deneme Kurucu');
    expect(page.q('.wz-cert .left .row b')).toBe('364 gün');
    expect(page.leftBar()).toBe('100%');
  });

  it('"Kuruluşu başlat" sends the confirmation to the API and follows it to the set-up', async () => {
    const app = toApplication(CAPTURED.esignSigned, foreign);
    const startSetup = vi.fn(async () => toApplication(CAPTURED.setupStarted, foreign));
    setUp(app, foreign, Date.parse(app.signature!.issuedAt) + HOUR, { startSetup });
    const page = await open();
    page.tick();
    page.start().click();
    expect(startSetup).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/setup'));
  });
});
