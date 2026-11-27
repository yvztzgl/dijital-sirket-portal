import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { Inbox } from '@core/services/inbox';
import { ApplicationStore } from '@core/state/application.store';
import { authRoutes } from '../../auth.routes';

/** D-0a against the mock API, driven through the page's DOM only. */
describe('LoginPage (D-0a)', () => {
  let store: ApplicationStore;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    TestBed.configureTestingModule({ providers: [provideRouter([...authRoutes, { path: '**', children: [] }])] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
  });

  afterEach(() => vi.unstubAllGlobals());

  async function open(url = '/login') {
    const harness = await RouterTestingHarness.create();
    const go = async (to: string) => {
      await harness.navigateByUrl(to);
      harness.detectChanges();
    };
    await go(url);
    const root = () => harness.routeNativeElement as HTMLElement;
    const type = (selector: string, value: string) => {
      const input = root().querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      harness.detectChanges();
    };
    const submit = () => {
      [...root().querySelectorAll('button')].find((b) => b.textContent?.includes('Giriş yap'))!.click();
      harness.detectChanges();
    };
    const alert = () => root().querySelector('[role=alert]')?.textContent?.trim() ?? null;
    const status = () => root().querySelector('[role=status]')?.textContent?.trim() ?? null;
    return { harness, go, root, type, submit, alert, status };
  }

  /** The demo founder exists in the mock but nobody is signed in. */
  async function signedOutFounder() {
    await store.seed('profile');
    await store.logout();
    return TestBed.inject(Api).demo!.account;
  }

  it('clears an error left by an earlier screen when it opens', async () => {
    TestBed.inject(ApplicationStore).error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(page.alert()).toBeNull();
  });

  it('shows no message before the first submit', async () => {
    const page = await open();
    page.type('#li-email', 'not-an-address');
    expect(page.alert()).toBeNull();
  });

  it('asks for a valid e-mail', async () => {
    const page = await open();
    page.type('#li-email', 'not-an-address');
    page.type('#li-pw', 'whatever');
    page.submit();
    expect(page.alert()).toBe('Geçerli bir e-posta adresi girin.');
  });

  it('asks for the password', async () => {
    const page = await open();
    page.type('#li-email', 'someone@example.com');
    page.submit();
    expect(page.alert()).toBe('Şifrenizi yazın.');
  });

  it('shows the store\'s error for a wrong password', async () => {
    const account = await signedOutFounder();
    const page = await open();
    page.type('#li-email', account.email);
    page.type('#li-pw', 'wrong-password');
    page.submit();
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.alert()).toBe('E-posta veya şifre hatalı.');
    });
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('signs in and goes to where the application is', async () => {
    const account = await signedOutFounder();
    const page = await open();
    page.type('#li-email', account.email);
    page.type('#li-pw', account.password);
    page.submit();
    await vi.waitFor(() => expect(store.signedIn()).toBe(true));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe(store.resumeRoute()));
    expect(store.resumeRoute()).not.toBe('/login');
  });

  it('prefills the e-mail typed on the last attempt (mock only)', async () => {
    const account = await signedOutFounder();
    const page = await open();
    page.type('#li-email', account.email);
    page.type('#li-pw', 'wrong-password');
    page.submit();
    await vi.waitFor(() => expect(store.error()).not.toBeNull());
    await page.go('/register');
    await page.go('/login');
    expect(page.root().querySelector<HTMLInputElement>('#li-email')!.value).toBe(account.email);
  });

  it('shows the notice the previous screen left, once', async () => {
    const account = await signedOutFounder();
    expect(await store.requestPasswordReset(account.email)).toBe(true);
    const token = new URL(TestBed.inject(Inbox).latest('mail')!.link!.url, 'http://x').searchParams.get('token')!;
    expect(await store.confirmPasswordReset(token, 'Yeni-Sifre-2026!')).toBe(true);
    const page = await open();
    expect(page.status()).toBe('Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.');
    await page.go('/reset-password');
    await page.go('/login');
    expect(page.status()).toBeNull();
  });
});
