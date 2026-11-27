import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Api, ApplicationStatus, Session } from '@core/api/api';
import { ApiError } from '@core/api/api-error';
import { ApplicationStore, STEP_UP_CANCELLED } from './application.store';
import { Account, Application } from '@core/models/models';

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
      current: { stage: 'evaluating', changedAt: 't1' } as ApplicationStatus,
      seenStatus: { stage: 'evaluating', changedAt: 't1' } as ApplicationStatus | null,
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

  function setUp(work: ReturnType<typeof serverWork>, stage: Application['stage'] = 'evaluating') {
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
    expect(store.stage()).toBe('evaluating');

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
});

describe('ApplicationStore in step 2 (HTTP mode)', () => {
  const base = { ...SESSION.app!, founder: { firstName: 'Ayşe', lastName: 'Kaya', nationality: '', passportNo: '' } } as Application;
  const at = (stage: Application['stage'], extra: Partial<Application> = {}) => ({ ...base, stage, ...extra }) as Application;

  /** An Api stand-in in server mode whose answers the test sets. */
  function serverApi(start: Application | null, extra: Partial<Record<keyof Api, unknown>> = {}) {
    const api = {
      demo: null,
      statusReads: 0,
      fullReads: 0,
      current: { stage: start?.stage ?? 'profile', changedAt: 't1' } as ApplicationStatus,
      next: start,
      fail: null as ApiError | null,
      calls: [] as string[],
      work: {
        kind: 'server' as const,
        status: async () => {
          api.statusReads++;
          if (api.fail) throw api.fail;
          return api.current;
        },
        application: async () => {
          api.fullReads++;
          return api.next;
        },
        seen: () => ({ stage: start?.stage ?? 'profile', changedAt: 't1' }),
      },
      restore: async () => ({ account: ACCOUNT, app: start }),
      logout: async () => undefined,
      completeIdentity: async () => {
        api.calls.push('completeIdentity');
        return api.next;
      },
      phoneLinkStatus: async (token: string) => {
        api.calls.push(`phoneLinkStatus:${token}`);
        return api.phone;
      },
      completeIdentityByPhone: async () => {
        api.calls.push('completeIdentityByPhone');
        return api.phone;
      },
      phone: { state: 'ready', expiresAt: new Date(Date.now() + 600_000).toISOString() } as unknown,
      ...extra,
    };
    return api;
  }

  function setUp(api: ReturnType<typeof serverApi>) {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }]), { provide: Api, useValue: api }] });
    return TestBed.inject(ApplicationStore);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not poll at the identity step before anything is started', async () => {
    const api = serverApi(at('eligibility', { eligibility: { running: false } }));
    const store = setUp(api);
    await store.restored;
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.statusReads).toBe(0);
    expect(store.identity()).toBeNull();
  });

  it('polls while the QR code is shown, so the computer notices the phone', async () => {
    const link = { token: 't', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString() };
    const api = serverApi(at('eligibility', { eligibility: { running: false }, phoneLink: link }));
    const store = setUp(api);
    await store.restored;
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(api.statusReads).toBe(2);
    // The phone started the check: the computer follows it and does not finish it itself.
    api.current = { stage: 'eligibility', changedAt: 't2' };
    api.next = at('eligibility', { eligibility: { running: true, via: 'phone', startedAt: new Date(Date.now() - 60_000).toISOString() } });
    await vi.advanceTimersByTimeAsync(2_000);
    TestBed.tick();
    expect(store.app()!.eligibility!.via).toBe('phone');
    expect(store.identity()!.p).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    TestBed.tick();
    expect(api.calls).not.toContain('completeIdentity');
  });

  it('reports the end of the camera animation on this computer once, then waits for the server', async () => {
    const startedAt = new Date().toISOString();
    const api = serverApi(at('eligibility', { eligibility: { running: true, startedAt } }));
    const store = setUp(api);
    await store.restored;
    TestBed.tick();
    expect(store.identity()!.p).toBeLessThan(1);
    await vi.advanceTimersByTimeAsync(7_000);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(5_000);
    TestBed.tick();
    expect(api.calls.filter((c) => c === 'completeIdentity')).toHaveLength(1);
    // Still running on the server: polled until the Worker decides.
    expect(api.statusReads).toBeGreaterThan(2);
    api.current = { stage: 'declaration', changedAt: 't2' };
    api.next = at('declaration', { eligibility: { running: false } });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(store.stage()).toBe('declaration');
  });

  it('a failed check: no camera, nothing polled, the error on the application', async () => {
    const api = serverApi(at('eligibility', { eligibility: { running: false, identityError: 'identity_failed', consentAt: 'x' } }));
    const store = setUp(api);
    await store.restored;
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.identity()).toBeNull();
    expect(store.app()!.eligibility!.identityError).toBe('identity_failed');
    expect(api.statusReads).toBe(0);
  });

  it('polls under manual review at the slow pace, and moves on when staff approve', async () => {
    const api = serverApi(at('manual'));
    const store = setUp(api);
    await store.restored;
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const reads = api.statusReads;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.statusReads - reads).toBe(4);
    api.current = { stage: 'payment', changedAt: 't2' };
    api.next = at('payment');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(store.stage()).toBe('payment');
  });

  it('shows the closed state when the application disappears under review, and creates nothing', async () => {
    const api = serverApi(at('manual'));
    let restores = 0;
    api.restore = async () => (restores++, { account: ACCOUNT, app: at('manual') });
    const store = setUp(api);
    await store.restored;
    TestBed.tick();
    api.fail = new ApiError('Başvuru bulunamadı.', { code: 'no_application', status: 404 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.stage()).toBe('closed');
    expect(store.app()).toBeNull();
    expect(store.signedIn()).toBe(true);
    TestBed.tick();
    const reads = api.statusReads;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.statusReads).toBe(reads);
    // Nothing read the session again (the HTTP client creates an application only at a sign-in).
    expect(restores).toBe(1);
    await store.logout();
    expect(store.closed()).toBe(false);
  });

  it('opens on the closed state after a reload that found no application', async () => {
    const api = serverApi(null, { restore: async () => ({ account: ACCOUNT, app: null, closed: true }) });
    const store = setUp(api);
    await store.restored;
    expect(store.stage()).toBe('closed');
    expect(store.resumeRoute()).toBe('/application-closed');
  });

  it('the phone page asks for its link no faster than every 5 s, and stops once the state is final', async () => {
    const api = serverApi(null, { restore: async () => null });
    const store = setUp(api);
    await store.restored;
    await store.openPhoneLink('secret');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(60_000);
    const statusCalls = () => api.calls.filter((c) => c.startsWith('phoneLinkStatus')).length;
    // One at opening, then one every 6 s: 11 in the first minute, under the API's 20 a minute.
    expect(statusCalls()).toBe(11);
    api.phone = { state: 'done' };
    await vi.advanceTimersByTimeAsync(6_000);
    TestBed.tick();
    const final = statusCalls();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(statusCalls()).toBe(final);
    expect(store.phone()).toEqual({ state: 'done' });
  });

  it('the phone page reports the end of its animation once', async () => {
    const api = serverApi(null, { restore: async () => null });
    api.phone = { state: 'running', startedAt: new Date().toISOString() };
    const store = setUp(api);
    await store.restored;
    await store.openPhoneLink('secret');
    TestBed.tick();
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(1_000);
      TestBed.tick();
    }
    expect(api.calls.filter((c) => c === 'completeIdentityByPhone')).toHaveLength(1);
  });
});

describe('ApplicationStore second factor (step-up)', () => {
  const stepUpRequired = () => new ApiError('Bu işlem için e-posta adresinize gönderilen kodu girmeniz gerekir.', { code: 'step_up_required', status: 403 });
  const wrongCode = () =>
    new ApiError('Kod hatalı veya süresi dolmuş.', { code: 'validation_failed', status: 400, fields: { code: ['Kod hatalı veya süresi dolmuş.'] } });
  const AT_PAYMENT = { ...SESSION.app!, stage: 'payment' } as Application;
  const AT_3DS = { ...SESSION.app!, stage: 'threeDs' } as Application;
  const CARD = { holder: 'AYŞE KAYA', number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' };

  function setUp(calls: Partial<Record<keyof Api, unknown>>) {
    localStorage.clear();
    const api = fakeApi({ restore: async () => ({ account: ACCOUNT, app: AT_PAYMENT }), ...calls });
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }]), { provide: Api, useValue: api }] });
    return TestBed.inject(ApplicationStore);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refused: asks for the code once, and after a good code repeats the action exactly once by itself', async () => {
    const pay = vi.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce(AT_3DS);
    const send = vi.fn(async () => undefined);
    const verify = vi.fn(async () => undefined);
    const store = setUp({ pay, sendStepUpCode: send, verifyStepUpCode: verify });
    await store.restored;

    const result = store.pay(CARD);
    await vi.advanceTimersByTimeAsync(0);
    expect(pay).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.stepUp()).toEqual({ sentAt: Date.now(), working: false, error: null });
    expect(store.busy()).toBe(true);
    expect(store.error()).toBeNull();

    await store.verifyStepUpCode('482913');
    expect(await result).toBe(true);
    expect(verify).toHaveBeenCalledExactlyOnceWith('482913');
    expect(pay).toHaveBeenCalledTimes(2);
    expect(pay).toHaveBeenLastCalledWith(CARD);
    expect(store.stepUp()).toBeNull();
    expect(store.stage()).toBe('threeDs');
    expect(store.error()).toBeNull();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(pay).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('closing the dialog ends the action with a plain message, and nothing else is sent', async () => {
    const pay = vi.fn().mockRejectedValue(stepUpRequired());
    const send = vi.fn(async () => undefined);
    const verify = vi.fn(async () => undefined);
    const store = setUp({ pay, sendStepUpCode: send, verifyStepUpCode: verify });
    await store.restored;

    const result = store.pay(CARD);
    await vi.advanceTimersByTimeAsync(0);
    store.cancelStepUp();
    expect(await result).toBe(false);
    expect(store.error()).toBe(STEP_UP_CANCELLED);
    expect(store.stepUp()).toBeNull();
    expect(store.busy()).toBe(false);
    expect(store.stage()).toBe('payment');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(pay).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();
  });

  it('a wrong code: the server\'s sentence in the dialog, the action waits; the right code then goes through', async () => {
    const pay = vi.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce(AT_3DS);
    const verify = vi.fn().mockRejectedValueOnce(wrongCode()).mockResolvedValueOnce(undefined);
    const store = setUp({ pay, sendStepUpCode: async () => undefined, verifyStepUpCode: verify });
    await store.restored;

    const result = store.pay(CARD);
    await vi.advanceTimersByTimeAsync(0);
    await store.verifyStepUpCode('000000');
    expect(store.stepUp()).toMatchObject({ working: false, error: 'Kod hatalı veya süresi dolmuş.' });
    expect(pay).toHaveBeenCalledTimes(1);

    await store.verifyStepUpCode('12345');
    expect(store.stepUp()!.error).toBe('Altı haneli kodu yazınız.');
    expect(verify).toHaveBeenCalledTimes(1);

    await store.verifyStepUpCode('482913');
    expect(await result).toBe(true);
    expect(pay).toHaveBeenCalledTimes(2);
  });

  it('a second refusal after the retry is shown, not asked again: no loop', async () => {
    const pay = vi.fn().mockRejectedValue(stepUpRequired());
    const send = vi.fn(async () => undefined);
    const store = setUp({ pay, sendStepUpCode: send, verifyStepUpCode: async () => undefined });
    await store.restored;

    const result = store.pay(CARD);
    await vi.advanceTimersByTimeAsync(0);
    await store.verifyStepUpCode('482913');
    expect(await result).toBe(false);
    expect(pay).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.stepUp()).toBeNull();
    expect(store.error()).toBe('Bu işlem için e-posta adresinize gönderilen kodu girmeniz gerekir.');
  });

  it('another code only after 60 s; no e-mail address and too many tries shown as worded', async () => {
    const noEmail = new ApiError('Hesabınızda kayıtlı bir e-posta adresi yok.', { code: 'no_email', status: 409 });
    const tooMany = new ApiError('Çok fazla deneme yapıldı. Lütfen bir dakika sonra yeniden deneyiniz.', { code: 'http_429', status: 429 });
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(tooMany).mockRejectedValueOnce(noEmail);
    const store = setUp({ pay: vi.fn().mockRejectedValue(stepUpRequired()), sendStepUpCode: send, verifyStepUpCode: async () => undefined });
    await store.restored;

    void store.pay(CARD);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    await store.sendStepUpCode();
    await vi.advanceTimersByTimeAsync(59_000);
    await store.sendStepUpCode();
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await store.sendStepUpCode();
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.stepUp()!.error).toBe('Çok fazla deneme yapıldı. Lütfen bir dakika sonra yeniden deneyiniz.');
    // A failed send does not restart the wait: the last code was sent over a minute ago.
    await store.sendStepUpCode();
    expect(send).toHaveBeenCalledTimes(3);
    expect(store.stepUp()!.error).toBe('Hesabınızda kayıtlı bir e-posta adresi yok.');
    store.cancelStepUp();
  });

  it('two actions refused at once share one dialog and one code', async () => {
    const send = vi.fn(async () => undefined);
    const cancel3ds = vi.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce(AT_PAYMENT);
    const pay = vi.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce(AT_3DS);
    const store = setUp({ pay, cancel3ds, sendStepUpCode: send, verifyStepUpCode: async () => undefined });
    await store.restored;
    const first = store.pay(CARD);
    const second = store.cancel3ds();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    await store.verifyStepUpCode('482913');
    expect([await first, await second]).toEqual([true, true]);
    expect(pay).toHaveBeenCalledTimes(2);
    expect(cancel3ds).toHaveBeenCalledTimes(2);
  });

  it('a lost session closes the dialog and signs out', async () => {
    const store = setUp({
      pay: vi.fn().mockRejectedValue(stepUpRequired()),
      sendStepUpCode: async () => undefined,
      verifyStepUpCode: () => Promise.reject(unauthenticated()),
    });
    await store.restored;
    const result = store.pay(CARD);
    await vi.advanceTimersByTimeAsync(0);
    await store.verifyStepUpCode('482913');
    expect(await result).toBe(false);
    expect(store.stepUp()).toBeNull();
    expect(store.signedIn()).toBe(false);
  });
});

describe('ApplicationStore in steps 4 and 5 (HTTP mode)', () => {
  const base = { ...SESSION.app!, founderType: 'foreign', founder: { firstName: 'Ayşe', lastName: 'Kaya', nationality: '', passportNo: '' }, logs: [], docs: [] } as unknown as Application;
  const at = (stage: Application['stage'], extra: Partial<Application> = {}) => ({ ...base, stage, ...extra }) as Application;
  const stepUpRequired = () => new ApiError('Bu işlem için e-posta adresinize gönderilen kodu girmeniz gerekir.', { code: 'step_up_required', status: 403 });

  /** An Api stand-in in server mode: `current` is what the status read answers, `next` what the full read and the writes answer. */
  function serverApi(start: Application, extra: Partial<Record<keyof Api, unknown>> = {}) {
    const api = {
      demo: null,
      statusReads: 0,
      fullReads: 0,
      current: { stage: start.stage, changedAt: 't1' } as ApplicationStatus,
      next: start,
      calls: [] as string[],
      work: {
        kind: 'server' as const,
        status: async () => {
          api.statusReads++;
          return api.current;
        },
        application: async () => {
          api.fullReads++;
          return api.next;
        },
        seen: () => ({ stage: start.stage, changedAt: 't1' }),
      },
      restore: async () => ({ account: ACCOUNT, app: start }),
      completeCall: async () => {
        api.calls.push('completeCall');
        return api.next;
      },
      ...extra,
    };
    return api;
  }

  function setUp(api: ReturnType<typeof serverApi>, account: Account = ACCOUNT) {
    localStorage.clear();
    api.restore = async () => ({ account, app: api.next });
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }]), { provide: Api, useValue: api }] });
    return TestBed.inject(ApplicationStore);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('the scripted call: nothing polled while it runs, reported ended once, then the certificate polled for', async () => {
    const startedAt = new Date().toISOString();
    const api = serverApi(at('calling', { call: { startedAt } }));
    const store = setUp(api);
    await store.restored;
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(10_000);
    TestBed.tick();
    expect(api.statusReads).toBe(0);
    expect(api.calls).toEqual([]);
    // The script (20 s) ends: the server is told once; the answer says the certificate is being issued.
    api.next = at('calling', { call: { startedAt, completed: true } });
    await vi.advanceTimersByTimeAsync(11_000);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(5_000);
    TestBed.tick();
    expect(api.calls).toEqual(['completeCall']);
    expect(api.statusReads).toBeGreaterThan(0);
    api.current = { stage: 'signed', changedAt: 't2' };
    api.next = at('signed', { signature: { method: 'eshs', serial: 'S', holder: 'Ayşe Kaya', issuedAt: startedAt, validUntil: new Date(Date.now() + 86_400_000).toISOString() } });
    await vi.advanceTimersByTimeAsync(5_000);
    TestBed.tick();
    expect(store.stage()).toBe('signed');
    const reads = api.statusReads;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.statusReads).toBe(reads);
    expect(api.calls).toEqual(['completeCall']);
  });

  it('a resident at calling waits for the provider: polled, and on to the signed screen', async () => {
    const api = serverApi(at('calling', { founderType: 'resident' }));
    const store = setUp(api, { ...ACCOUNT, founderType: 'resident' });
    await store.restored;
    TestBed.tick();
    expect(store.resumeRoute()).toBe('/e-signature/turkish-citizen');
    await vi.advanceTimersByTimeAsync(4_000);
    expect(api.statusReads).toBe(2);
    expect(api.calls).toEqual([]);
    api.current = { stage: 'signed', changedAt: 't2' };
    api.next = at('signed', { founderType: 'resident' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.stage()).toBe('signed');
  });

  it('the three protected actions go through the second-factor dialog and are repeated once', async () => {
    const startCall = vi.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce(at('calling', { call: { startedAt: new Date().toISOString() } }));
    const signResident = vi.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce(at('calling', { founderType: 'resident' }));
    const startSetup = vi.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce(at('setup'));
    const send = vi.fn(async () => undefined);
    const api = serverApi(at('signing'), { startCall, signResident, startSetup, sendStepUpCode: send, verifyStepUpCode: async () => undefined });
    const store = setUp(api);
    await store.restored;
    for (const [action, fn] of [[() => store.startCall(), startCall], [() => store.signResident('existing'), signResident], [() => store.startSetup(true), startSetup]] as const) {
      const result = action();
      await vi.advanceTimersByTimeAsync(0);
      expect(store.stepUp()).not.toBeNull();
      await store.verifyStepUpCode('482913');
      expect(await result).toBe(true);
      expect(fn).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(61_000);
    }
    expect(signResident).toHaveBeenLastCalledWith('existing');
    expect(startSetup).toHaveBeenLastCalledWith(true);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('an expired certificate: the set-up refusal re-reads the application, which is back at signing', async () => {
    const validUntil = new Date(Date.now() + 3_600_000).toISOString();
    const refused = new ApiError('Geçerli bir e-imzanız yok. Lütfen e-imza adımını yeniden yapınız.', { code: 'no_valid_signature', status: 409 });
    const api = serverApi(at('signed', { signature: { method: 'eshs', serial: 'S', holder: 'Ayşe Kaya', issuedAt: validUntil, validUntil } }), { startSetup: () => Promise.reject(refused) });
    const store = setUp(api);
    await store.restored;
    api.next = at('signing', { signature: { ...store.app()!.signature! } });
    expect(await store.startSetup(true)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.error()).toBe('Geçerli bir e-imzanız yok. Lütfen e-imza adımını yeniden yapınız.');
    expect(api.fullReads).toBe(1);
    expect(store.stage()).toBe('signing');
  });

  it('on the signed screen the application is read once when the certificate runs out', async () => {
    const validUntil = new Date(Date.now() + 10_000).toISOString();
    const api = serverApi(at('signed', { signature: { method: 'eshs', serial: 'S', holder: 'Ayşe Kaya', issuedAt: validUntil, validUntil } }));
    const store = setUp(api);
    await store.restored;
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(5_000);
    TestBed.tick();
    expect(api.fullReads).toBe(0);
    api.next = at('signing', { signature: store.app()!.signature });
    await vi.advanceTimersByTimeAsync(6_000);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.fullReads).toBe(1);
    expect(store.stage()).toBe('signing');
    await vi.advanceTimersByTimeAsync(60_000);
    TestBed.tick();
    expect(api.fullReads).toBe(1);
    expect(api.statusReads).toBe(0);
  });

  it('the set-up is polled, settles at the slow pace, and nothing is polled once it is done', async () => {
    const api = serverApi(at('setup', { setup: { startedAt: 'x', steps: null } }));
    const store = setUp(api);
    await store.restored;
    TestBed.tick();
    expect(store.setup()).toBeNull();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const reads = api.statusReads;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.statusReads - reads).toBe(4);
    expect(api.fullReads).toBe(0);
    api.current = { stage: 'done', changedAt: 't2' };
    api.next = at('done', { setup: { startedAt: 'x', steps: [] } });
    await vi.advanceTimersByTimeAsync(15_000);
    TestBed.tick();
    expect(store.stage()).toBe('done');
    const after = api.statusReads;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(api.statusReads).toBe(after);
  });
});
