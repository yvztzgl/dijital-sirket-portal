import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED, SIGNATURE_EXPIRED } from '@core/api/testing/api-fixtures';
import { Application } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { eSignatureRoutes } from '../../e-signature.routes';

const routes = [...eSignatureRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open(url = '/e-signature') {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.includes(label) || b.getAttribute('aria-label') === label);
  const click = (label: string) => {
    button(label)!.click();
    harness.detectChanges();
  };
  const alert = () => root().querySelector('[role=alert]')?.textContent?.trim() ?? null;
  return { harness, root, text, button, click, alert };
}

/** D-4a against the mock API, driven through the page's DOM. */
describe('CallLobbyPage (D-4a), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('signing');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(page.alert()).toBeNull();
  });

  it('opens on the pre-information; "Devam et" waits for the consent tick and records it', async () => {
    const accept = vi.spyOn(TestBed.inject(Api), 'acceptCallTerms');
    const page = await open();
    expect(page.root().querySelector('h1')?.textContent).toBe('Görüntülü görüşmeye hazırlanınız');
    expect(page.text()).toContain('Pasaportunuzu yanınızda bulundurunuz.');
    expect(page.text()).toContain('Görüşme tamamlanmadan bağlantıyı kesmeyiniz.');
    expect(page.root().querySelectorAll('.wz-rules li')).toHaveLength(6);
    expect(page.text()).not.toContain('E-imzanızın süresi doldu');
    expect(page.button('Devam et')!.disabled).toBe(true);

    const tick = page.root().querySelector<HTMLInputElement>('.wz-check input')!;
    tick.checked = true;
    tick.dispatchEvent(new Event('change'));
    page.harness.detectChanges();
    expect(page.button('Devam et')!.disabled).toBe(false);
    page.click('Devam et');
    expect(accept).toHaveBeenCalledWith(true);
    await vi.waitFor(() => expect(store.app()?.callConsentAt).toBeTruthy());
    page.harness.detectChanges();
    expect(page.root().querySelector('h1')?.textContent).toBe('Görüntülü görüşmeye katılınız');
    expect(TestBed.inject(Router).url).toBe('/e-signature');
  });

  describe('lobby', () => {
    // The founder has already accepted the call's terms.
    beforeEach(async () => expect(await store.acceptCallTerms(true)).toBe(true));

    it('shows the founder\'s initials and name with camera and microphone ready', async () => {
      const page = await open();
      expect(page.root().querySelector('.host .avatar')?.textContent?.trim()).toBe(store.initials());
      expect(page.root().querySelector('.host .name')?.textContent?.trim()).toBe(store.fullName());
      const checks = [...page.root().querySelectorAll('.checks li')].map((l) => l.textContent?.trim());
      expect(checks).toEqual(['Kamera hazır', 'Mikrofon hazır', 'Bağlantı uygun']);
    });

    it('turns the microphone and camera off and on', async () => {
      const page = await open();
      page.click('Mikrofonu kapat');
      expect(page.button('Mikrofonu aç')!.getAttribute('aria-pressed')).toBe('false');
      expect(page.text()).toContain('Mikrofon kapalı');
      page.click('Kamerayı kapat');
      expect(page.text()).toContain('Kamera kapalı');
      expect(page.root().querySelector('.host .name')?.textContent?.trim()).toBe('Kameranız kapalı');
      expect(page.root().querySelector('.host')!.classList.contains('off')).toBe(true);
      page.click('Kamerayı aç');
      page.click('Mikrofonu aç');
      expect(page.text()).toContain('Kamera hazır');
      expect(page.text()).toContain('Mikrofon hazır');
    });

    it('refuses to call with the microphone or the camera off', async () => {
      const start = vi.spyOn(TestBed.inject(Api), 'startCall');
      const page = await open();
      page.click('Mikrofonu kapat');
      page.click('Operatörü ara');
      expect(page.alert()).toBe('Görüşme için kamera ve mikrofon açık olmalıdır.');
      page.click('Mikrofonu aç');
      page.click('Kamerayı kapat');
      page.click('Operatörü ara');
      expect(page.alert()).toBe('Görüşme için kamera ve mikrofon açık olmalıdır.');
      expect(start).not.toHaveBeenCalled();
    });

    it('calls the operator and moves to the call', async () => {
      const start = vi.spyOn(TestBed.inject(Api), 'startCall');
      const page = await open();
      page.click('Operatörü ara');
      expect(start).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/e-signature/call'));
      expect(store.stage()).toBe('calling');
    });
  });
});

/** D-4a in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('CallLobbyPage (D-4a), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });

  function setUp(app: Application, now: number) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }) };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(now) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('signing with the consent given: the lobby, no expiry notice', async () => {
    setUp(toApplication(CAPTURED.esignConsent, account), Date.parse('2026-11-25T12:00:00Z'));
    const page = await open();
    expect(page.root().querySelector('h1')?.textContent).toBe('Görüntülü görüşmeye katılınız');
    expect(page.text()).not.toContain('E-imzanızın süresi doldu');
  });

  it('signing without the consent: the pre-information', async () => {
    setUp(toApplication(CAPTURED.esignSigning, account), Date.parse('2026-11-25T12:00:00Z'));
    const page = await open();
    expect(page.root().querySelector('h1')?.textContent).toBe('Görüntülü görüşmeye hazırlanınız');
  });

  it('an expired certificate: says signing must be done again', async () => {
    setUp(toApplication(SIGNATURE_EXPIRED, account), Date.parse('2026-11-25T12:00:00Z'));
    const page = await open();
    expect(page.root().querySelector('[role=status]')?.textContent?.trim()).toBe('E-imzanızın süresi doldu. Kuruluşu başlatabilmek için e-imza adımını yeniden yapmanız gerekir.');
  });

  it('a certificate still valid at signing is not called expired', async () => {
    const app = toApplication(SIGNATURE_EXPIRED, account);
    setUp(app, Date.parse(app.signature!.validUntil) - 1);
    const page = await open();
    expect(page.text()).not.toContain('E-imzanızın süresi doldu');
  });
});
