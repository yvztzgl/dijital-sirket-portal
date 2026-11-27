import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { Api } from '@core/api/api';
import { toAccount, toApplication } from '@core/api/http/api-mapper';
import { CAPTURED } from '@core/api/testing/api-fixtures';
import { Application } from '@core/models/models';
import { Assistant } from '@core/services/assistant';
import { Clock } from '@core/services/clock';
import { Inbox } from '@core/services/inbox';
import { ApplicationStore } from '@core/state/application.store';
import { date, tl0 } from '@core/utils/format';
import { setupRoutes } from '../../setup.routes';

const routes = [...setupRoutes, { path: '**', children: [] }];
const matchMedia = (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined });

async function open() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/setup/complete');
  harness.detectChanges();
  const root = () => harness.routeNativeElement as HTMLElement;
  const q = (selector: string) => root().querySelector(selector)?.textContent?.trim() ?? null;
  const button = (label: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  /** The result card's rows as [term, value, note, button]. */
  const results = () =>
    [...root().querySelectorAll('.wz-done dl > div')].map((d) => [d.querySelector('dt')!.textContent!.trim(), d.querySelector('dd')!.textContent!.trim(), d.querySelector('small')!.textContent!.trim(), d.querySelector('button')!.textContent!.trim()]);
  const rowButton = (term: string) => [...root().querySelectorAll('.wz-done dl > div')].find((d) => d.querySelector('dt')!.textContent!.trim() === term)!.querySelector('button')!;
  return { harness, root, q, button, results, rowButton };
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
}

/** D-5b against the mock API, driven through the page's DOM. */
describe('SetupCompletePage (D-5b), mock', () => {
  let store: ApplicationStore;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Clock, useValue: { now: signal(Date.now()) } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    await store.seed('done');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it('clears an error left by an earlier screen when it opens', async () => {
    store.error.set('Önceki ekranın hatası.');
    await open();
    expect(store.error()).toBeNull();
  });

  it('the company, its registration and the four results', async () => {
    const page = await open();
    const a = store.app()!;
    const r = a.results!;
    expect(page.q('h1')).toBe('Şirketiniz kuruldu');
    expect(page.q('.wz-lead b')).toBe(store.fullTitle());
    expect(page.q('.wz-lead')).toBe(`${store.fullTitle()}Tescil ${date(a.setup!.finishedAt!)} · Gebze Ticaret Sicili Müdürlüğü · Merkez: Terminal İstanbul, Gebze / Kocaeli`);
    expect(page.results()).toEqual([
      ['Vergi kimlik no', r.vkn, r.taxOffice, 'Kopyala'],
      ['MERSİS no', r.mersis, 'Ticaret sicili tescil edildi', 'Kopyala'],
      ['IBAN · Halkbank', r.iban, `Sermayenin %25'i (${tl0(a.company.capital * 0.25)}) bloke`, 'Kopyala'],
      ['Mali müşavir', r.advisor, r.advisorFirm, 'İletişim'],
    ]);
    expect([...page.root().querySelectorAll('.wz-done dd')].map((d) => d.classList.contains('mono'))).toEqual([true, true, true, false]);
  });

  it('the next three steps, with the capital to deposit and the advisor', async () => {
    const page = await open();
    const a = store.app()!;
    const items = [...page.root().querySelectorAll('.wz-next li')];
    expect(items.map((li) => li.querySelector('b')!.textContent)).toEqual(['Sermayenin %25’ini yatırınız', 'İlk e-faturanızı kesiniz', 'Mali müşavirinizle tanışınız']);
    expect(items.map((li) => li.querySelector('.when')!.textContent)).toEqual(['30 gün içinde', 'Hazır', 'Önerilir']);
    expect(items.map((li) => li.querySelector('.when')!.className)).toEqual(['when warn', 'when ok', 'when info']);
    expect(items.map((li) => li.querySelector('img')!.getAttribute('src'))).toEqual(['/assets/illustrations/next-bank.webp', '/assets/illustrations/next-invoice.webp', '/assets/illustrations/next-advisor.webp']);
    expect(items[0].querySelector('small')!.textContent).toBe(`${tl0(a.company.capital * 0.25)} tutarını Halkbank hesabınıza transfer ediniz; blokaj tescille kalkar.`);
    expect(items[2].querySelector('small')!.textContent).toBe(`${a.results!.advisor!.replace('SMMM ', '')} ile 20 dakikalık görüntülü bir görüşme planlayabilirsiniz.`);
  });

  it('"Kopyala" copies the value (the IBAN with its spaces), says "Kopyalandı" for a moment', async () => {
    const writeText = vi.fn(async () => undefined);
    stubClipboard(writeText);
    const page = await open();
    const r = store.app()!.results!;
    page.rowButton('Vergi kimlik no').click();
    page.harness.detectChanges();
    expect(writeText).toHaveBeenLastCalledWith(r.vkn!.replace(/\s/g, ''));
    expect(page.rowButton('Vergi kimlik no').textContent?.trim()).toBe('Kopyalandı');
    page.rowButton('IBAN · Halkbank').click();
    page.harness.detectChanges();
    expect(writeText).toHaveBeenLastCalledWith(r.iban!.replace(/\s/g, ' '));
    expect(page.rowButton('IBAN · Halkbank').textContent?.trim()).toBe('Kopyalandı');
    expect(page.rowButton('Vergi kimlik no').textContent?.trim()).toBe('Kopyala');
    await vi.waitFor(
      () => {
        page.harness.detectChanges();
        expect(page.rowButton('IBAN · Halkbank').textContent?.trim()).toBe('Kopyala');
      },
      { timeout: 2_500 },
    );
  });

  it('a refused copy still acknowledges the press', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    const page = await open();
    page.rowButton('MERSİS no').click();
    page.harness.detectChanges();
    expect(page.rowButton('MERSİS no').textContent?.trim()).toBe('Kopyalandı');
    await new Promise((r) => setTimeout(r));
  });

  it('"İletişim" sends the advisor\'s introduction mail', async () => {
    const page = await open();
    const advisor = store.app()!.results!.advisor!;
    page.rowButton('Mali müşavir').click();
    expect(TestBed.inject(Inbox).latest('mail')).toMatchObject({
      from: 'musavirlik@terminalistanbul.com',
      title: 'Tanışma talebiniz iletildi',
      body: `${advisor} sizinle 1 iş günü içinde iletişime geçecek ve 20 dakikalık bir tanışma görüşmesi planlayacak.`,
    });
  });

  it('downloads all documents as one ZIP named after the company', async () => {
    // jsdom has no object URLs.
    const created = vi.fn(() => 'blob:zip');
    const original = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: () => undefined });
    onTestFinished(() => void Object.assign(URL, original));
    let saved: { href: string; download: string } | null = null;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved = { href: this.getAttribute('href')!, download: this.download };
    });
    onTestFinished(() => click.mockRestore());
    const page = await open();
    const button = page.button('Tüm belgeleri indir')!;
    expect(button.textContent?.trim()).toBe(`Tüm belgeleri indir (ZIP, ${store.docs().length} belge)`);
    button.click();
    expect(created).toHaveBeenCalledTimes(1);
    expect(saved).toEqual({ href: 'blob:zip', download: `${store.title().replace(/\s+/g, '-')}-belgeler.zip` });
  });

  it('"Şirket paneline git" sends the demo mail', async () => {
    const page = await open();
    page.button('Şirket paneline git')!.click();
    expect(TestBed.inject(Inbox).latest('mail')).toMatchObject({
      from: 'no-reply@dijitalsirket.gov.tr',
      title: 'Şirket paneliniz hazırlanıyor',
      body: `${store.fullTitle()} paneline erişim bilgileri birkaç dakika içinde e-postanıza gönderilecek.`,
    });
    expect(page.button('Belgeleri görüntüle')).toBeUndefined();
  });
});

/** D-5b in HTTP mode: the real store over a stand-in for the API that answers with captured views. */
describe('SetupCompletePage (D-5b), HTTP mode', () => {
  const account = toAccount({ firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test', founderType: 'foreign', verified: true });
  const map = (view: unknown) => toApplication(view as never, account);

  function setUp(app: Application) {
    localStorage.clear();
    vi.stubGlobal('matchMedia', matchMedia);
    const seen = { stage: app.stage, changedAt: 't0' };
    const api = { demo: null, work: { kind: 'server', status: async () => seen, application: async () => app, seen: () => seen }, restore: async () => ({ account, app }) };
    TestBed.configureTestingModule({ providers: [provideRouter(routes), { provide: Api, useValue: api }, { provide: Clock, useValue: { now: signal(Date.parse('2026-11-26T12:00:00Z')) } }] });
    const store = TestBed.inject(ApplicationStore);
    expect(store.serverDecides).toBe(true);
    return store;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('only what the API reports: the finishing date and registry number, five identifiers to copy', async () => {
    const app = map(CAPTURED.setupDone);
    const r = app.results!;
    setUp(app);
    const page = await open();
    expect(page.q('.wz-lead')).toBe(`${page.q('.wz-lead b')}Kuruluş ${date(app.setup!.finishedAt!)} · Ticaret sicili tescil no ${r.registryNo}`);
    expect(page.results()).toEqual([
      ['Vergi kimlik no', r.vkn, r.taxOffice, 'Kopyala'],
      ['MERSİS no', r.mersis, `Ticaret sicili tescil no ${r.registryNo}`, 'Kopyala'],
      ['IBAN', r.iban, '', 'Kopyala'],
      ['e-Fatura kayıt no', r.eInvoiceNo, '', 'Kopyala'],
      ['SGK işyeri sicil no', r.sgkNo, '', 'Kopyala'],
    ]);
  });

  it('an identifier the API did not send is left out', async () => {
    const app = map(CAPTURED.setupDone);
    app.results = { ...app.results!, iban: undefined, sgkNo: undefined, registryNo: undefined };
    setUp(app);
    const page = await open();
    expect(page.results().map((r) => r[0])).toEqual(['Vergi kimlik no', 'MERSİS no', 'e-Fatura kayıt no']);
    expect(page.results()[1][2]).toBe('');
    expect(page.q('.wz-lead')).toBe(`${page.q('.wz-lead b')}Kuruluş ${date(app.setup!.finishedAt!)}`);
  });

  it('no next steps and no ZIP; the panel buttons open the documents and the log', async () => {
    setUp(map(CAPTURED.setupDone));
    const assistant = TestBed.inject(Assistant);
    const page = await open();
    expect(page.root().querySelector('.wz-next')).toBeNull();
    expect(page.button('Tüm belgeleri indir')).toBeUndefined();
    expect(page.button('Şirket paneline git')).toBeUndefined();
    expect(page.q('.wz-foot')).toBe('Şirketinize ait belgeler düzenlendiğinde Belgeler bölümünde listelenecektir.');
    page.button('Belgeleri görüntüle')!.click();
    expect(assistant.panel().tab).toBe('docs');
    page.button('İşlem kaydını görüntüle')!.click();
    expect(assistant.panel().tab).toBe('log');
  });
});
