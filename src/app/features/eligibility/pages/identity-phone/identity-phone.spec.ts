import { Location } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { PhoneLinkStatus } from '@core/models/models';
import { DURATION } from '@core/reference/timeline';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { eligibilityRoutes } from '../../eligibility.routes';

const routes = [...eligibilityRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open(token: string) {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(`/eligibility/phone#${token}`);
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const all = (selector: string) => [...root().querySelectorAll(selector)].map((e) => e.textContent?.trim());
  const start = () => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Doğrulamayı başlat');
  const tick = () => {
    const box = root().querySelector<HTMLInputElement>('.wz-check input')!;
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    harness.detectChanges();
  };
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    harness.detectChanges();
  };
  return { harness, root, q, all, start, tick, settle };
}

/** D-2a-m against the mock API: the link is made by the computer's store in the same browser. */
describe('IdentityPhonePage (D-2a-m), mock', () => {
  let store: ApplicationStore;
  let now: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    now = signal(Date.now());
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('eligibility');
    await store.createPhoneLink();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reads the token from the fragment, takes it out of the address and clears an earlier error', async () => {
    const token = store.app()!.phoneLink!.token;
    const status = vi.spyOn(TestBed.inject(Api), 'phoneLinkStatus');
    store.error.set('Önceki ekranın hatası.');
    const page = await open(token);
    expect(store.error()).toBeNull();
    expect(status).toHaveBeenCalledWith(token);
    expect(TestBed.inject(Location).path(true)).toBe('/eligibility/phone');
    await page.settle();
  });

  it('a live link: the rules and the consent; the start waits for the tick and sends it', async () => {
    const token = store.app()!.phoneLink!.token;
    const startByPhone = vi.spyOn(TestBed.inject(Api), 'startEligibilityByPhone');
    const page = await open(token);
    await vi.waitFor(() => expect(store.phone()?.state).toBe('ready'));
    page.harness.detectChanges();
    expect(page.q('h1')).toBe('Kimlik doğrulamasını başlatınız');
    expect(page.q('.wz-lead')).toBe('Doğrulama, pasaportunuz ve telefonunuzun kamerası ile yapılır.');
    expect(page.all('.wz-rules .do li')).toEqual(['Pasaportun fotoğraflı sayfasını çerçeveye tam yerleştiriniz.', 'Yüzünüzü açık ve tam görünür tutunuz.', 'Doğrulama tamamlanana kadar kameranın karşısında kalınız.']);
    expect(page.all('.wz-rules .dont li')).toEqual(['Güneş gözlüğü, şapka veya maske takmayınız.', 'Pasaportun fotokopisini veya ekran görüntüsünü göstermeyiniz.', 'Kadrajda başka bir kişi bulundurmayınız.']);
    // Nothing about the founder or the company.
    expect(page.root().textContent).not.toContain(store.app()!.founder.lastName);
    expect(page.start()!.disabled).toBe(true);
    page.tick();
    expect(page.start()!.disabled).toBe(false);
    page.start()!.click();
    await vi.waitFor(() => expect(store.phone()?.state).toBe('running'));
    expect(startByPhone).toHaveBeenCalledWith(token, true);
    TestBed.inject(DemoSettings).set({ speed: 1 });
    now.set(Date.parse((store.phone() as { startedAt: string }).startedAt) + 0.1 * DURATION.identity);
    page.harness.detectChanges();
    expect(page.q('h1')).toBe('Pasaportunuzu kameraya gösteriniz');
    expect(page.q('.wz-kyc .cap')).toBe('Fotoğraflı sayfayı çerçeveye yerleştiriniz');
    now.set(Date.parse((store.phone() as { startedAt: string }).startedAt) + 0.55 * DURATION.identity);
    page.harness.detectChanges();
    expect(page.q('h1')).toBe('Yüzünüzü çerçevenin içinde tutunuz');
    expect(page.q('.wz-kyc .prompt')).toBe('Göz kırpınız');
    expect([...page.root().querySelectorAll('.wz-kyc .pills li')].map((li) => li.className.trim())).toEqual(['done', 'cur', '']);
  });

  it('the check ends on the phone: done, and the computer\'s application moves on', async () => {
    const token = store.app()!.phoneLink!.token;
    const page = await open(token);
    await vi.waitFor(() => expect(store.phone()?.state).toBe('ready'));
    page.harness.detectChanges();
    page.tick();
    page.start()!.click();
    await vi.waitFor(() => expect(store.phone()?.state).toBe('running'));
    now.set(Date.now() + 60_000);
    page.harness.detectChanges();
    await vi.waitFor(() => expect(store.phone()?.state).toBe('done'));
    page.harness.detectChanges();
    expect(page.q('h1')).toBe('Doğrulama tamamlandı');
  });

  it('a code that runs out while the page is open', async () => {
    const token = store.app()!.phoneLink!.token;
    const page = await open(token);
    await vi.waitFor(() => expect(store.phone()?.state).toBe('ready'));
    now.set(Date.parse(store.app()!.phoneLink!.expiresAt) + 1);
    page.harness.detectChanges();
    expect(page.q('h1')).toBe('Bağlantının süresi doldu');
    expect(page.q('.wz-lead')).toBe('Bilgisayarınızdaki sayfadan yeni bir QR kod oluşturunuz.');
    expect(page.start()).toBeUndefined();
  });

  it('an unknown token: the link is invalid', async () => {
    const page = await open('no-such-token');
    await vi.waitFor(() => expect(store.phone()?.state).toBe('invalid'));
    page.harness.detectChanges();
    expect(page.q('h1')).toBe('Bağlantı geçersiz');
  });

  it('while the link is being looked up', async () => {
    vi.spyOn(TestBed.inject(Api), 'phoneLinkStatus').mockReturnValue(new Promise(() => undefined));
    const page = await open('any');
    expect(page.q('[role=status]')).toBe('Bağlantı kontrol ediliyor…');
  });
});

/** D-2a-m in HTTP mode: the store over a stand-in for the API that answers with the captured phone statuses. */
describe('IdentityPhonePage (D-2a-m), HTTP mode', () => {
  const ready: PhoneLinkStatus = { state: 'ready', expiresAt: CAPTURED.phoneReady.expiresAt! };
  const running: PhoneLinkStatus = { state: 'running', startedAt: CAPTURED.phoneRunning.startedAt! };
  const startedAt = Date.parse(CAPTURED.phoneRunning.startedAt!);

  function setUp(status: PhoneLinkStatus, now: number, calls: Record<string, unknown> = {}) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: 'eligibility', changedAt: 't0' };
    const api = {
      demo: null,
      work: { kind: 'server', status: async () => seen, application: async () => null, seen: () => seen },
      restore: async () => null,
      phoneLinkStatus: vi.fn(async () => status),
      ...calls,
    };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(now) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return { store, api };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('ready: the start sends the token and the consent exactly as ticked', async () => {
    const startEligibilityByPhone = vi.fn(async () => running);
    const { api } = setUp(ready, startedAt - 1_000, { startEligibilityByPhone });
    const page = await open('tok-abc');
    await page.settle();
    expect(api.phoneLinkStatus).toHaveBeenCalledWith('tok-abc');
    expect(page.q('h1')).toBe('Kimlik doğrulamasını başlatınız');
    page.tick();
    page.start()!.click();
    await page.settle();
    expect(startEligibilityByPhone).toHaveBeenCalledWith('tok-abc', true);
    expect(page.q('h1')).toBe('Pasaportunuzu kameraya gösteriniz');
  });

  it('a refused start: the API\'s sentence above the button', async () => {
    const startEligibilityByPhone = vi.fn(async () => {
      throw new ApiError('Bağlantının süresi dolmuştur. Bilgisayarınızdaki sayfadan yeni bir QR kod oluşturunuz.', { code: 'link_expired', status: 409 });
    });
    setUp(ready, startedAt - 1_000, { startEligibilityByPhone });
    const page = await open('tok-abc');
    await page.settle();
    page.tick();
    page.start()!.click();
    await page.settle();
    expect(page.q('[role=alert]')).toBe('Bağlantının süresi dolmuştur. Bilgisayarınızdaki sayfadan yeni bir QR kod oluşturunuz.');
  });

  it('the animation ended: the result is awaited and the server is told once', async () => {
    const completeIdentityByPhone = vi.fn(async () => running);
    setUp(running, startedAt + DURATION.identity + 1_000, { completeIdentityByPhone });
    const page = await open('tok-abc');
    await page.settle();
    expect(page.q('h1')).toBe('Doğrulama sonucu bekleniyor');
    expect(page.q('.wz-kyc .okay b')).toBe('Doğrulama sonucu bekleniyor');
    expect(page.q('.wz-kyc .okay small')).toBe('Sonuç birkaç saniye içinde gösterilir.');
    await vi.waitFor(() => expect(completeIdentityByPhone).toHaveBeenCalledTimes(1));
    expect(completeIdentityByPhone).toHaveBeenCalledWith('tok-abc');
  });

  it('done, expired and invalid as the API reports them', async () => {
    for (const [status, heading] of [
      [{ state: 'done' }, 'Doğrulama tamamlandı'],
      [{ state: 'expired' }, 'Bağlantının süresi doldu'],
      [{ state: 'invalid' }, 'Bağlantı geçersiz'],
    ] as const) {
      TestBed.resetTestingModule();
      setUp(status, startedAt);
      const page = await open('tok-abc');
      await page.settle();
      expect(page.q('h1')).toBe(heading);
    }
  });
});
