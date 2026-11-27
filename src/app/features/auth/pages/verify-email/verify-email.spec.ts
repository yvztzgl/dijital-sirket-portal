import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Api } from '@core/api/api';
import { DemoSettings } from '@core/api/demo/demo-settings';
import { Clock } from '@core/services/clock';
import { Inbox } from '@core/services/inbox';
import { ApplicationStore } from '@core/state/application.store';
import { authRoutes } from '../../auth.routes';

/** D-0c against the mock API, driven through the page's DOM only; time comes from a hand-moved `Clock`. */
describe('VerifyEmailPage (D-0c)', () => {
  let store: ApplicationStore;
  let now: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    now = signal(Date.now());
    TestBed.configureTestingModule({ providers: [provideRouter([...authRoutes, { path: '**', children: [] }]), { provide: Clock, useValue: { now } }] });
    TestBed.inject(DemoSettings).set({ speed: 1000 });
    store = TestBed.inject(ApplicationStore);
    // The demo founder registered but has not confirmed the address yet; a code is in the inbox.
    await store.seed('registered');
  });

  afterEach(() => vi.unstubAllGlobals());

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/verify-email');
    harness.detectChanges();
    const root = () => harness.routeNativeElement as HTMLElement;
    const button = (text: string) => [...root().querySelectorAll('button')].find((b) => b.textContent?.includes(text));
    const boxes = () => [...root().querySelectorAll<HTMLInputElement>('app-otp-input input')];
    const typeCode = (code: string) => {
      code.split('').forEach((d, i) => {
        boxes()[i].value = d;
        boxes()[i].dispatchEvent(new Event('input'));
      });
      harness.detectChanges();
    };
    const alert = () => root().querySelector('[role=alert]')?.textContent?.trim() ?? null;
    return { harness, root, button, typeCode, alert };
  }

  it('clears an error left by an earlier screen when it opens', async () => {
    TestBed.inject(ApplicationStore).error.set('Önceki ekranın hatası.');
    const page = await open();
    expect(page.alert()).toBeNull();
  });

  it('shows the address waiting for its code', async () => {
    const page = await open();
    expect(page.root().textContent).toContain(`${TestBed.inject(Api).demo!.account.email} adresine 6 haneli bir kod gönderdik.`);
  });

  it('asks for six digits and calls nothing otherwise', async () => {
    const verify = vi.spyOn(TestBed.inject(Api), 'verifyEmail');
    const page = await open();
    page.button('Doğrula ve başvuruya geç')!.click();
    page.harness.detectChanges();
    expect(page.alert()).toBe('6 haneli kodu girin.');
    page.typeCode('123');
    page.button('Doğrula ve başvuruya geç')!.click();
    page.harness.detectChanges();
    expect(page.alert()).toBe('6 haneli kodu girin.');
    expect(verify).not.toHaveBeenCalled();
  });

  it('confirms the address with the right code and moves on', async () => {
    const code = TestBed.inject(Inbox).latest('mail')!.code!;
    const page = await open();
    page.typeCode(code);
    await vi.waitFor(() => expect(store.signedIn()).toBe(true));
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe(store.resumeRoute()));
    expect(store.resumeRoute()).not.toBe('/verify-email');
  });

  it('checks one code at a time', async () => {
    const verify = vi.spyOn(TestBed.inject(Api), 'verifyEmail');
    const code = TestBed.inject(Inbox).latest('mail')!.code!;
    const page = await open();
    page.typeCode(code);
    // Enter in the boxes reports the code again while the first check runs.
    page.root().querySelectorAll('app-otp-input input')[5].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await vi.waitFor(() => expect(store.signedIn()).toBe(true));
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('shows the store\'s error for a wrong code', async () => {
    const code = TestBed.inject(Inbox).latest('mail')!.code!;
    const page = await open();
    page.typeCode(code === '111111' ? '222222' : '111111');
    await vi.waitFor(() => {
      page.harness.detectChanges();
      expect(page.alert()).toBe('Kod hatalı veya süresi dolmuş. Yeni kod isteyin.');
    });
    expect(TestBed.inject(Router).url).toBe('/verify-email');
  });

  it('refuses a new code while the countdown runs and allows it after', async () => {
    const resend = vi.spyOn(TestBed.inject(Api), 'resendEmailCode');
    const page = await open();
    expect(page.button('Kodu tekrar gönder')).toBeUndefined();
    expect(page.root().textContent).toMatch(/(01:00|00:59) sonra tekrar gönderebilirsiniz/);
    now.set(Date.now() + 30_000);
    page.harness.detectChanges();
    expect(page.root().textContent).toMatch(/00:(29|30) sonra tekrar gönderebilirsiniz/);
    expect(page.button('Kodu tekrar gönder')).toBeUndefined();

    now.set(Date.now() + 61_000);
    page.harness.detectChanges();
    page.typeCode('12');
    page.button('Kodu tekrar gönder')!.click();
    page.harness.detectChanges();
    await vi.waitFor(() => expect(store.busy()).toBe(false));
    expect(resend).toHaveBeenCalledTimes(1);
    // The boxes were emptied for the new code.
    expect(page.root().querySelectorAll<HTMLInputElement>('app-otp-input input')[0].value).toBe('');

    // The countdown starts again from the time of the send.
    now.set(Date.now());
    page.harness.detectChanges();
    expect(page.button('Kodu tekrar gönder')).toBeUndefined();
    expect(page.root().textContent).toMatch(/0[01]:\d\d sonra tekrar gönderebilirsiniz/);
  });

  it('"change e-mail" signs out and goes to the register screen', async () => {
    const page = await open();
    const link = [...page.root().querySelectorAll('a')].find((a) => a.textContent?.includes('E-postayı değiştir'))!;
    link.click();
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/register'));
    expect(store.pendingEmail()).toBeNull();
  });

  it('shows the notice the login screen left', async () => {
    const account = TestBed.inject(Api).demo!.account;
    expect(await store.login(account.email, account.password)).toBe(false);
    const page = await open();
    expect(page.root().querySelector('[role=status]')?.textContent?.trim()).toBe('E-posta adresiniz henüz doğrulanmadı. Size yeni bir kod gönderdik.');
  });
});
