import { DebugElement, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { CountrySelect } from '@ui/country-select';
import { MultiSelect } from '@ui/multi-select';
import { PhoneInput } from '@ui/phone-input';
import { Select } from '@ui/select';
import { companyRoutes } from '../../company.routes';

const routes = [...companyRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/details');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const debug = () => harness.routeDebugElement as DebugElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  const submit = () => root().querySelector<HTMLButtonElement>('form button[type=submit]')!;
  const brand = () => root().querySelector<HTMLInputElement>('input[autocomplete=organization]')!;
  const typeBrand = (value: string) => {
    brand().value = value;
    brand().dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  /** A custom control by its type (and the n-th of that type); the choice is made as the control makes it. */
  const control = <T>(type: new (...args: never[]) => T, n = 0) => debug().queryAll(By.directive(type))[n].componentInstance as T & { value: { set(v: unknown): void; (): unknown } };
  const pick = <T>(type: new (...args: never[]) => T, value: unknown, n = 0) => {
    control(type, n).value.set(value);
    harness.detectChanges();
  };
  /** The error line inside the field whose label starts with `label`. */
  const errorAt = (label: string) => {
    const field = [...root().querySelectorAll('.wz-field')].find((f) => f.textContent?.trim().startsWith(label));
    return field?.querySelector('.wz-fielderr')?.textContent?.trim() ?? null;
  };
  const alerts = () => [...root().querySelectorAll('[role=alert]')].map((e) => e.textContent?.trim());
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    harness.detectChanges();
  };
  /** Fills every field with valid values. */
  const fill = () => {
    typeBrand('Acme Bulut');
    pick(MultiSelect, ['62.10.00']);
    pick(Select, 'investor');
    pick(CountrySelect, 'Almanya', 0);
    pick(CountrySelect, 'Fransa', 1);
    pick(PhoneInput, '+49 151 2345 6700');
  };
  return { harness, root, q, button, submit, brand, typeBrand, control, pick, errorAt, alerts, settle, fill };
}

/** D-1e against the mock API, driven through the page's DOM and its controls. */
describe('ProfileFormPage (D-1e), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('profile');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    store.fieldErrors.set({ brand: ['Eski.'] });
    const page = await open();
    expect(store.error()).toBeNull();
    expect(store.fieldErrors()).toEqual({});
    expect(page.alerts()).toEqual([]);
  });

  it('an empty form for a first profile: the founder\'s name from the account, no way back to the deck', async () => {
    const page = await open();
    expect(page.q('h1')).toBe('Şirketiniz hakkında ön bilgi veriniz');
    expect(page.q('.who b')).toBe(`${store.app()!.founder.firstName} ${store.app()!.founder.lastName}`);
    expect(page.brand().value).toBe('');
    expect(page.root().querySelector('form .end a[href="/deck"]')).toBeNull();
    expect(page.submit().textContent?.trim()).toBe('Kaydet ve devam et');
    expect(page.submit().disabled).toBe(true);
  });

  it('"Faaliyet alanı" offers the reference\'s NACE list by name only; "Sermaye kaynağı" the four sources', async () => {
    const page = await open();
    const ref = store.reference()!;
    const nace = page.control(MultiSelect) as unknown as { options(): { value: string; label: string }[] };
    expect(nace.options()).toEqual(ref.naceCodes.map((n) => ({ value: n.code, label: n.title })));
    const funding = page.control(Select) as unknown as { options(): { value: string; label: string; hint?: string }[] };
    expect(funding.options()).toEqual([
      { value: 'own-abroad', label: 'Yurt dışı banka transferi', hint: 'Kendi adınıza yurt dışındaki bir hesaptan' },
      { value: 'own-turkey', label: 'Türkiye’deki kendi hesabımdan', hint: 'Türkiye’de kendi adınıza açılmış bir hesaptan' },
      { value: 'investor', label: 'Yatırımcı sermayesi (sözleşmeli)', hint: 'Yatırım sözleşmesiyle gelen sermaye' },
      { value: 'third-party', label: 'Üçüncü taraf transferi', hint: 'Başka bir kişi veya şirketten · uyum ekibi elle inceler' },
    ]);
  });

  it('"Kaydet ve devam et" waits for every field: brand of 2+, an activity, a source, both countries, a phone of 8 to 15 digits', async () => {
    const page = await open();
    page.fill();
    expect(page.submit().disabled).toBe(false);

    page.typeBrand(' A ');
    expect(page.submit().disabled).toBe(true);
    page.typeBrand('Ab');
    expect(page.submit().disabled).toBe(false);

    page.pick(MultiSelect, []);
    expect(page.submit().disabled).toBe(true);
    page.pick(MultiSelect, ['62.10.00', '63.10.00']);
    expect(page.submit().disabled).toBe(false);

    page.pick(Select, '');
    expect(page.submit().disabled).toBe(true);
    page.pick(Select, 'own-abroad');

    page.pick(CountrySelect, '', 0);
    expect(page.submit().disabled).toBe(true);
    page.pick(CountrySelect, 'Almanya', 0);
    page.pick(CountrySelect, '', 1);
    expect(page.submit().disabled).toBe(true);
    page.pick(CountrySelect, 'Almanya', 1);
    expect(page.submit().disabled).toBe(false);

    page.pick(PhoneInput, '+49 151 23');
    expect(page.submit().disabled).toBe(true); // 7 digits
    page.pick(PhoneInput, '+49 151 234');
    expect(page.submit().disabled).toBe(false); // 8
    page.pick(PhoneInput, '+49 151 2345 6700 12');
    expect(page.submit().disabled).toBe(false); // 15
    page.pick(PhoneInput, '+49 151 2345 6700 123');
    expect(page.submit().disabled).toBe(true); // 16
  });

  it('"Demo: örnek bilgileri doldur" fills the sample deck\'s values and then disappears', async () => {
    const page = await open();
    page.button('Demo: örnek bilgileri doldur')!.click();
    page.harness.detectChanges();
    expect(page.brand().value).toBe('Lumora Analytics');
    expect(page.control(MultiSelect).value()).toEqual(['62.10.00', '63.10.00']);
    expect(page.control(Select).value()).toBe('own-abroad');
    expect(page.control(CountrySelect, 0).value()).toBe('Almanya');
    expect(page.control(CountrySelect, 1).value()).toBe('Almanya');
    expect(page.control(PhoneInput).value()).toBe('+49 151 2345 6700');
    expect(page.submit().disabled).toBe(false);
    expect(page.button('Demo: örnek bilgileri doldur')).toBeUndefined();
  });

  it('saves the profile as typed and opens the deck upload', async () => {
    const submit = vi.spyOn(TestBed.inject(Api), 'submitProfile');
    const page = await open();
    page.fill();
    page.submit().click();
    expect(submit).toHaveBeenCalledWith({ brand: 'Acme Bulut', naceCodes: ['62.10.00'], funding: 'investor', nationality: 'Almanya', country: 'Fransa', phone: '+49 151 2345 6700' });
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck'));
    expect(store.stage()).toBe('verified');
    expect(store.app()!.profile).toMatchObject({ brand: 'Acme Bulut', naceCodes: ['62.10.00'], funding: 'investor' });
  });

  it('shows "Kaydediliyor…" and disables the button while saving', async () => {
    const page = await open();
    page.fill();
    store.busy.set(true);
    page.harness.detectChanges();
    expect(page.submit().textContent?.trim()).toBe('Kaydediliyor…');
    expect(page.submit().disabled).toBe(true);
    store.busy.set(false);
  });
});

describe('ProfileFormPage (D-1e), mock, saved again from the upload step', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('verified');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('starts from the saved profile and offers "Değiştirmeden sunuma dön"', async () => {
    const p = store.app()!.profile!;
    const page = await open();
    expect(page.brand().value).toBe(p.brand);
    expect(page.control(MultiSelect).value()).toEqual(p.naceCodes);
    expect(page.control(Select).value()).toBe(p.funding);
    expect(page.control(CountrySelect, 0).value()).toBe(p.nationality);
    expect(page.control(CountrySelect, 1).value()).toBe(p.country);
    expect(page.control(PhoneInput).value()).toBe(p.phone);
    expect(page.root().querySelector('form .end a[href="/deck"]')?.textContent?.trim()).toBe('Değiştirmeden sunuma dön');
    expect(page.button('Demo: örnek bilgileri doldur')).toBeUndefined();
  });

  it('a second save replaces the profile and goes back to the deck', async () => {
    const page = await open();
    page.typeBrand('Lumora Yeni');
    page.submit().click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck'));
    expect(store.app()!.profile!.brand).toBe('Lumora Yeni');
    expect(store.stage()).toBe('verified');
  });
});

/** D-1e in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('ProfileFormPage (D-1e), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (view: unknown) => toApplication(view as never, account);

  function setUp(app: Application, calls: Record<string, unknown> = {}) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = {
      demo: null,
      work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen },
      restore: async () => ({ account, app }),
      reference: vi.fn(async () => CAPTURED.reference),
      evaluationReference: vi.fn(async () => CAPTURED.referenceEvaluation),
      ...calls,
    };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T14:20:00Z')) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return { store, api };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('reads both references once (the API\'s NACE list and funding sources)', async () => {
    const { api } = setUp(map(CAPTURED.profile));
    const page = await open();
    expect(api.reference).toHaveBeenCalledTimes(1);
    expect(api.evaluationReference).toHaveBeenCalledTimes(1);
    const nace = page.control(MultiSelect) as unknown as { options(): { value: string; label: string }[] };
    expect(nace.options()).toEqual(CAPTURED.reference.naceCodes.map((n) => ({ value: n.code, label: n.title })));
  });

  it('a failed reference read: its message under the form', async () => {
    setUp(map(CAPTURED.profile), { reference: async () => { throw new ApiError('Seçenekler okunamadı.', { code: 'unavailable', status: 503 }); } });
    const page = await open();
    await page.settle();
    expect(page.alerts()).toEqual(['Seçenekler okunamadı.']);
  });

  it('saves and follows the API to the deck upload', async () => {
    const submitProfile = vi.fn(async () => map(CAPTURED.verified));
    setUp(map(CAPTURED.profile), { submitProfile });
    const page = await open();
    page.fill();
    page.pick(MultiSelect, ['62.01']);
    page.submit().click();
    expect(submitProfile).toHaveBeenCalledWith({ brand: 'Acme Bulut', naceCodes: ['62.01'], funding: 'investor', nationality: 'Almanya', country: 'Fransa', phone: '+49 151 2345 6700' });
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/deck'));
  });

  it('the API\'s refusal: each sentence at its own field, the title under the form; nothing moves', async () => {
    const submitProfile = vi.fn(async () => {
      throw new ApiError('Gönderdiğiniz bilgiler eksik veya hatalıdır.', {
        code: 'validation_failed',
        status: 400,
        fields: {
          brand: ['Marka adı en fazla 120 karakter olabilir.'],
          naceCodes: ['Faaliyet alanını listeden seçiniz.'],
          funding: ['Sermaye kaynağını seçiniz.'],
          nationality: ['Uyruğunuzu seçiniz.'],
          country: ['Yaşadığınız ülkeyi seçiniz.'],
          phone: ['Telefon numaranızı eksiksiz yazınız.'],
        },
      });
    });
    setUp(map(CAPTURED.profile), { submitProfile });
    const page = await open();
    page.fill();
    page.submit().click();
    await page.settle();
    expect(page.errorAt('Şirket veya marka adı')).toBe('Marka adı en fazla 120 karakter olabilir.');
    expect(page.errorAt('Faaliyet alanı')).toBe('Faaliyet alanını listeden seçiniz.');
    expect(page.errorAt('Sermaye kaynağı')).toBe('Sermaye kaynağını seçiniz.');
    expect(page.errorAt('Uyruk')).toBe('Uyruğunuzu seçiniz.');
    expect(page.errorAt('Yaşadığınız ülke')).toBe('Yaşadığınız ülkeyi seçiniz.');
    expect(page.errorAt('Telefon')).toBe('Telefon numaranızı eksiksiz yazınız.');
    expect(page.alerts()).toContain('Gönderdiğiniz bilgiler eksik veya hatalıdır.');
    expect(TestBed.inject(Router).url).toBe('/details');
    expect(page.brand().value).toBe('Acme Bulut');
  });

  it('back from the upload step: the saved profile (sector mapped to its codes) and "Değiştirmeden sunuma dön"', async () => {
    const app = map(CAPTURED.verified);
    setUp(app);
    const page = await open();
    expect(page.brand().value).toBe('Lumora');
    expect(page.control(MultiSelect).value()).toEqual(app.profile!.naceCodes);
    expect(page.control(Select).value()).toBe('own-abroad');
    expect(page.root().querySelector('form .end a[href="/deck"]')).not.toBeNull();
  });

  it('shows "Demo: örnek bilgileri doldur" in HTTP mode too (as the page is today)', async () => {
    setUp(map(CAPTURED.profile));
    const page = await open();
    expect(page.button('Demo: örnek bilgileri doldur')).toBeDefined();
  });
});
