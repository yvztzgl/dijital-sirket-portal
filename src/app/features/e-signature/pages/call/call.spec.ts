import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { callStartedAt, toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { Confirm } from '@core/services/confirm';
import { ApplicationStore } from '@core/state/application.store';
import { eSignatureRoutes } from '../../e-signature.routes';

const routes = [...eSignatureRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/e-signature/call');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.includes(label) || b.getAttribute('aria-label') === label);
  const click = (label: string) => {
    button(label)!.click();
    harness.detectChanges();
  };
  return { harness, root, text, q, button, click };
}

/** D-4b against the mock API; the call's time comes from a hand-moved `Clock`. */
describe('CallPage (D-4b), mock', () => {
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
    await store.seed('calling');
    // Real time from here: the call takes 20 s of the hand-moved clock.
    TestBed.inject(DemoSettings).set({ speed: 1 });
    started = Date.parse(store.app()!.call!.startedAt);
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

  it('shows the call: timer, the operator\'s first sentence, the founder\'s initials, no status yet', async () => {
    const page = await open();
    expect(page.q('h1')).toBe('Operatörün yönlendirmelerini izleyiniz');
    expect(page.q('.top .pill')).toBe('Kayıt altında, 00:00');
    expect(page.q('.say')).toBe(`Merhaba ${store.app()!.founder.firstName}, ben Elif. Pasaportunuzun fotoğraflı sayfasını kameraya gösterir misiniz?`);
    expect(page.q('.self .avatar')).toBe(store.initials());
    expect(page.root().querySelector('.self .pill')).toBeNull();
    expect(page.text()).not.toContain('E-imzanız düzenleniyor');
  });

  it('the captions and the founder\'s status follow the call', async () => {
    const page = await open();
    at(page, 4_500);
    expect(page.q('.top .pill')).toBe('Kayıt altında, 00:04');
    expect(page.q('.say')).toBe('Teşekkürler, pasaportunuz okundu. Şimdi yüzünüzü kameraya yaklaştırın, eşleşmeyi kontrol ediyorum.');
    expect(page.q('.self .pill')).toBe('Pasaport algılandı');
    at(page, 8_100);
    expect(page.q('.say')).toBe('Şirket kuruluş belgelerinizin e-imzayla imzalanmasını onaylıyor musunuz? Lütfen “onaylıyorum” deyin.');
    expect(page.q('.self .pill')).toBe('Yüz eşleşti');
    at(page, 12_100);
    expect(page.q('.say')).toBe('Onayınız kaydedildi. Görüşme tutanağını imzalıyorum.');
    expect(page.q('.self .pill')).toBe('Onayınız alındı');
    at(page, 16_100);
    expect(page.q('.say')).toBe('Günlük e-imzanız düzenleniyor, birazdan hazır olacak.');
    expect(page.q('.self .pill')).toBe('Tutanak imzalandı');
    expect(page.q('.top .pill')).toBe('Kayıt altında, 00:16');
  });

  it('moves to the ready certificate when the call ends', async () => {
    const page = await open();
    at(page, 20_000);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/e-signature/ready'));
    expect(store.stage()).toBe('signed');
  });

  it('turns the microphone and the camera off on the founder\'s picture', async () => {
    const page = await open();
    page.click('Mikrofonu kapat');
    expect(page.root().querySelector('.self .lbl app-icon')).not.toBeNull();
    expect(page.button('Mikrofonu aç')!.getAttribute('aria-pressed')).toBe('false');
    page.click('Kamerayı kapat');
    expect(page.q('.self .camoff')).toBe('Kamera kapalı');
    expect(page.root().querySelector('.self .avatar')).toBeNull();
    page.click('Kamerayı aç');
    page.click('Mikrofonu aç');
    expect(page.q('.self .avatar')).toBe(store.initials());
    expect(page.root().querySelector('.self .lbl app-icon')).toBeNull();
  });

  it('"Görüşmeyi bitir" asks first; going back keeps the call', async () => {
    const end = vi.spyOn(TestBed.inject(Api), 'endCall');
    const confirm = TestBed.inject(Confirm);
    const page = await open();
    page.click('Görüşmeyi bitir');
    expect(confirm.current()).toEqual({
      tone: 'danger',
      icon: 'phone-off',
      title: 'Görüşme sonlandırılsın mı?',
      message: 'Görüşmeyi sonlandırırsanız e-imzanız düzenlenmez. Devam etmek için görüşmeyi yeniden başlatmanız gerekir.',
      confirm: 'Görüşmeyi sonlandır',
      cancel: 'Görüşmeye dön',
    });
    confirm.answer(false);
    await new Promise((r) => setTimeout(r));
    expect(end).not.toHaveBeenCalled();
    expect(store.stage()).toBe('calling');
    expect(TestBed.inject(Router).url).toBe('/e-signature/call');
  });

  it('"Görüşmeyi bitir" confirmed: the call ends and the lobby opens again', async () => {
    const end = vi.spyOn(TestBed.inject(Api), 'endCall');
    const page = await open();
    page.click('Görüşmeyi bitir');
    TestBed.inject(Confirm).answer(true);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/e-signature'));
    expect(end).toHaveBeenCalledTimes(1);
    expect(store.stage()).toBe('signing');
  });
});

/** D-4b in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('CallPage (D-4b), HTTP mode', () => {
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

  it('a call open: the call itself', async () => {
    const started = Date.parse(callStartedAt(CAPTURED.esignCallOpen)!);
    setUp(toApplication(CAPTURED.esignCallOpen, account), started + 1_000);
    const page = await open();
    expect(page.q('h1')).toBe('Operatörün yönlendirmelerini izleyiniz');
    expect(page.q('.say')).toBe('Merhaba Deneme, ben Elif. Pasaportunuzun fotoğraflı sayfasını kameraya gösterir misiniz?');
    expect(page.button('Görüşmeyi bitir')).toBeDefined();
  });

  it('the call reported complete: the certificate is being issued, nothing to press', async () => {
    const started = callStartedAt(CAPTURED.esignIssuing)!;
    setUp(toApplication(CAPTURED.esignIssuing, account, { callCompleted: started }), Date.parse(started) + 30_000);
    const page = await open();
    expect(page.q('.wz-chip')).toBe('Görüşme tamamlandı');
    expect(page.q('h1')).toBe('E-imzanız düzenleniyor');
    expect(page.root().querySelector('[role=status]')?.textContent).toContain('Sertifikanız düzenleniyor.');
    expect(page.button('Görüşmeyi bitir')).toBeUndefined();
    expect(page.root().querySelector('.wz-meet')).toBeNull();
  });

  it('calling with no call start in the timeline: issuing as well', async () => {
    const view = { ...CAPTURED.esignCallOpen, logs: [] };
    setUp(toApplication(view as never, account), Date.parse('2026-11-25T12:00:00Z'));
    const page = await open();
    expect(page.q('h1')).toBe('E-imzanız düzenleniyor');
  });
});
