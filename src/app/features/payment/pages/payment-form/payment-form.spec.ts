import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application, FEES } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { tl } from '@core/utils/format';
import { paymentRoutes } from '../../payment.routes';

const routes = [...paymentRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

type Field = 'holder' | 'number' | 'expiry' | 'cvv';
const AUTOCOMPLETE: Record<Field, string> = { holder: 'cc-name', number: 'cc-number', expiry: 'cc-exp', cvv: 'cc-csc' };

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/payment');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const field = (f: Field) => root().querySelector<HTMLInputElement>(`input[autocomplete=${AUTOCOMPLETE[f]}]`)!;
  /** Types into a field as the founder would (the page rewrites what was typed). */
  const type = (f: Field, value: string) => {
    field(f).value = value;
    field(f).dispatchEvent(new Event('input'));
    harness.detectChanges();
    return field(f).value;
  };
  const values = () => (['holder', 'number', 'expiry', 'cvv'] as Field[]).map((f) => field(f).value);
  const submit = () => root().querySelector<HTMLButtonElement>('form button[type=submit]')!;
  const pay = () => {
    root().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    harness.detectChanges();
  };
  const testCard = () => root().querySelector<HTMLButtonElement>('form button.test')!;
  const alerts = () => [...root().querySelectorAll('[role=alert]')].map((e) => e.textContent?.trim());
  const fees = () => [...root().querySelectorAll('.sum dl > div')].map((d) => [d.querySelector('dt')!.textContent!.trim(), d.querySelector('dd')!.textContent!.trim()]);
  const fill = (holder: string, number: string, expiry: string, cvv: string) => {
    type('holder', holder);
    type('number', number);
    type('expiry', expiry);
    type('cvv', cvv);
  };
  return { harness, root, q, field, type, values, submit, pay, testCard, alerts, fees, fill };
}

/** D-3a against the mock API, driven through the page's DOM. */
describe('PaymentFormPage (D-3a), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('payment');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(store.error()).toBeNull();
    expect(page.alerts()).toEqual([]);
  });

  it('the portal\'s fee lines and total, the company, an empty form', async () => {
    const page = await open();
    const total = tl(FEES.reduce((s, f) => s + f.amount, 0));
    expect(page.q('.sum .for')).toBe(store.fullTitle());
    expect(page.fees()).toEqual(FEES.map((f) => [f.label, tl(f.amount)]));
    expect(page.q('.sum .total strong')).toBe(total);
    expect(page.submit().textContent?.trim()).toBe(`${total} öde`);
    expect(page.values()).toEqual(['', '', '', '']);
    expect(page.q('.num .brand')).toBe('KART');
    expect(page.testCard().textContent?.trim()).toBe('Test kartını doldur');
  });

  it('formats as typed: holder in Turkish capitals, the number in fours, the expiry with a slash, digits only', async () => {
    const page = await open();
    expect(page.type('holder', 'ayşe yılmaz')).toBe('AYŞE YILMAZ');
    expect(page.type('number', '4242x42424242424242429999')).toBe('4242 4242 4242 4242');
    expect(page.type('number', '42424')).toBe('4242 4');
    expect(page.type('number', '4242')).toBe('4242');
    expect(page.type('expiry', '1')).toBe('1');
    expect(page.type('expiry', '12')).toBe('12');
    expect(page.type('expiry', '123')).toBe('12/3');
    expect(page.type('expiry', '12/305')).toBe('12/30');
    expect(page.type('cvv', '1a2b3c45')).toBe('1234');
  });

  it('names the card brand from its first digits', async () => {
    const page = await open();
    for (const [number, brand] of [
      ['4', 'VISA'],
      ['5100', 'MC'],
      ['5500', 'MC'],
      ['5600', 'KART'],
      ['9792', 'TROY'],
      ['979', 'KART'],
      ['3714', 'KART'],
    ]) {
      page.type('number', number);
      expect(page.q('.num .brand'), number).toBe(brand);
    }
  });

  it('checks the card only once paid; then says what is wrong, field by field, as it is corrected', async () => {
    const pay = vi.spyOn(TestBed.inject(Api), 'pay');
    const page = await open();
    page.type('holder', 'ab');
    expect(page.alerts()).toEqual([]);
    page.pay();
    expect(page.alerts()).toEqual(['Kart üzerindeki adı yazınız.']);
    page.type('holder', 'Ayşe Yılmaz');
    expect(page.alerts()).toEqual(['Kart numarası geçersizdir.']);
    page.type('number', '4242 4242 4242 4241');
    expect(page.alerts()).toEqual(['Kart numarası geçersizdir.']);
    page.type('number', '4242 4242 4242 4242');
    expect(page.alerts()).toEqual(['Son kullanma tarihini AA/YY biçiminde yazınız.']);
    page.type('expiry', '1330');
    expect(page.alerts()).toEqual(['Son kullanma tarihini AA/YY biçiminde yazınız.']);
    page.type('expiry', '0120');
    expect(page.alerts()).toEqual(['Kartın son kullanma tarihi geçmiştir.']);
    page.type('expiry', '1230');
    expect(page.alerts()).toEqual(['Güvenlik kodu (CVV) 3 veya 4 haneli olmalıdır.']);
    page.type('cvv', '12');
    expect(page.alerts()).toEqual(['Güvenlik kodu (CVV) 3 veya 4 haneli olmalıdır.']);
    page.type('cvv', '123');
    expect(page.alerts()).toEqual([]);
    expect(pay).not.toHaveBeenCalled();
  });

  it('"Test kartını doldur" fills the form with the founder\'s name and the test card', async () => {
    const page = await open();
    page.testCard().click();
    page.harness.detectChanges();
    expect(page.values()).toEqual([store.fullName().toLocaleUpperCase('tr-TR'), '4242 4242 4242 4242', '12/30', '123']);
    expect(page.q('.num .brand')).toBe('VISA');
  });

  it('a valid card is sent as typed and the bank\'s code step opens', async () => {
    const pay = vi.spyOn(TestBed.inject(Api), 'pay');
    const page = await open();
    page.fill('ayşe yılmaz', '4242424242424242', '1230', '123');
    page.pay();
    expect(pay).toHaveBeenCalledWith({ holder: 'AYŞE YILMAZ', number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' });
    expect(page.submit().textContent?.trim()).toBe('Bankanıza bağlanılıyor…');
    expect(page.submit().disabled).toBe(true);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/payment/3d-secure'));
  });
});

/** D-3a in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('PaymentFormPage (D-3a), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  // The founder already pressed "Ödemeye geç" (otherwise the API's `payment` shows the result screen).
  const open3a = toApplication(CAPTURED.paymentOpen, account, { resultSeen: true });

  function setUp(app: Application, calls: Record<string, unknown> = {}) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }), ...calls };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T14:22:00Z')) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('the API\'s fee lines and total; the test card says it only fills the form', async () => {
    expect(open3a.stage).toBe('payment');
    setUp(open3a);
    const page = await open();
    expect(page.fees()).toEqual(CAPTURED.paymentOpen.payment.fees.map((f) => [f.label, tl(f.amountMinor / 100)]));
    expect(page.q('.sum .total strong')).toBe(tl(12_750));
    expect(page.testCard().textContent?.trim()).toBe('Test kartını doldur (yalnızca formu doldurur)');
    page.testCard().click();
    page.harness.detectChanges();
    expect(page.values()).toEqual(['DENEME KURUCU-BERG', '4242 4242 4242 4242', '12/30', '123']);
  });

  it('pays and follows the API to the bank\'s code step', async () => {
    const pay = vi.fn(async () => toApplication(CAPTURED.payment3dsPending, account, { card: { holder: 'DENEME KURUCU-BERG', last4: '4242' } }));
    setUp(open3a, { pay });
    const page = await open();
    page.testCard().click();
    page.harness.detectChanges();
    page.pay();
    expect(pay).toHaveBeenCalledWith({ holder: 'DENEME KURUCU-BERG', number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' });
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/payment/3d-secure'));
  });

  it('a declined card: the API\'s sentence under the form, the form kept', async () => {
    const declined = CAPTURED.cardDeclined;
    const pay = vi.fn(async () => {
      throw new ApiError(declined.title, { code: declined.code, status: declined.status });
    });
    setUp(open3a, { pay });
    const page = await open();
    page.fill('Deneme Kurucu', '4000000000000002', '1230', '123');
    page.pay();
    await new Promise((r) => setTimeout(r));
    page.harness.detectChanges();
    expect(page.alerts()).toEqual(['Kartınızdan ödeme alınamadı. Lütfen başka bir kart deneyiniz.']);
    expect(page.values()).toEqual(['DENEME KURUCU', '4000 0000 0000 0002', '12/30', '123']);
    expect(TestBed.inject(Router).url).toBe('/payment');
  });
});
