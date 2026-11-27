import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED, IDENTITY_FAILED } from '@core/api/testing/api-fixtures';
import { Application } from '@core/models/models';
import { DURATION } from '@core/reference/timeline';
import { Assistant } from '@core/services/assistant';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { eligibilityRoutes } from '../../eligibility.routes';

const routes = [...eligibilityRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

const DO = ['Pasaportun fotoğraflı sayfasını çerçeveye tam yerleştiriniz.', 'Yüzünüzü açık ve tam görünür tutunuz.', 'Doğrulama tamamlanana kadar kameranın karşısında kalınız.'];
const DONT = ['Güneş gözlüğü, şapka veya maske takmayınız.', 'Pasaportun fotokopisini veya ekran görüntüsünü göstermeyiniz.', 'Kadrajda başka bir kişi bulundurmayınız.'];

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/eligibility');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const all = (selector: string) => [...root().querySelectorAll(selector)].map((e) => e.textContent?.trim());
  // Exact text: the side panel has a suggestion card that also mentions the camera.
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  const click = async (label: string) => {
    button(label)!.click();
    harness.detectChanges();
    await new Promise((r) => setTimeout(r));
    harness.detectChanges();
  };
  const tick = () => {
    const box = root().querySelector<HTMLInputElement>('.wz-check input')!;
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    harness.detectChanges();
  };
  const alert = () => q('[role=alert]');
  return { harness, root, q, all, button, click, tick, alert };
}

/** D-2a against the mock API; the camera check's time comes from a hand-moved `Clock`. */
describe('IdentityCheckPage (D-2a), mock', () => {
  let store: ApplicationStore;
  let now: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    now = signal(Date.now() - 60_000);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('eligibility');
  });

  afterEach(() => vi.unstubAllGlobals());

  /** Starts the check and moves the clock to `ms` (real time) after its start. */
  async function started(page: Awaited<ReturnType<typeof open>>) {
    page.tick();
    await page.click('Doğrulamayı başlat');
    await vi.waitFor(() => expect(store.app()!.eligibility?.startedAt).toBeTruthy());
    TestBed.inject(DemoSettings).set({ speed: 1 });
    const start = Date.parse(store.app()!.eligibility!.startedAt!);
    return (ms: number) => {
      now.set(start + ms);
      page.harness.detectChanges();
    };
  }

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(store.error()).toBeNull();
    expect(page.alert()).toBeNull();
  });

  it('opens on the pre-information: what to have ready, the do\'s and don\'ts, nothing running', async () => {
    const page = await open();
    expect(page.q('h1')).toBe('Kimlik doğrulamasını başlatınız');
    expect(page.all('.wz-need li b')).toEqual(['Geçerli pasaport', 'Çalışan bir kamera', 'Aydınlık bir ortam']);
    expect(page.all('.wz-rules .do li')).toEqual(DO);
    expect(page.all('.wz-rules .dont li')).toEqual(DONT);
    expect(page.root().querySelector('.wz-notice')).toBeNull();
    expect(page.root().querySelector('.wz-cam')).toBeNull();
    expect(store.app()!.eligibility).toBeUndefined();
  });

  it('"Doğrulamayı başlat" waits for the consent tick; then it starts the check with the consent', async () => {
    const start = vi.spyOn(TestBed.inject(Api), 'startEligibility');
    const page = await open();
    expect(page.button('Doğrulamayı başlat')!.disabled).toBe(true);
    page.tick();
    expect(page.button('Doğrulamayı başlat')!.disabled).toBe(false);
    page.tick();
    expect(page.button('Doğrulamayı başlat')!.disabled).toBe(true);
    expect(start).not.toHaveBeenCalled();
    page.tick();
    await page.click('Doğrulamayı başlat');
    expect(start).toHaveBeenCalledWith(true);
  });

  it('the camera follows the check: passport with the MRZ line, then the face prompts one by one', async () => {
    const page = await open();
    const at = await started(page);
    const f = store.app()!.founder;
    const mrz = (x: string) => x.toLocaleUpperCase('en-US').replace(/[^A-Z]/g, '');
    at(0.1 * DURATION.identity);
    expect(page.q('h1')).toBe('Pasaportunuzu kameraya gösteriniz');
    expect(page.q('.wz-lead')).toBe('Kimliğiniz, pasaportunuz ve kameranız aracılığıyla doğrulanır. Doğrulama tamamlanana kadar kameranın karşısında kalınız.');
    expect(page.q('.wz-kyc .tag')).toBe('Kamera açık');
    expect(page.q('.wz-kyc .mrz span')).toBe(`P<${`${mrz(f.lastName)}<<${mrz(f.firstName)}`.padEnd(30, '<').slice(0, 30)}`);
    expect(page.q('.wz-kyc .cap')).toBe('Fotoğraflı sayfayı çerçeveye yerleştiriniz');
    expect(page.button('Kamera çalışmıyor')).toBeDefined();
    at(0.3 * DURATION.identity);
    expect(page.q('h1')).toBe('Yüzünüzü çerçevenin içinde tutunuz');
    expect(page.root().querySelector('.wz-kyc .oval')).not.toBeNull();
    expect(page.q('.wz-kyc .prompt')).toBe('Başınızı çeviriniz');
    const chips = () => [...page.root().querySelectorAll('.wz-kyc .pills li')].map((li) => [li.textContent?.trim(), li.className.trim()]);
    expect(chips()).toEqual([
      ['Başınızı çeviriniz', 'cur'],
      ['Göz kırpınız', ''],
      ['Gülümseyiniz', ''],
    ]);
    at(0.8 * DURATION.identity);
    expect(page.q('.wz-kyc .prompt')).toBe('Gülümseyiniz');
    expect(chips()).toEqual([
      ['Başınızı çeviriniz', 'done'],
      ['Göz kırpınız', 'done'],
      ['Gülümseyiniz', 'cur'],
    ]);
    expect(page.root().querySelectorAll('.wz-kyc .pills li.done app-icon').length).toBe(2);
  });

  it('moves on to the declaration when the check ends', async () => {
    const page = await open();
    const at = await started(page);
    at(DURATION.identity);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/eligibility/declaration'));
    expect(store.stage()).toBe('declaration');
  });

  it('"Kamera çalışmıyor" asks Terminal AI, before and during the check', async () => {
    const ask = vi.spyOn(TestBed.inject(Assistant), 'ask').mockResolvedValue(undefined);
    const page = await open();
    await page.click('Kamera çalışmıyor');
    expect(ask).toHaveBeenLastCalledWith('Kamera çalışmıyorsa ne yapılır?');
    const at = await started(page);
    at(0.1 * DURATION.identity);
    await page.click('Kamera çalışmıyor');
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('"Telefonla devam et": a QR code for a new link, its time left, the demo link to the phone page', async () => {
    const create = vi.spyOn(TestBed.inject(Api), 'createPhoneLink');
    const page = await open();
    await page.click('Telefonla devam et');
    await vi.waitFor(() => expect(store.app()!.phoneLink).toBeTruthy());
    page.harness.detectChanges();
    expect(create).toHaveBeenCalledTimes(1);
    const link = store.app()!.phoneLink!;
    now.set(Date.parse(link.expiresAt) - 90_000);
    page.harness.detectChanges();
    expect(page.q('h1')).toBe('QR kodu telefonunuzla okutunuz');
    expect(page.root().querySelector('app-qr-code svg')?.getAttribute('aria-label')).toBe('Kimlik doğrulama sayfasını telefonda açan QR kod');
    expect(page.q('.wz-phone .ttl')).toBe('Kodun kalan geçerlilik süresi: 01:30');
    const demo = page.root().querySelector<HTMLAnchorElement>('.wz-actions a')!;
    expect(demo.textContent?.trim()).toBe('Demo: telefon sayfasını aç');
    expect(demo.getAttribute('href')).toBe(`/eligibility/phone#${link.token}`);
    expect(demo.target).toBe('_blank');
    expect(page.root().querySelector('.wz-check')).toBeNull();
  });

  it('an expired code: "Yeni kod oluştur" makes a new link', async () => {
    const create = vi.spyOn(TestBed.inject(Api), 'createPhoneLink');
    const page = await open();
    await page.click('Telefonla devam et');
    await vi.waitFor(() => expect(store.app()!.phoneLink).toBeTruthy());
    const first = store.app()!.phoneLink!;
    now.set(Date.parse(first.expiresAt) + 1);
    page.harness.detectChanges();
    expect(page.q('.wz-phone .gone b')).toBe('Kodun süresi doldu');
    expect(page.root().querySelector('app-qr-code')).toBeNull();
    expect(page.root().querySelector('.wz-phone .ttl')).toBeNull();
    expect(page.root().querySelector('.wz-actions a')).toBeNull();
    await page.click('Yeni kod oluştur');
    await vi.waitFor(() => expect(store.app()!.phoneLink!.token).not.toBe(first.token));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('"Bu bilgisayarla devam et" goes back to the pre-information and clears the error; going to the phone again reuses a live link', async () => {
    const api = TestBed.inject(Api);
    const create = vi.spyOn(api, 'createPhoneLink');
    const forget = vi.spyOn(api, 'forgetPhoneLink');
    const page = await open();
    await page.click('Telefonla devam et');
    await vi.waitFor(() => expect(store.app()!.phoneLink).toBeTruthy());
    now.set(Date.parse(store.app()!.phoneLink!.expiresAt) - 60_000);
    store.error.set('Bir hata.');
    page.harness.detectChanges();
    await page.click('Bu bilgisayarla devam et');
    expect(forget).toHaveBeenCalledTimes(1);
    expect(store.error()).toBeNull();
    expect(page.q('h1')).toBe('Kimlik doğrulamasını başlatınız');
    await page.click('Telefonla devam et');
    expect(page.q('h1')).toBe('QR kodu telefonunuzla okutunuz');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('the QR view says the code is being prepared until the link arrives', async () => {
    const api = TestBed.inject(Api);
    let release: () => void = () => undefined;
    const original = api.createPhoneLink.bind(api);
    vi.spyOn(api, 'createPhoneLink').mockImplementation(() => new Promise((r) => (release = () => r(original()))));
    const page = await open();
    await page.click('Telefonla devam et');
    expect(page.q('.wz-phone .gone')).toBe('Kod hazırlanıyor…');
    release();
    await vi.waitFor(() => expect(store.app()!.phoneLink).toBeTruthy());
  });
});

/** D-2a in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('IdentityCheckPage (D-2a), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (view: unknown) => toApplication(view as never, account);
  const startOf = (app: Application) => Date.parse(app.eligibility!.startedAt!);

  function setUp(app: Application, now: number, calls: Record<string, unknown> = {}) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = {
      demo: null,
      work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen },
      restore: async () => ({ account, app }),
      forgetPhoneLink: () => app,
      ...calls,
    };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(now) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('no check open: the pre-information; the start sends the consent and follows the server\'s check', async () => {
    const running = map(CAPTURED.identityRunning);
    const startEligibility = vi.fn(async () => running);
    setUp(map(CAPTURED.titleReserved), startOf(running) + 1_000, { startEligibility });
    const page = await open();
    expect(page.q('h1')).toBe('Kimlik doğrulamasını başlatınız');
    expect(page.root().querySelector('.wz-notice')).toBeNull();
    page.tick();
    await page.click('Doğrulamayı başlat');
    expect(startEligibility).toHaveBeenCalledWith(true);
    expect(page.q('h1')).toBe('Pasaportunuzu kameraya gösteriniz');
    expect(page.q('.wz-kyc .mrz span')).toBe(`P<${'KURUCUBERG<<DENEME'.padEnd(30, '<')}`);
  });

  it('a refused start: the API\'s sentence under the button, still on the pre-information', async () => {
    const startEligibility = vi.fn(async () => {
      throw new ApiError('Devam etmek için açık rıza metnini onaylayınız.', { code: 'consent_required', status: 400 });
    });
    setUp(map(CAPTURED.titleReserved), Date.parse('2026-11-25T14:30:00Z'), { startEligibility });
    const page = await open();
    page.tick();
    await page.click('Doğrulamayı başlat');
    expect(page.alert()).toBe('Devam etmek için açık rıza metnini onaylayınız.');
    expect(page.q('h1')).toBe('Kimlik doğrulamasını başlatınız');
  });

  it('the animation ended: the result is awaited from the server, which is told once', async () => {
    const app = map(CAPTURED.identityRunning);
    const completeIdentity = vi.fn(async () => app);
    setUp(app, startOf(app) + DURATION.identity + 1_000, { completeIdentity });
    const page = await open();
    expect(page.q('h1')).toBe('Doğrulama sonucu bekleniyor');
    expect(page.q('.wz-kyc .okay b')).toBe('Doğrulama sonucu bekleniyor');
    expect(page.q('.wz-kyc .okay small')).toBe('Sonuç birkaç saniye içinde gösterilir.');
    await vi.waitFor(() => expect(completeIdentity).toHaveBeenCalledTimes(1));
  });

  it('a check started on the phone: this page only follows it and does not finish it', async () => {
    const app = map(CAPTURED.identityRunningPhone);
    const completeIdentity = vi.fn(async () => app);
    setUp(app, startOf(app) + 2_000, { completeIdentity });
    const page = await open();
    expect(page.q('h1')).toBe('Doğrulama telefonunuzda sürüyor');
    expect(page.q('.wz-lead')).toBe('Pasaportunuz ve yüzünüz telefonunuzun kamerasıyla doğrulanır. Bu sayfa kendiliğinden ilerler.');
    expect(page.q('.wz-onphone b')).toBe('Telefonunuzdaki yönergeleri izleyiniz');
    expect(page.q('.wz-onphone small')).toBe('Bu sayfayı açık bırakınız.');
    expect(page.root().querySelector('.wz-onphone .ico.ok')).toBeNull();
    expect(page.root().querySelector('.wz-cam')).toBeNull();
    expect(page.button('Kamera çalışmıyor')).toBeUndefined();
    expect(completeIdentity).not.toHaveBeenCalled();
  });

  it('the phone\'s check ended: the result is awaited, still without telling the server', async () => {
    const app = map(CAPTURED.identityRunningPhone);
    const completeIdentity = vi.fn(async () => app);
    setUp(app, startOf(app) + DURATION.identity + 1_000, { completeIdentity });
    const page = await open();
    expect(page.q('h1')).toBe('Doğrulama sonucu bekleniyor');
    expect(page.q('.wz-onphone b')).toBe('Doğrulama sonucu bekleniyor');
    expect(page.q('.wz-onphone small')).toBe('Sonuç birkaç saniye içinde gösterilir.');
    expect(page.root().querySelector('.wz-onphone .ico.ok')).not.toBeNull();
    await new Promise((r) => setTimeout(r));
    expect(completeIdentity).not.toHaveBeenCalled();
  });

  it('a failed check: the pre-information says so and offers the same start again', async () => {
    const startEligibility = vi.fn(async () => map(CAPTURED.identityRunning));
    setUp(map(IDENTITY_FAILED), Date.parse('2026-11-25T14:30:00Z'), { startEligibility });
    const page = await open();
    expect(page.q('h1')).toBe('Kimlik doğrulamasını başlatınız');
    expect(page.q('.wz-notice b')).toBe('Kimliğiniz doğrulanamadı');
    expect(page.button('Doğrulamayı başlat')!.disabled).toBe(true);
    page.tick();
    await page.click('Doğrulamayı başlat');
    expect(startEligibility).toHaveBeenCalledWith(true);
    expect(page.root().querySelector('.wz-notice')).toBeNull();
  });

  it('a failed check asks for the consent again: the tick is not carried over to the next attempt', async () => {
    const running = map(CAPTURED.identityRunning);
    const startEligibility = vi.fn(async () => running);
    const completeIdentity = vi.fn(async () => map(IDENTITY_FAILED));
    setUp(map(CAPTURED.titleReserved), startOf(running) + 1_000, { startEligibility, completeIdentity });
    const page = await open();
    page.tick();
    await page.click('Doğrulamayı başlat');
    expect(startEligibility).toHaveBeenCalledWith(true);
    // The check ends, the server is told and answers that the identity was not verified.
    (TestBed.inject(Clock).now as unknown as { set(v: number): void }).set(startOf(running) + DURATION.identity + 1_000);
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.q('.wz-notice b')).toBe('Kimliğiniz doğrulanamadı');
    });
    expect(page.root().querySelector<HTMLInputElement>('.wz-check input')!.checked).toBe(false);
    expect(page.button('Doğrulamayı başlat')!.disabled).toBe(true);
    expect(startEligibility).toHaveBeenCalledTimes(1);
  });

  it('the QR view: the API\'s link in the code, no demo link; leaving it forgets the link', async () => {
    const base = map(CAPTURED.titleReserved);
    const expiresAt = '2026-11-25T14:40:00.000Z';
    const withLink = { ...base, phoneLink: { token: 'tok-123', createdAt: '2026-11-25T14:30:00.000Z', expiresAt } };
    const createPhoneLink = vi.fn(async () => withLink);
    const forgetPhoneLink = vi.fn(() => base);
    const store = setUp(base, Date.parse(expiresAt) - 125_000, { createPhoneLink, forgetPhoneLink });
    const page = await open();
    await page.click('Telefonla devam et');
    expect(createPhoneLink).toHaveBeenCalledTimes(1);
    expect(page.root().querySelector('app-qr-code svg')).not.toBeNull();
    expect(page.q('.wz-phone .ttl')).toBe('Kodun kalan geçerlilik süresi: 02:05');
    expect(page.root().querySelector('.wz-actions a')).toBeNull();
    await page.click('Bu bilgisayarla devam et');
    expect(forgetPhoneLink).toHaveBeenCalledTimes(1);
    expect(store.app()!.phoneLink).toBeUndefined();
    expect(page.q('h1')).toBe('Kimlik doğrulamasını başlatınız');
  });

  it('a refused link: the API\'s sentence in the QR view, which waits for a code', async () => {
    const createPhoneLink = vi.fn(async () => {
      throw new ApiError('Kimlik doğrulaması zaten başlatılmıştır.', { code: 'identity_started', status: 409 });
    });
    setUp(map(CAPTURED.titleReserved), Date.parse('2026-11-25T14:30:00Z'), { createPhoneLink });
    const page = await open();
    await page.click('Telefonla devam et');
    expect(page.alert()).toBe('Kimlik doğrulaması zaten başlatılmıştır.');
    expect(page.q('.wz-phone .gone')).toBe('Kod hazırlanıyor…');
  });
});
