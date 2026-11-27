import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { ApplicationStore } from '@core/state/application.store';
import { authRoutes } from '../../auth.routes';

const NAME = 'Adınızı ve soyadınızı pasaportunuzdaki gibi yazın.';
const EMAIL = 'Geçerli bir e-posta adresi girin.';
const PASSWORD = 'Şifre en az 10 karakter olmalı ve harf, rakam, sembol içermeli.';

/** D-0b against the mock API, driven through the page's DOM only. */
describe('RegisterPage (D-0b)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    TestBed.configureTestingModule({ providers: [provideRouter([...authRoutes, { path: '**', children: [] }])] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/register');
    harness.detectChanges();
    const root = () => harness.routeNativeElement as HTMLElement;
    const type = (placeholderOrType: string, value: string) => {
      const input = root().querySelector<HTMLInputElement>(`input[placeholder="${placeholderOrType}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      harness.detectChanges();
    };
    const button = (text: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
    const click = (text: string) => {
      button(text).click();
      harness.detectChanges();
    };
    const tick = (index: number) => {
      root().querySelectorAll<HTMLInputElement>('.wz-check input[type=checkbox]')[index].click();
      harness.detectChanges();
    };
    const alert = () => root().querySelector('[role=alert]')?.textContent?.trim() ?? null;
    const cta = () => [...root().querySelectorAll('button')].at(-1)!;
    const strengthText = () => root().querySelector('[aria-live=polite]')?.textContent?.trim() ?? '';
    const bars = () => [...root().querySelectorAll('div[aria-hidden=true] > span')].map((s) => s.getAttribute('style') ?? '');
    return { harness, root, type, click, tick, alert, cta, strengthText, bars, button };
  }

  const fillValid = (page: Awaited<ReturnType<typeof open>>) => {
    page.type('Pasaporttaki adınız', 'Jane');
    page.type('Soyadınız', 'Roe');
    page.type('ornek@sirket.com', 'jane.roe@example.com');
    page.type('En az 10 karakter', 'Strong-Pass-2026!');
  };

  it('clears an error left by an earlier screen when it opens', async () => {
    TestBed.inject(ApplicationStore).error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(page.alert()).toBeNull();
  });

  it('prefills the e-mail last typed on a sign-in screen (mock only)', async () => {
    TestBed.inject(Api).demo!.rememberEmail('kept@example.com');
    const page = await open();
    expect(page.root().querySelector<HTMLInputElement>('input[type=email]')!.value).toBe('kept@example.com');
  });

  it('shows the foreign path\'s messages in order: name, e-mail, weak password', async () => {
    const register = vi.spyOn(TestBed.inject(Api), 'register');
    const page = await open();
    expect(page.alert()).toBeNull();
    page.tick(0);
    page.tick(1);
    page.click('Hesap oluştur');
    expect(page.alert()).toBe(NAME);
    page.type('Pasaporttaki adınız', 'Jane');
    expect(page.alert()).toBe(NAME);
    page.type('Soyadınız', 'Roe');
    expect(page.alert()).toBe(EMAIL);
    page.type('ornek@sirket.com', 'jane.roe@example.com');
    expect(page.alert()).toBe(PASSWORD);
    page.type('En az 10 karakter', 'short');
    page.click('Hesap oluştur');
    expect(page.alert()).toBe(PASSWORD);
    expect(register).not.toHaveBeenCalled();
  });

  it('keeps the button disabled until both consents are ticked', async () => {
    const register = vi.spyOn(TestBed.inject(Api), 'register');
    const page = await open();
    fillValid(page);
    expect(page.cta().disabled).toBe(true);
    page.cta().click();
    page.tick(0);
    expect(page.cta().disabled).toBe(true);
    page.cta().click();
    page.tick(0);
    page.tick(1);
    expect(page.cta().disabled).toBe(true);
    page.cta().click();
    expect(register).not.toHaveBeenCalled();
    expect(page.alert()).toBeNull();
  });

  it('opens the e-Devlet dialog for a T.C. citizen instead of registering', async () => {
    const register = vi.spyOn(TestBed.inject(Api), 'register');
    const page = await open();
    page.click('T.C. vatandaşı');
    expect(page.root().querySelector('input[placeholder="Pasaporttaki adınız"]')).toBeNull();
    page.tick(0);
    page.tick(1);
    expect(page.cta().textContent).toContain('e-Devlet ile devam et');
    page.cta().click();
    page.harness.detectChanges();
    expect(page.root().querySelector('[role=dialog]')?.textContent).toContain('e-Devlet Kapısı');
    expect(register).not.toHaveBeenCalled();
    expect(page.alert()).toBeNull();
  });

  it('after a failed foreign attempt, the resident path shows the e-mail message while the e-mail is invalid', async () => {
    const page = await open();
    page.tick(0);
    page.tick(1);
    page.click('Hesap oluştur');
    expect(page.alert()).toBe(NAME);
    page.click('T.C. vatandaşı');
    expect(page.alert()).toBe(EMAIL);
    page.click('Yabancı uyruklu kurucu');
    page.type('ornek@sirket.com', 'jane.roe@example.com');
    page.click('T.C. vatandaşı');
    expect(page.alert()).toBeNull();
  });

  it('registers and goes to the verify screen', async () => {
    const page = await open();
    fillValid(page);
    page.tick(0);
    page.tick(1);
    expect(page.cta().disabled).toBe(false);
    page.cta().click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/verify-email'));
    expect(TestBed.inject(ApplicationStore).pendingEmail()).toBe('jane.roe@example.com');
  });

  it('shows the password strength as the password changes', async () => {
    const page = await open();
    const grey = 'height:4px;border-radius:2px;background:var(--bg-E5E7EB)';
    expect(page.strengthText()).toBe('En az 10 karakter, harf, rakam ve sembol');
    expect(page.bars()).toEqual([grey, grey, grey, grey]);
    page.type('En az 10 karakter', 'abc');
    expect(page.strengthText()).toBe('Çok zayıf · en az 10 karakter, harf, rakam ve sembol');
    expect(page.bars()).toEqual(['height:4px;border-radius:2px;background:var(--fg-B42318)', grey, grey, grey]);
    page.type('En az 10 karakter', 'abcdefghij1');
    expect(page.strengthText()).toBe('Orta · en az 10 karakter, harf, rakam ve sembol');
    const amber = 'height:4px;border-radius:2px;background:var(--fg-B54708)';
    expect(page.bars()).toEqual([amber, amber, grey, grey]);
    page.type('En az 10 karakter', 'Strong-Pass-2026!');
    expect(page.strengthText()).toBe('Çok güçlü · en az 10 karakter, harf, rakam ve sembol');
    expect(page.root().querySelector('[aria-live=polite] app-icon')).not.toBeNull();
    const green = 'height:4px;border-radius:2px;background:var(--fg-15803D)';
    expect(page.bars()).toEqual([green, green, green, green]);
    expect(page.root().querySelector('[aria-live=polite]')!.getAttribute('style')).toContain('color:var(--fg-15803D)');
  });
});
