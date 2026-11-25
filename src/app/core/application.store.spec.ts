import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Api, ApplicationStatus, Session } from './api';
import { ApiError } from './api-error';
import { ApplicationStore } from './application.store';
import { Account, Application } from './models';

/**
 * The store against a stand-in for `Api` with no demo tools, as in HTTP mode. Only the calls a
 * test makes are filled in.
 */
function fakeApi(calls: Partial<Record<keyof Api, unknown>>): Api {
  const work = { kind: 'server', status: async () => ({ stage: 'profile', changedAt: 't0' }), application: async () => SESSION.app, seen: () => null };
  return { demo: null, work, restore: async () => null, ...calls } as unknown as Api;
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

describe('ApplicationStore while the server works (HTTP mode)', () => {
  const at = (stage: Application['stage']) => ({ ...SESSION.app!, stage }) as Application;

  /** A ServerWork whose answers the test sets; counts the reads. */
  function serverWork() {
    const work = {
      kind: 'server' as const,
      current: { stage: 'scanning', changedAt: 't1' } as ApplicationStatus,
      seenStatus: { stage: 'scanning', changedAt: 't1' } as ApplicationStatus | null,
      next: at('review'),
      statusReads: 0,
      fullReads: 0,
      fail: null as ApiError | null,
      status: async () => {
        work.statusReads++;
        if (work.fail) throw work.fail;
        return work.current;
      },
      application: async () => {
        work.fullReads++;
        work.seenStatus = work.current;
        return work.next;
      },
      seen: () => work.seenStatus,
    };
    return work;
  }

  function setUp(work: ReturnType<typeof serverWork>, stage: Application['stage'] = 'scanning') {
    localStorage.clear();
    const api = { demo: null, work, restore: async () => ({ account: ACCOUNT, app: at(stage) }), logout: async () => undefined } as unknown as Api;
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }]), { provide: Api, useValue: api }] });
    return TestBed.inject(ApplicationStore);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('polls the status read, reads the application only when it changed, and stops when the stage is not a waiting one', async () => {
    const work = serverWork();
    const store = setUp(work);
    await store.restored;
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(work.statusReads).toBe(3);
    expect(work.fullReads).toBe(0);
    expect(store.stage()).toBe('scanning');

    work.current = { stage: 'review', changedAt: 't2' };
    await vi.advanceTimersByTimeAsync(2_000);
    expect(work.fullReads).toBe(1);
    expect(store.stage()).toBe('review');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(work.statusReads).toBe(4);
  });

  it('reads the application when only changedAt moved', async () => {
    const work = serverWork();
    work.current = { stage: 'titleChecking', changedAt: 't1' };
    work.seenStatus = work.current;
    work.next = at('titleChecking');
    const store = setUp(work, 'titleChecking');
    await store.restored;
    TestBed.tick();
    work.current = { stage: 'titleChecking', changedAt: 't2' };
    await vi.advanceTimersByTimeAsync(2_000);
    expect(work.fullReads).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(work.fullReads).toBe(1);
  });

  it('signs out and stops on a 401, and does not poll after sign-out', async () => {
    const work = serverWork();
    const store = setUp(work);
    await store.restored;
    TestBed.tick();
    work.fail = unauthenticated();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.signedIn()).toBe(false);
    TestBed.tick();
    const reads = work.statusReads;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(work.statusReads).toBe(reads);
  });

  it('does not poll outside the waiting stages', async () => {
    const work = serverWork();
    const store = setUp(work, 'review');
    await store.restored;
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(work.statusReads).toBe(0);
    await store.logout();
  });

  it('never lets the scan reach 100% on its own', async () => {
    const work = serverWork();
    const store = setUp(work);
    await store.restored;
    (store as unknown as { app: { set(a: Application): void } }).app.set({ ...at('scanning'), deck: { fileName: 'a.pdf', sizeKb: 1, pages: 0, startedAt: new Date(Date.now() - 3_600_000).toISOString(), fields: [] } });
    expect(store.scan()!.percent).toBeLessThan(100);
    expect(store.scan()!.p).toBeLessThanOrEqual(0.95);
  });
});
