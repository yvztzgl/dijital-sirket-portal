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

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/e-signature/turkish-citizen');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const text = () => root().textContent ?? '';
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const radio = (label: string) => [...root().querySelectorAll<HTMLElement>('[role=radio]')].find((r) => r.textContent?.includes(label))!;
  const checked = () => [...root().querySelectorAll('[role=radio]')].filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.querySelector('b')!.textContent);
  const go = () => [...root().querySelectorAll('button')].find((b) => b.closest('.wz-actions'))!;
  return { harness, root, text, q, radio, checked, go };
}

/** D-4d against the mock API, driven through the page's DOM. */
describe('ResidentSignaturePage (D-4d), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('signing', 'resident');
  });

  afterEach(() => vi.unstubAllGlobals());

  const name = () => `${store.app()!.founder.firstName} ${store.app()!.founder.lastName}`;

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(page.root().querySelector('[role=alert]')).toBeNull();
  });

  it('opens on the existing e-signature, said in the founder\'s name', async () => {
    const page = await open();
    expect(page.q('h1')).toBe('İmza yönteminizi seçiniz');
    expect(page.checked()).toEqual(['Mevcut e-imzamı kullanacağım']);
    expect(page.q('.wz-foot')).toBe(`${name()} adına kayıtlı e-imza doğrulanacaktır.`);
    expect(page.text()).not.toContain('E-imzanızın süresi doldu');
    expect(page.text()).not.toContain('E-imzanız doğrulanıyor');
  });

  it('switches the method by click, Enter and Space', async () => {
    const page = await open();
    page.radio('e-Devlet').click();
    page.harness.detectChanges();
    expect(page.checked()).toEqual(['e-Devlet ile yeni e-imza alacağım']);
    expect(page.radio('e-Devlet').classList.contains('on')).toBe(true);
    expect(page.q('.wz-foot')).toBe(`e-Devlet doğrulamasının ardından ${name()} adına günlük e-imza düzenlenir.`);
    page.radio('Mevcut').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    page.harness.detectChanges();
    expect(page.checked()).toEqual(['Mevcut e-imzamı kullanacağım']);
    const space = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    page.radio('e-Devlet').dispatchEvent(space);
    page.harness.detectChanges();
    expect(space.defaultPrevented).toBe(true);
    expect(page.checked()).toEqual(['e-Devlet ile yeni e-imza alacağım']);
  });

  it('"Devam et" signs with the chosen method and moves to the ready certificate', async () => {
    const sign = vi.spyOn(TestBed.inject(Api), 'signResident');
    const page = await open();
    page.radio('e-Devlet').click();
    page.harness.detectChanges();
    expect(page.go().textContent?.trim()).toBe('Devam et');
    page.go().click();
    page.harness.detectChanges();
    expect(sign).toHaveBeenCalledWith('edevlet');
    expect(page.go().textContent?.trim()).toBe('İmzanız doğrulanıyor…');
    expect(page.go().disabled).toBe(true);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/e-signature/ready'));
    expect(store.app()!.signature!.method).toBe('edevlet');
  });
});

/** D-4d in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('ResidentSignaturePage (D-4d), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'resident', verified: true });
  const map = (view: unknown) => toApplication(view as never, account);

  function setUp(app: Application, calls: Record<string, unknown> = {}) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }), ...calls };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T12:00:00Z')) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('signing: the choice', async () => {
    const store = setUp(map(CAPTURED.residentSigning));
    const page = await open();
    expect(page.q('h1')).toBe('İmza yönteminizi seçiniz');
    // The name is the application's founder as the API reports it.
    const f = store.app()!.founder;
    expect(page.q('.wz-foot')).toBe(`${f.firstName} ${f.lastName} adına kayıtlı e-imza doğrulanacaktır.`);
  });

  it('calling (the provider verifies): a waiting state, no choice', async () => {
    setUp(map(CAPTURED.residentIssuing));
    const page = await open();
    expect(page.q('.wz-chip')).toBe('Doğrulanıyor');
    expect(page.q('h1')).toBe('E-imzanız doğrulanıyor');
    expect(page.root().querySelector('[role=radiogroup]')).toBeNull();
    expect(page.root().querySelector('.wz-actions')).toBeNull();
  });

  it('"Devam et" sends the method; the waiting state follows the API\'s answer', async () => {
    const signResident = vi.fn(async () => map(CAPTURED.residentIssuing));
    setUp(map(CAPTURED.residentSigning), { signResident });
    const page = await open();
    page.go().click();
    expect(signResident).toHaveBeenCalledWith('existing');
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.q('h1')).toBe('E-imzanız doğrulanıyor');
    });
  });

  it('when signed arrives the waiting state stays while the page gives way', async () => {
    const store = setUp(map(CAPTURED.residentIssuing));
    const page = await open();
    store.app.set(map(CAPTURED.residentSigned));
    page.harness.detectChanges();
    expect(page.q('h1')).toBe('E-imzanız doğrulanıyor');
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/e-signature/ready'));
  });

  it('an expired certificate: the notice above the choice', async () => {
    setUp(map(SIGNATURE_EXPIRED));
    const page = await open();
    expect(page.q('[role=status]')).toBe('E-imzanızın süresi doldu. Kuruluşu başlatabilmek için e-imza adımını yeniden yapmanız gerekir.');
    expect(page.q('h1')).toBe('İmza yönteminizi seçiniz');
  });
});
