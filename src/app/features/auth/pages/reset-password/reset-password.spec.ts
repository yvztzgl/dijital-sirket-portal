import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { ApplicationStore } from '@core/state/application.store';
import { authRoutes } from '../../auth.routes';

const SENT = 'Bu adres kayıtlıysa birkaç dakika içinde bir sıfırlama bağlantısı alacaksınız. Bağlantı 30 dakika geçerlidir.';

/** D-0d against the mock API, driven through the page's DOM only. */
describe('ResetPasswordPage (D-0d)', () => {
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
    await harness.navigateByUrl('/reset-password');
    harness.detectChanges();
    const root = () => harness.routeNativeElement as HTMLElement;
    const type = (value: string) => {
      const input = root().querySelector<HTMLInputElement>('input[type=email]')!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      harness.detectChanges();
    };
    const send = () => [...root().querySelectorAll('button')].find((b) => b.textContent?.includes('gönder'))!;
    const alert = () => root().querySelector('[role=alert]')?.textContent?.trim() ?? null;
    const status = () => root().querySelector('[role=status]')?.textContent?.trim() ?? null;
    return { harness, root, type, send, alert, status };
  }

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

  it('does not call the API for an invalid e-mail', async () => {
    const request = vi.spyOn(TestBed.inject(Api), 'requestPasswordReset');
    const page = await open();
    expect(page.alert()).toBeNull();
    expect(page.send().textContent?.trim()).toBe('Bağlantı gönder');
    page.type('not-an-address');
    expect(page.alert()).toBeNull();
    page.send().click();
    page.harness.detectChanges();
    expect(page.alert()).toBe('Geçerli bir e-posta adresi girin.');
    expect(request).not.toHaveBeenCalled();
    expect(page.status()).toBeNull();
  });

  it('shows the "sent" state for a valid e-mail and holds the resend', async () => {
    const request = vi.spyOn(TestBed.inject(Api), 'requestPasswordReset');
    const page = await open();
    page.type('someone@example.com');
    page.send().click();
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.status()).toBe(SENT);
    });
    expect(request).toHaveBeenCalledWith('someone@example.com');
    expect(page.alert()).toBeNull();
    expect(page.send().disabled).toBe(true);
    expect(page.send().textContent?.trim()).toMatch(/^Tekrar gönder · 0[01]:\d\d$/);
  });
});
