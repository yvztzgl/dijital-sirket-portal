import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { Inbox } from '@core/services/inbox';
import { ApplicationStore } from '@core/state/application.store';
import { authRoutes } from '../../auth.routes';

/** D-0e against the mock API, driven through the page's DOM only. */
describe('NewPasswordPage (D-0e)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    TestBed.configureTestingModule({ providers: [provideRouter([...authRoutes, { path: '**', children: [] }])] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    harness.detectChanges();
    const root = () => harness.routeNativeElement as HTMLElement;
    const type = (id: string, value: string) => {
      const input = root().querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      harness.detectChanges();
    };
    const submit = () => {
      [...root().querySelectorAll('button')].find((b) => b.textContent?.includes('Şifremi değiştir'))!.click();
      harness.detectChanges();
    };
    const alert = () => root().querySelector('[role=alert]')?.textContent?.trim() ?? null;
    return { harness, root, type, submit, alert };
  }

  /** A live reset link for the demo founder, as the mock's e-mail carries it. */
  async function resetLink() {
    const store = TestBed.inject(ApplicationStore);
    await store.seed('profile');
    await store.logout();
    expect(await store.requestPasswordReset(TestBed.inject(Api).demo!.account.email)).toBe(true);
    return TestBed.inject(Inbox).latest('mail')!.link!.url;
  }

  it('clears an error left by an earlier screen when it opens', async () => {
    TestBed.inject(ApplicationStore).error.set('Önceki ekranın hatası.');
    const page = await open('/sifre-sifirla?token=abc');
    expect(page.alert()).toBeNull();
  });

  it('asks for a strong password', async () => {
    const confirm = vi.spyOn(TestBed.inject(Api), 'confirmPasswordReset');
    const page = await open('/sifre-sifirla?token=abc');
    expect(page.alert()).toBeNull();
    page.type('np-pw', 'short');
    page.type('np-repeat', 'short');
    expect(page.alert()).toBeNull();
    page.submit();
    expect(page.alert()).toBe('Şifre en az 10 karakter olmalı ve harf, rakam, sembol içermeli.');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks for the same password twice', async () => {
    const confirm = vi.spyOn(TestBed.inject(Api), 'confirmPasswordReset');
    const page = await open('/sifre-sifirla?token=abc');
    page.type('np-pw', 'Strong-Pass-2026!');
    page.type('np-repeat', 'Strong-Pass-2027!');
    page.submit();
    expect(page.alert()).toBe('Yazdığınız iki şifre aynı değildir.');
    page.type('np-repeat', 'Strong-Pass-2026!');
    expect(page.alert()).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('without a token shows the broken-link message and offers nothing to send', async () => {
    const confirm = vi.spyOn(TestBed.inject(Api), 'confirmPasswordReset');
    const replace = vi.spyOn(TestBed.inject(Location), 'replaceState');
    const page = await open('/sifre-sifirla');
    expect(page.alert()).toBe('Bağlantı geçersiz veya eksik. Yeniden şifre sıfırlama isteyiniz.');
    expect(page.root().querySelector('#np-pw')).toBeNull();
    expect([...page.root().querySelectorAll('button')].some((b) => b.textContent?.includes('Şifremi değiştir'))).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('removes the token from the address when the screen opens', async () => {
    const replace = vi.spyOn(TestBed.inject(Location), 'replaceState');
    await open('/sifre-sifirla?token=abc');
    expect(replace).toHaveBeenCalledWith('/sifre-sifirla');
  });

  it('shows the strength of the new password', async () => {
    const page = await open('/sifre-sifirla?token=abc');
    const text = () => page.root().querySelector('[aria-live=polite]')?.textContent?.trim();
    expect(text()).toBe('En az 10 karakter, harf, rakam ve sembol');
    page.type('np-pw', 'Strong-Pass-2026!');
    expect(text()).toBe('Çok güçlü · en az 10 karakter, harf, rakam ve sembol');
  });

  it('sets the password with a live link and goes to the login screen, which says so', async () => {
    const url = await resetLink();
    const confirm = vi.spyOn(TestBed.inject(Api), 'confirmPasswordReset');
    const page = await open(url);
    page.type('np-pw', 'Yeni-Sifre-2026!');
    page.type('np-repeat', 'Yeni-Sifre-2026!');
    page.submit();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/login'));
    expect(confirm).toHaveBeenCalledWith(new URL(url, 'http://x').searchParams.get('token'), 'Yeni-Sifre-2026!');
    page.harness.detectChanges();
    expect(page.root().querySelector('[role=status]')?.textContent?.trim()).toBe('Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.');
  });

  it('shows the store\'s error for a dead link', async () => {
    const page = await open('/sifre-sifirla?token=abc');
    page.type('np-pw', 'Strong-Pass-2026!');
    page.type('np-repeat', 'Strong-Pass-2026!');
    page.submit();
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.alert()).toBe('Bağlantı geçersiz veya süresi dolmuş. Yeniden şifre sıfırlama isteyiniz.');
    });
    expect(TestBed.inject(Router).url.split('?')[0]).toBe('/sifre-sifirla');
  });
});
