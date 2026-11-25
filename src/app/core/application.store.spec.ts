import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Api, Session } from './api';
import { ApiError } from './api-error';
import { ApplicationStore } from './application.store';
import { Account, Application } from './models';

/**
 * The store against a stand-in for `Api` with no demo tools, as in HTTP mode. Only the calls a
 * test makes are filled in.
 */
function fakeApi(calls: Partial<Record<keyof Api, unknown>>): Api {
  return { demo: null, restore: async () => null, ...calls } as unknown as Api;
}

const ACCOUNT: Account = { email: 'ayse@example.test', firstName: 'Ayşe', lastName: 'Kaya', founderType: 'foreign', verified: true };
const SESSION: Session = { account: ACCOUNT, app: { id: 'DS-26-03403699', stage: 'profile' } as Application };
const unauthenticated = () => new ApiError('Oturumunuz bulunamadı. Lütfen giriş yapınız.', { code: 'unauthenticated', status: 401 });

describe('ApplicationStore sessions', () => {
  function setUp(api: Api) {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }]), { provide: Api, useValue: api }] });
    return TestBed.inject(ApplicationStore);
  }

  it('restores the session the API reports at start', async () => {
    const store = setUp(fakeApi({ restore: async () => SESSION }));
    await store.restored;
    expect(store.account()).toEqual(ACCOUNT);
    expect(store.stage()).toBe('profile');
  });

  it('forgets the founder and goes to the login page when a call answers unauthenticated', async () => {
    const store = setUp(fakeApi({ restore: async () => SESSION, submitProfile: () => Promise.reject(unauthenticated()) }));
    await store.restored;
    const router = TestBed.inject(Router);
    expect(await store.submitProfile({} as never)).toBe(false);
    expect(store.account()).toBeNull();
    expect(store.app()).toBeNull();
    expect(store.stage()).toBeNull();
    expect(store.error()).toBe('Oturumunuz bulunamadı. Lütfen giriş yapınız.');
    await new Promise((resolve) => setTimeout(resolve));
    expect(router.url).toBe('/login');
  });

  it('keeps the address in memory when login answers email_not_verified, and leaves the server\'s sentence for the verify screen', async () => {
    const notVerified = new ApiError('E-posta adresiniz henüz doğrulanmadı. Size yeni bir kod gönderdik.', { code: 'email_not_verified', status: 403 });
    const verify = vi.fn(async () => SESSION);
    const store = setUp(fakeApi({ login: () => Promise.reject(notVerified), verifyEmail: verify }));
    await store.restored;
    expect(await store.login(' ayse@example.test ', 'Nova-Lab-2026!')).toBe(false);
    expect(store.signedIn()).toBe(false);
    expect(store.pendingEmail()).toBe('ayse@example.test');
    expect(store.stage()).toBe('registered');
    expect(store.resumeRoute()).toBe('/verify-email');
    expect(store.takeNotice()).toBe('E-posta adresiniz henüz doğrulanmadı. Size yeni bir kod gönderdik.');
    expect(store.takeNotice()).toBeNull();
    expect(await store.verifyEmail('424346')).toBe(true);
    expect(verify).toHaveBeenCalledWith('ayse@example.test', '424346');
    expect(store.pendingEmail()).toBeNull();
    expect(store.account()).toEqual(ACCOUNT);
  });

  it('writes nothing about the founder to the browser\'s storage without demo tools', async () => {
    const store = setUp(fakeApi({ register: async () => undefined, login: async () => SESSION, logout: async () => undefined }));
    await store.restored;
    await store.register({ firstName: 'Ayşe', lastName: 'Kaya', email: 'ayse@example.test', password: 'Nova-Lab-2026!' });
    store.rememberEmail('ayse@example.test');
    await store.login('ayse@example.test', 'Nova-Lab-2026!');
    expect(store.signedIn()).toBe(true);
    await store.logout();
    expect(store.signedIn()).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(store.rememberedEmail()).toBe('');
  });

  it('shows the field\'s sentence of a validation refusal (a wrong code)', async () => {
    const wrongCode = new ApiError('Gönderdiğiniz bilgiler eksik veya hatalıdır.', {
      code: 'validation_failed',
      status: 400,
      fields: { code: ['Kod hatalı veya süresi dolmuş. Yeni kod isteyiniz.'] },
    });
    const store = setUp(fakeApi({ register: async () => undefined, verifyEmail: () => Promise.reject(wrongCode) }));
    await store.restored;
    await store.register({ firstName: 'Ayşe', lastName: 'Kaya', email: 'ayse@example.test', password: 'Nova-Lab-2026!' });
    expect(await store.verifyEmail('000000')).toBe(false);
    expect(store.error()).toBe('Kod hatalı veya süresi dolmuş. Yeni kod isteyiniz.');
  });

  it('does not let a slow restore undo a sign-in that happened meanwhile', async () => {
    let finishRestore!: (s: Session | null) => void;
    const store = setUp(fakeApi({ restore: () => new Promise((resolve) => (finishRestore = resolve)), login: async () => SESSION }));
    await store.login('ayse@example.test', 'Nova-Lab-2026!');
    finishRestore(null);
    await store.restored;
    expect(store.account()).toEqual(ACCOUNT);
  });
});
