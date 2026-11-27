import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application, FUNDING_LABELS } from '@core/models/models';
import { Clock } from '@core/services/clock';
import { ApplicationStore } from '@core/state/application.store';
import { eligibilityRoutes } from '../../eligibility.routes';

const routes = [...eligibilityRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

/** A file of the given name and size (the bytes are not read). */
function file(name: string, size: number, type = 'application/pdf') {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/eligibility/declaration');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  const submit = () => [...root().querySelectorAll<HTMLButtonElement>('.wz-actions .wz-btn')][0];
  const input = () => root().querySelector<HTMLInputElement>('input[type=file]')!;
  /** Picks a file in the hidden file input. */
  const choose = (f: File) => {
    Object.defineProperty(input(), 'files', { configurable: true, value: [f] });
    input().dispatchEvent(new Event('change'));
    harness.detectChanges();
  };
  const zone = () => root().querySelector<HTMLElement>('.wz-drop')!;
  const drag = (type: 'dragover' | 'dragleave' | 'drop', files: File[] = []) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { dataTransfer: { files } });
    zone().dispatchEvent(e);
    harness.detectChanges();
    return e;
  };
  const tick = () => {
    const box = root().querySelector<HTMLInputElement>('.wz-check input')!;
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    harness.detectChanges();
  };
  const alerts = () => [...root().querySelectorAll('[role=alert]')].map((e) => e.textContent?.trim());
  const settle = async () => {
    await new Promise((r) => setTimeout(r));
    harness.detectChanges();
  };
  return { harness, root, q, button, submit, input, choose, zone, drag, tick, alerts, settle };
}

/** D-2d against the mock API, driven through the page's DOM. */
describe('DeclarationPage (D-2d), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('declaration');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(store.error()).toBeNull();
    expect(page.alerts()).toEqual([]);
  });

  it('shows the declared address and funding, an empty drop zone and the demo sample', async () => {
    const a = store.app()!;
    const page = await open();
    expect(page.q('h1')).toBe('Adres belgenizi yükleyiniz');
    expect([...page.root().querySelectorAll('.wz-decl dd')].map((d) => d.textContent?.trim())).toEqual([
      `${a.contact.address}, ${a.contact.postalCode} ${a.contact.country}`,
      FUNDING_LABELS[a.funding],
    ]);
    expect(page.q('.wz-drop strong')).toBe('Adres belgenizi bu alana sürükleyiniz');
    expect(page.root().querySelector('.wz-decl .file')).toBeNull();
    expect(page.button('Demo: örnek belge kullan')).toBeDefined();
    expect(page.input().accept).toBe('.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png');
  });

  it('"Beyanı onayla" needs both the file and the tick', async () => {
    const page = await open();
    expect(page.submit().textContent?.trim()).toBe('Beyanı onayla');
    expect(page.submit().disabled).toBe(true);
    page.tick();
    expect(page.submit().disabled).toBe(true);
    page.tick();
    page.choose(file('fatura.pdf', 200_000));
    expect(page.submit().disabled).toBe(true);
    page.tick();
    expect(page.submit().disabled).toBe(false);
  });

  it('a chosen file is shown with its size; the input is emptied so the same file can be chosen again', async () => {
    const page = await open();
    page.choose(file('Fatura Kasım.PDF', 412_000));
    expect(page.q('.wz-decl .file b')).toBe('Fatura Kasım.PDF');
    expect(page.q('.wz-decl .file small')).toBe('402 KB, yüklenmeye hazır');
    expect(page.input().value).toBe('');
    expect(page.root().querySelector('.wz-drop')).toBeNull();
    expect(page.button('Demo: örnek belge kullan')).toBeUndefined();
    page.choose(file('ekstre.png', 1_300_000, 'image/png'));
    expect(page.q('.wz-decl .file b')).toBe('ekstre.png');
    expect(page.q('.wz-decl .file small')).toBe('1,2 MB, yüklenmeye hazır');
    page.choose(file('k.jpeg', 10, 'image/jpeg'));
    expect(page.q('.wz-decl .file small')).toBe('1 KB, yüklenmeye hazır');
  });

  it('refuses another type and a file over 10 MB with the API\'s sentences; a refused file does not replace the chosen one', async () => {
    const page = await open();
    page.choose(file('adres.docx', 10_000, 'application/msword'));
    expect(page.alerts()).toEqual(['Adres belgesi PDF, JPG veya PNG biçiminde olmalıdır.']);
    expect(page.root().querySelector('.wz-decl .file')).toBeNull();
    page.choose(file('buyuk.pdf', 10 * 1024 * 1024 + 1));
    expect(page.alerts()).toEqual(['Dosya 10 MB’tan büyüktür. Daha küçük bir dosya yükleyiniz.']);
    page.choose(file('tam.pdf', 10 * 1024 * 1024));
    expect(page.alerts()).toEqual([]);
    expect(page.q('.wz-decl .file b')).toBe('tam.pdf');
    page.choose(file('resim.gif', 100, 'image/gif'));
    expect(page.alerts()).toEqual(['Adres belgesi PDF, JPG veya PNG biçiminde olmalıdır.']);
    expect(page.q('.wz-decl .file b')).toBe('tam.pdf');
  });

  it('choosing a file clears the last action\'s error', async () => {
    const page = await open();
    store.error.set('Bir hata.');
    page.harness.detectChanges();
    page.choose(file('fatura.pdf', 1_000));
    expect(store.error()).toBeNull();
  });

  it('drag and drop: the zone says where to drop, and a dropped file is taken', async () => {
    const page = await open();
    const over = page.drag('dragover');
    expect(over.defaultPrevented).toBe(true);
    expect(page.zone().classList.contains('over')).toBe(true);
    expect(page.q('.wz-drop strong')).toBe('Belgeyi bu alana bırakınız');
    page.drag('dragleave');
    expect(page.zone().classList.contains('over')).toBe(false);
    page.drag('dragover');
    const drop = page.drag('drop', [file('fatura.pdf', 5_000)]);
    expect(drop.defaultPrevented).toBe(true);
    expect(page.q('.wz-decl .file b')).toBe('fatura.pdf');
  });

  it('a drop without a file changes nothing', async () => {
    const page = await open();
    page.drag('dragover');
    page.drag('drop');
    expect(page.zone().classList.contains('over')).toBe(false);
    expect(page.root().querySelector('.wz-decl .file')).toBeNull();
  });

  it('the demo sample: a one-page PDF named adres-belgesi.pdf', async () => {
    const page = await open();
    page.button('Demo: örnek belge kullan')!.click();
    page.harness.detectChanges();
    expect(page.q('.wz-decl .file b')).toBe('adres-belgesi.pdf');
    expect(page.q('.wz-decl .file small')).toMatch(/^\d+ KB, yüklenmeye hazır$/);
  });

  it('sends the founder\'s own file and tick, then the list search opens', async () => {
    const submit = vi.spyOn(TestBed.inject(Api), 'submitDeclaration');
    const page = await open();
    const chosen = file('fatura.pdf', 200_000);
    page.choose(chosen);
    page.tick();
    page.submit().click();
    page.harness.detectChanges();
    expect(submit).toHaveBeenCalledWith({ file: chosen, declared: true });
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/eligibility/screening'));
    expect(store.app()!.eligibility!.address!.fileName).toBe('fatura.pdf');
  });
});

/** D-2d in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('DeclarationPage (D-2d), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (view: unknown) => toApplication(view as never, account);

  function setUp(app: Application, calls: Record<string, unknown> = {}) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }), ...calls };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(Date.parse('2026-11-25T14:20:00Z')) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('the address and funding from the API\'s review; no demo sample', async () => {
    setUp(map(CAPTURED.declaration));
    const page = await open();
    expect([...page.root().querySelectorAll('.wz-decl dd')].map((d) => d.textContent?.trim())).toEqual(['Torstraße 45, Berlin, 10119 Almanya', 'Yurt dışı banka transferi']);
    expect(page.button('Demo: örnek belge kullan')).toBeUndefined();
  });

  it('sends the chosen file and the tick, and follows the API to the list search', async () => {
    const submitDeclaration = vi.fn(async () => map(CAPTURED.screening));
    setUp(map(CAPTURED.declaration), { submitDeclaration });
    const page = await open();
    const chosen = file('fatura.pdf', 200_000);
    page.choose(chosen);
    page.tick();
    page.submit().click();
    expect(submitDeclaration).toHaveBeenCalledWith({ file: chosen, declared: true });
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/eligibility/screening'));
  });

  it('a refusal: the API\'s sentence, and the file and tick stay', async () => {
    const submitDeclaration = vi.fn(async () => {
      throw new ApiError('Dosya okunamadı. Lütfen başka bir dosya yükleyiniz.', { code: 'invalid_file', status: 422 });
    });
    setUp(map(CAPTURED.declaration), { submitDeclaration });
    const page = await open();
    page.choose(file('fatura.pdf', 200_000));
    page.tick();
    page.submit().click();
    await page.settle();
    // Shown twice as the page is today: the file's own error line falls back to the store's error too.
    expect(page.alerts()).toEqual(['Dosya okunamadı. Lütfen başka bir dosya yükleyiniz.', 'Dosya okunamadı. Lütfen başka bir dosya yükleyiniz.']);
    expect(page.q('.wz-decl .file b')).toBe('fatura.pdf');
    expect(page.submit().disabled).toBe(false);
  });
});
