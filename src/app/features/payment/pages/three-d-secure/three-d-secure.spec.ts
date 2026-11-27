import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoServerApi } from '@core/api/demo/demo-server-api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { Inbox } from '@core/services/inbox';
import { ApplicationStore } from '@core/state/application.store';
import { dateTime, maskPhone, tl } from '@core/utils/format';
import { paymentRoutes } from '../../payment.routes';

const routes = [...paymentRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/payment/3d-secure');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  /** The bank card's rows as [term, value]. */
  const rows = () => [...root().querySelectorAll('.wz-bank dl > div')].map((d) => [d.querySelector('dt')!.textContent!.trim(), d.querySelector('dd')!.textContent!.trim()]);
  const boxes = () => [...root().querySelectorAll<HTMLInputElement>('app-otp-input input')];
  /** Types a code digit by digit into the six boxes (the sixth digit submits it). */
  const enter = (code: string) => {
    [...code].forEach((d, i) => {
      boxes()[i].value = d;
      boxes()[i].dispatchEvent(new Event('input'));
      harness.detectChanges();
    });
  };
  const alerts = () => [...root().querySelectorAll('[role=alert]')].map((e) => e.textContent?.trim());
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    harness.detectChanges();
  };
  return { harness, root, q, button, rows, boxes, enter, alerts, settle };
}

/** D-3b against the mock API; the code's time left comes from a hand-moved `Clock`. */
describe('ThreeDSecurePage (D-3b), mock', () => {
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
    await store.seed('threeDs');
    now.set(Date.parse(store.app()!.payment!.otpSentAt!));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(store.error()).toBeNull();
    expect(page.alerts()).toEqual([]);
  });

  it('the bank\'s card: amount, masked card, time; the masked phone; the time left; the SMS beside it', async () => {
    const p = store.app()!.payment!;
    const page = await open();
    expect(page.q('h1')).toBe('Bankanızın gönderdiği kodu giriniz');
    expect(page.rows()).toEqual([
      ['İşyeri', 'Terminal Şirket'],
      ['Tutar', tl(p.amount)],
      ['Kart', '**** **** **** 4242'],
      ['Tarih', dateTime(p.otpSentAt!)],
    ]);
    expect(page.q('.code .lab')).toBe(`${maskPhone(store.app()!.contact.phone)} numarasına gönderilen 6 haneli kodu giriniz`);
    expect(page.q('.left span')).toBe('Kalan süre 03:00');
    expect(page.q('.wz-sms strong')).toBe(p.otp);
    expect(page.q('.wz-sms .t > span')).toBe(`${tl(p.amount)} tutarlı işleminiz için doğrulama kodunuz: ${p.otp}. Kodu kimseyle paylaşmayınız.`);
    expect(page.root().querySelector('app-demo-code-hint .hint')).toBeNull();
    now.set(now() + 90_500);
    page.harness.detectChanges();
    expect(page.q('.left span')).toBe('Kalan süre 01:29');
    now.set(now() + 600_000);
    page.harness.detectChanges();
    expect(page.q('.left span')).toBe('Kalan süre 00:00');
  });

  it('"Onayla" with fewer than six digits asks for the code and sends nothing', async () => {
    const confirm = vi.spyOn(TestBed.inject(Api), 'confirm3ds');
    const page = await open();
    page.enter('123');
    page.button('Onayla')!.click();
    page.harness.detectChanges();
    expect(page.alerts()).toEqual(['6 haneli kodu girin.']);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a wrong code is refused and the page stays', async () => {
    const page = await open();
    const wrong = store.app()!.payment!.otp === '000000' ? '111111' : '000000';
    page.enter(wrong);
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.alerts()).toEqual(['Doğrulama kodu hatalı.']);
    });
    expect(store.stage()).toBe('threeDs');
  });

  it('the sixth digit sends the code; the right one completes the payment', async () => {
    const confirm = vi.spyOn(TestBed.inject(Api), 'confirm3ds');
    const page = await open();
    const otp = store.app()!.payment!.otp!;
    page.enter(otp);
    expect(confirm).toHaveBeenCalledWith(otp);
    expect(page.button('Doğrulanıyor…')!.disabled).toBe(true);
    await vi.waitFor(() => expect(store.stage()).toBe('signing'));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe(store.resumeRoute()));
  });

  it('"Kodu tekrar gönder" empties the boxes and sends a new SMS; nothing is said on screen', async () => {
    const resend = vi.spyOn(TestBed.inject(Api), 'resendOtp');
    const page = await open();
    page.enter('12');
    page.button('Kodu tekrar gönder')!.click();
    page.harness.detectChanges();
    expect(page.boxes().map((b) => b.value)).toEqual(['', '', '', '', '', '']);
    expect(resend).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(TestBed.inject(Inbox).messages().filter((m) => m.kind === 'sms').length).toBe(2));
    page.harness.detectChanges();
    const otp = store.app()!.payment!.otp!;
    expect(page.q('.wz-sms strong')).toBe(otp);
    expect(page.root().textContent).not.toContain('Yeni kod istendi.');
  });

  it('"İptal" cancels the payment and the card form opens again', async () => {
    const cancel = vi.spyOn(TestBed.inject(Api), 'cancel3ds');
    const page = await open();
    page.button('İptal')!.click();
    expect(cancel).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/payment'));
  });
});

/** D-3b in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('ThreeDSecurePage (D-3b), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const withCard = toApplication(CAPTURED.payment3dsPending, account, { card: { holder: 'DENEME KURUCU', last4: '4242' } });
  const afterReload = toApplication(CAPTURED.payment3dsPending, account);

  function setUp(app: Application, calls: Record<string, unknown> = {}, demo: { code: string | null } = { code: null }) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }), ...calls };
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: Api, useValue: api },
        { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T14:21:20Z')) } },
        { provide: DemoServerApi, useValue: { available: computed(() => demo.code !== null), threeDsCode: computed(() => demo.code) } },
      ],
    });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('the API\'s amount and the card typed on this page; no time, no phone, no countdown, no SMS', async () => {
    setUp(withCard);
    const page = await open();
    expect(page.rows()).toEqual([
      ['İşyeri', 'Terminal Şirket'],
      ['Tutar', tl(12_750)],
      ['Kart', '**** **** **** 4242'],
    ]);
    expect(page.q('.code .lab')).toBe('Bankanızın gönderdiği 6 haneli doğrulama kodunu giriniz');
    expect(page.root().textContent).not.toContain('Kalan süre');
    expect(page.root().querySelector('.wz-sms')).toBeNull();
    expect(page.root().querySelector('app-demo-code-hint .hint')).toBeNull();
  });

  it('after a reload the card row is left out', async () => {
    setUp(afterReload);
    const page = await open();
    expect(page.rows().map((r) => r[0])).toEqual(['İşyeri', 'Tutar']);
  });

  it('a wrong code: the API\'s sentence', async () => {
    const wrong = CAPTURED.threeDsWrongCode;
    const confirm3ds = vi.fn(async () => {
      throw new ApiError(wrong.title, { code: wrong.code, status: wrong.status });
    });
    setUp(withCard, { confirm3ds });
    const page = await open();
    page.enter('000000');
    expect(confirm3ds).toHaveBeenCalledWith('000000');
    await page.settle();
    expect(page.alerts()).toEqual(['Doğrulama kodu hatalı.']);
  });

  it('the right code: the API moves on to signing', async () => {
    const confirm3ds = vi.fn(async () => toApplication(CAPTURED.paymentCaptured, account));
    const store = setUp(withCard, { confirm3ds });
    const page = await open();
    page.enter('123456');
    await vi.waitFor(() => expect(store.stage()).toBe('signing'));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe(store.resumeRoute()));
  });

  it('"Kodu tekrar gönder" answered: "Yeni kod istendi."; refused: nothing said, the API\'s sentence', async () => {
    let fail = false;
    const resendOtp = vi.fn(async () => {
      if (fail) throw new ApiError('Yeni kod için lütfen bekleyiniz.', { code: 'too_many', status: 429 });
      return withCard;
    });
    setUp(withCard, { resendOtp });
    const page = await open();
    page.enter('12');
    page.button('Kodu tekrar gönder')!.click();
    page.harness.detectChanges();
    expect(page.boxes().map((b) => b.value)).toEqual(['', '', '', '', '', '']);
    await page.settle();
    expect(page.q('.left span')).toBe('Yeni kod istendi.');
    fail = true;
    page.button('Kodu tekrar gönder')!.click();
    page.harness.detectChanges();
    expect(page.q('.left span')).toBe('');
    await page.settle();
    expect(page.q('.left span')).toBe('');
    expect(page.alerts()).toEqual(['Yeni kod için lütfen bekleyiniz.']);
  });

  it('"İptal": the API is back at the card form', async () => {
    const cancel3ds = vi.fn(async () => toApplication(CAPTURED.paymentCancelled, account));
    setUp(withCard, { cancel3ds });
    const page = await open();
    page.button('İptal')!.click();
    expect(cancel3ds).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/payment'));
  });

  it('against a demo API: the stand-in bank\'s code under the boxes, "Doldur" puts it in', async () => {
    const confirm3ds = vi.fn(async () => withCard);
    setUp(withCard, { confirm3ds }, { code: '123456' });
    const page = await open();
    expect(page.q('app-demo-code-hint .t')).toBe('kod 123456');
    page.button('Doldur')!.click();
    page.harness.detectChanges();
    expect(page.boxes().map((b) => b.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    page.button('Onayla')!.click();
    expect(confirm3ds).toHaveBeenCalledWith('123456');
    await page.settle();
  });
});
