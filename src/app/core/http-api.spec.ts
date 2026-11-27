import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ApiError } from './api-error';
import { HttpApi, markApiWrites } from './http-api';
import { callStartedAt } from './api-mapper';
import { ApplicationWire, MeWire } from './api-types';
import { Application } from './models';
import { CAPTURED, IDENTITY_FAILED, ME, NEW_APPLICATION, NO_VALID_SIGNATURE } from './testing/api-fixtures';

describe('HttpApi', () => {
  let api: HttpApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([markApiWrites])), provideHttpClientTesting()],
    });
    api = TestBed.inject(HttpApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** Calls the private request helper and returns what it rejected with. */
  async function failure(respond: (req: ReturnType<HttpTestingController['expectOne']>) => void): Promise<ApiError> {
    const pending = api['request']('POST', '/api/test', { a: 1 });
    respond(backend.expectOne('/api/test'));
    const error = await pending.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }

  it('has no demo tools and rejects a call that is not connected yet', async () => {
    expect(api.demo).toBeNull();
    const error = await api.ask().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Bu işlem henüz sunucuya bağlanmadı.');
    expect((error as ApiError).code).toBe('not_connected');
  });

  it('returns the body of a successful response', async () => {
    const pending = api['request']<{ ok: boolean }>('GET', '/api/ping');
    backend.expectOne('/api/ping').flush({ ok: true });
    expect(await pending).toEqual({ ok: true });
  });

  it('turns a validation problem into an ApiError with its fields', async () => {
    const error = await failure((req) =>
      req.flush(
        {
          type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
          title: 'Gönderdiğiniz bilgiler eksik veya hatalıdır.',
          status: 400,
          code: 'validation_failed',
          requestId: '0HN-test',
          errors: { email: ['E-posta adresi geçerli değildir.'] },
        },
        { status: 400, statusText: 'Bad Request', headers: { 'Content-Type': 'application/problem+json' } },
      ),
    );
    expect(error.message).toBe('Gönderdiğiniz bilgiler eksik veya hatalıdır.');
    expect(error.code).toBe('validation_failed');
    expect(error.status).toBe(400);
    expect(error.fields).toEqual({ email: ['E-posta adresi geçerli değildir.'] });
  });

  it('keeps the title and code of a 401', async () => {
    const error = await failure((req) =>
      req.flush(
        { title: 'Oturumunuz sona ermiştir. Lütfen yeniden giriş yapınız.', status: 401, code: 'unauthenticated', requestId: 'r1' },
        { status: 401, statusText: 'Unauthorized' },
      ),
    );
    expect(error.message).toBe('Oturumunuz sona ermiştir. Lütfen yeniden giriş yapınız.');
    expect(error.code).toBe('unauthenticated');
    expect(error.status).toBe(401);
    expect(error.fields).toBeUndefined();
  });

  it('falls back to a general message for a body that is not a problem (502 from the proxy)', async () => {
    const error = await failure((req) => req.flush('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    expect(error.message).toBe('Beklenmeyen bir hata oluştu.');
    expect(error.code).toBeUndefined();
    expect(error.status).toBe(502);
  });

  it('falls back to a general message when the network fails', async () => {
    const error = await failure((req) => req.error(new ProgressEvent('error')));
    expect(error.message).toBe('Beklenmeyen bir hata oluştu.');
    expect(error.status).toBeUndefined();
  });
});

describe('HttpApi sign-in', () => {
  let api: HttpApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([markApiWrites])), provideHttpClientTesting()],
    });
    api = TestBed.inject(HttpApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** Lets the awaited request before this one finish, then takes the next one, which must be `method url`. */
  async function next(method: string, url: string) {
    await new Promise((resolve) => setTimeout(resolve));
    const req = backend.expectOne(url);
    expect(req.request.method).toBe(method);
    return req;
  }

  const problem = (status: number, code: string, title: string, errors?: Record<string, string[]>) =>
    [{ title, status, code, requestId: 'r1', ...(errors ? { errors } : {}) }, { status, statusText: 'x' }] as const;

  /** A full read of the application: the status read first (what is then "seen"), then the application. */
  async function answerRead(view: ApplicationWire = NEW_APPLICATION, changedAt = '2026-11-25T09:41:12.408113+00:00') {
    (await next('GET', '/api/application/status')).flush({ stage: view.stage, changedAt });
    (await next('GET', '/api/application')).flush(view);
  }

  /** The reads every sign-in ends with, when the application already exists. */
  async function answerSession(view: ApplicationWire = NEW_APPLICATION) {
    (await next('GET', '/api/me')).flush(ME);
    await answerRead(view);
  }

  it('registers with the typed data and the anti-forgery header, and expects nothing back', async () => {
    const input = { firstName: 'Ayşe', lastName: 'Kaya', email: 'ayse@example.test', password: 'Nova-Lab-2026!' };
    const pending = api.register(input);
    const req = await next('POST', '/api/auth/register');
    expect(req.request.body).toEqual(input);
    expect(req.request.headers.get('X-DSP-Request')).toBe('1');
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await expect(pending).resolves.toBeUndefined();
  });

  it('asks for a new code', async () => {
    const pending = api.resendEmailCode('ayse@example.test');
    const req = await next('POST', '/api/auth/resend-code');
    expect(req.request.body).toEqual({ email: 'ayse@example.test' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await pending;
  });

  it('verifies the code, then reads the founder and creates the application the API does not have yet', async () => {
    const pending = api.verifyEmail('ayse@example.test', '424346');
    const verify = await next('POST', '/api/auth/verify-email');
    expect(verify.request.body).toEqual({ email: 'ayse@example.test', code: '424346' });
    verify.flush(null, { status: 204, statusText: 'No Content' });
    (await next('GET', '/api/me')).flush(ME);
    // The status read answers like the full read: 404 until the application exists.
    (await next('GET', '/api/application/status')).flush(...problem(404, 'no_application', 'Başvuru bulunamadı.'));
    const create = await next('POST', '/api/application');
    expect(create.request.body).toBeNull();
    expect(create.request.headers.get('X-DSP-Request')).toBe('1');
    create.flush(null, { status: 204, statusText: 'No Content' });
    await answerRead();
    const session = await pending;
    expect(session.account).toEqual({ email: 'ayse@example.test', firstName: 'Ayşe', lastName: 'Kaya', founderType: 'foreign', verified: true });
    expect(session.app!.id).toBe('DS-26-03403699');
    expect(session.app!.stage).toBe('profile');
  });

  it('shows the code field\'s own sentence for a wrong code', async () => {
    const pending = api.verifyEmail('ayse@example.test', '000000').catch((e: unknown) => e);
    (await next('POST', '/api/auth/verify-email')).flush(
      ...problem(400, 'validation_failed', 'Gönderdiğiniz bilgiler eksik veya hatalıdır.', { code: ['Kod hatalı veya süresi dolmuş. Yeni kod isteyiniz.'] }),
    );
    const error = (await pending) as ApiError;
    expect(error.code).toBe('validation_failed');
    expect(error.fields).toEqual({ code: ['Kod hatalı veya süresi dolmuş. Yeni kod isteyiniz.'] });
  });

  it('signs in with e-mail and password and reads the existing application', async () => {
    const pending = api.login('ayse@example.test', 'Nova-Lab-2026!');
    const req = await next('POST', '/api/auth/login');
    expect(req.request.body).toEqual({ email: 'ayse@example.test', password: 'Nova-Lab-2026!' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await answerSession();
    expect((await pending).app!.id).toBe('DS-26-03403699');
  });

  it('passes on email_not_verified with the server\'s sentence and reads nothing else', async () => {
    const pending = api.login('ayse@example.test', 'Nova-Lab-2026!').catch((e: unknown) => e);
    (await next('POST', '/api/auth/login')).flush(
      ...problem(403, 'email_not_verified', 'E-posta adresiniz henüz doğrulanmadı. Size yeni bir kod gönderdik.'),
    );
    const error = (await pending) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('email_not_verified');
    expect(error.message).toBe('E-posta adresiniz henüz doğrulanmadı. Size yeni bir kod gönderdik.');
    await new Promise((resolve) => setTimeout(resolve));
    backend.expectNone('/api/me');
  });

  it('replaces the rate limiter\'s title with a sentence that says what to do', async () => {
    const pending = api.login('ayse@example.test', 'x').catch((e: unknown) => e);
    (await next('POST', '/api/auth/login')).flush(...problem(429, 'http_429', 'İstek karşılanamadı.'));
    const error = (await pending) as ApiError;
    expect(error.message).toBe('Çok fazla deneme yapıldı. Lütfen bir dakika sonra yeniden deneyiniz.');
    expect(error.code).toBe('http_429');
    expect(error.status).toBe(429);
  });

  it('signs out', async () => {
    const pending = api.logout();
    const req = await next('POST', '/api/auth/logout');
    expect(req.request.headers.get('X-DSP-Request')).toBe('1');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await pending;
  });

  it('asks for a reset link and sets the new password with the link\'s token', async () => {
    const asked = api.requestPasswordReset('ayse@example.test');
    const ask = await next('POST', '/api/auth/password-reset');
    expect(ask.request.body).toEqual({ email: 'ayse@example.test' });
    ask.flush(null, { status: 202, statusText: 'Accepted' });
    await asked;

    const set = api.confirmPasswordReset('0193abcd.token', 'Yeni-Sifre-2026!');
    const confirm = await next('POST', '/api/auth/password-reset/confirm');
    expect(confirm.request.body).toEqual({ token: '0193abcd.token', password: 'Yeni-Sifre-2026!' });
    confirm.flush(null, { status: 204, statusText: 'No Content' });
    await set;
    // Setting the password does not sign in: nothing is read afterwards.
    await new Promise((resolve) => setTimeout(resolve));
    backend.expectNone('/api/me');
  });

  it('refuses an old reset link with the server\'s sentence', async () => {
    const set = api.confirmPasswordReset('old', 'Yeni-Sifre-2026!').catch((e: unknown) => e);
    (await next('POST', '/api/auth/password-reset/confirm')).flush(
      ...problem(422, 'link_invalid', 'Bağlantı geçersiz veya süresi dolmuş. Yeniden şifre sıfırlama isteyiniz.'),
    );
    expect(((await set) as ApiError).message).toBe('Bağlantı geçersiz veya süresi dolmuş. Yeniden şifre sıfırlama isteyiniz.');
  });

  it('plays the e-Devlet return trip with the state from the start answer', async () => {
    const pending = api.edevlet('10000000146');
    (await next('GET', '/api/auth/edevlet/start')).flush({ redirectUrl: '/edevlet-test?state=s7a7e%2Bx' });
    const signIn = await next('POST', '/api/auth/edevlet');
    expect(signIn.request.body).toEqual({ code: '10000000146', state: 's7a7e+x' });
    signIn.flush(null, { status: 204, statusText: 'No Content' });
    (await next('GET', '/api/me')).flush({ ...ME, founderType: 'resident' });
    await answerRead({ ...NEW_APPLICATION, founderType: 'resident' });
    const session = await pending;
    expect(session.account.founderType).toBe('resident');
    expect(session.app!.founderType).toBe('resident');
  });

  it('restores the session the cookie still holds', async () => {
    const pending = api.restore();
    await answerSession();
    expect((await pending)!.account.email).toBe('ayse@example.test');
  });

  it('restores nothing when the server answers 401', async () => {
    const pending = api.restore();
    (await next('GET', '/api/me')).flush(...problem(401, 'unauthenticated', 'Oturumunuz bulunamadı.'));
    expect(await pending).toBeNull();
  });

  it('does not hide other failures of the restore', async () => {
    const pending = api.restore().catch((e: unknown) => e);
    (await next('GET', '/api/me')).flush('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' });
    expect(((await pending) as ApiError).status).toBe(502);
  });
});

describe('markApiWrites', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([markApiWrites])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  function headerOf(method: string, url: string) {
    void firstValueFrom(http.request(method, url, { body: {} })).catch(() => undefined);
    const req = backend.expectOne(url);
    const value = req.request.headers.get('X-DSP-Request');
    req.flush({});
    return value;
  }

  it('marks writes to the API', () => {
    expect(headerOf('POST', '/api/auth/login')).toBe('1');
    expect(headerOf('PUT', '/api/x')).toBe('1');
    expect(headerOf('PATCH', '/api/x')).toBe('1');
    expect(headerOf('DELETE', '/api/x')).toBe('1');
  });

  it('leaves reads and other URLs alone', () => {
    expect(headerOf('GET', '/api/me')).toBeNull();
    expect(headerOf('HEAD', '/api/me')).toBeNull();
    expect(headerOf('OPTIONS', '/api/me')).toBeNull();
    expect(headerOf('POST', '/assets/x.json')).toBeNull();
  });
});

describe('HttpApi step 1', () => {
  let api: HttpApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([markApiWrites])), provideHttpClientTesting()],
    });
    api = TestBed.inject(HttpApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function next(method: string, url: string) {
    await new Promise((resolve) => setTimeout(resolve));
    const req = backend.expectOne(url);
    expect(req.request.method).toBe(method);
    return req;
  }

  async function read(view: ApplicationWire, changedAt = 't1') {
    (await next('GET', '/api/application/status')).flush({ stage: view.stage, changedAt });
    (await next('GET', '/api/application')).flush(view);
  }

  /** Signs in (restore) at the given application, so the API object knows the founder and the review. */
  async function signedInAt(view: ApplicationWire) {
    const pending = api.restore();
    (await next('GET', '/api/me')).flush({ ...ME, firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test' });
    await read(view);
    await pending;
  }

  const empty = (status: number) => [null, { status, statusText: 'x' }] as const;

  it('saves the profile with exactly its six fields and reads the application again', async () => {
    await signedInAt(CAPTURED.profile);
    const pending = api.submitProfile({ brand: 'Lumora', sector: 'software', funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya' });
    const put = await next('PUT', '/api/application/profile');
    expect(put.request.body).toEqual({ brand: 'Lumora', sector: 'software', funding: 'own-abroad', nationality: 'Almanya', phone: '+49 151 2345 6700', country: 'Almanya' });
    put.flush(...empty(204));
    await read(CAPTURED.verified);
    expect((await pending).stage).toBe('verified');
  });

  it('uploads the deck, the CV and the answers as multipart, multiple choices as repeated fields, without setting the Content-Type itself', async () => {
    await signedInAt(CAPTURED.verified);
    const deck = new File(['%PDF-1.4'], 'Lumora Sunum.pdf', { type: 'application/pdf' });
    const cv = new File(['%PDF-1.4'], 'Ozgecmis.pdf', { type: 'application/pdf' });
    const answers = { summary: 'Özet', activityGroupId: 1, activityId: 3, businessModelIds: [1, 2], revenueModelIds: [7], productTypeIds: [2, 3] };
    const pending = api.uploadDeck({ deck, cv }, answers, { noticeAcknowledged: true, aiConsent: false });
    const post = await next('POST', '/api/application/deck');
    const body = post.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe('Lumora Sunum.pdf');
    expect((body.get('cv') as File).name).toBe('Ozgecmis.pdf');
    expect(body.get('summary')).toBe('Özet');
    expect(body.get('activityGroupId')).toBe('1');
    expect(body.get('activityId')).toBe('3');
    expect(body.getAll('businessModelIds')).toEqual(['1', '2']);
    expect(body.getAll('revenueModelIds')).toEqual(['7']);
    expect(body.getAll('productTypeIds')).toEqual(['2', '3']);
    expect(body.get('noticeAcknowledged')).toBe('true');
    expect(body.get('aiConsent')).toBe('false');
    expect(post.request.headers.has('Content-Type')).toBe(false);
    expect(post.request.headers.get('X-DSP-Request')).toBe('1');
    post.flush(...empty(202));
    await read(CAPTURED.evaluating);
    expect((await pending).stage).toBe('evaluating');
  });

  it('passes on a refused upload with its fields', async () => {
    await signedInAt(CAPTURED.verified);
    const f = new File(['x'], 'a.pdf');
    const refused = api.uploadDeck({ deck: f, cv: f }, { summary: '', activityGroupId: null, activityId: null, businessModelIds: [], revenueModelIds: [], productTypeIds: [] }, { noticeAcknowledged: true, aiConsent: true }).catch((e: unknown) => e);
    (await next('POST', '/api/application/deck')).flush(
      { title: 'Gönderdiğiniz bilgiler eksik veya hatalıdır.', status: 400, code: 'validation_failed', requestId: 'r', errors: { summary: ['Özet en az 50 karakter olmalıdır.'], cv: ['Özgeçmiş PDF biçiminde olmalıdır.'] } },
      { status: 400, statusText: 'x' },
    );
    expect(((await refused) as ApiError).fields).toEqual({ summary: ['Özet en az 50 karakter olmalıdır.'], cv: ['Özgeçmiş PDF biçiminde olmalıdır.'] });
  });

  it('sends only the review fields that changed, and nothing when none did', async () => {
    await signedInAt(CAPTURED.reviewDefaults);
    let pending = api.updateReview({ contact: { email: 'kurucu@example.test', phone: '+49 151 2345 6700', address: 'Torstraße 45, Berlin', postalCode: '10119', country: 'Almanya' } }, ['address']);
    const patch = await next('PATCH', '/api/application/review');
    expect(patch.request.body).toEqual({ fields: { residence_address: 'Torstraße 45, Berlin', postal_code: '10119' } });
    patch.flush(...empty(204));
    await read(CAPTURED.reviewEdited);
    await pending;

    pending = api.updateReview({ founder: { firstName: 'Deneme', lastName: 'Kurucu-Berg', nationality: 'Almanya' } }, ['name']);
    await read(CAPTURED.reviewEdited);
    await pending;
    backend.expectNone('/api/application/review');
  });

  it('submits the review and passes on a refusal with its fields', async () => {
    await signedInAt(CAPTURED.reviewEdited);
    const refused = api.submitReview().catch((e: unknown) => e);
    (await next('POST', '/api/application/review/submit')).flush(
      { title: 'Eksik bilgileri tamamlayınız.', status: 400, code: 'validation_failed', requestId: 'r', errors: { given_name: ['Ad eksik.'], nationality: ['Uyruk eksik.'] } },
      { status: 400, statusText: 'x' },
    );
    const error = (await refused) as ApiError;
    expect(error.message).toBe('Eksik bilgileri tamamlayınız.');
    expect(error.fields).toEqual({ given_name: ['Ad eksik.'], nationality: ['Uyruk eksik.'] });

    const pending = api.submitReview();
    (await next('POST', '/api/application/review/submit')).flush(...empty(202));
    await read(CAPTURED.titleChecking);
    expect((await pending).stage).toBe('titleChecking');
  });

  it('asks for another title after a refusal', async () => {
    await signedInAt(CAPTURED.titleConflict);
    const pending = api.chooseTitle(' Lumora Analitik Yazılım ');
    const post = await next('POST', '/api/application/title');
    expect(post.request.body).toEqual({ title: 'Lumora Analitik Yazılım' });
    post.flush(...empty(202));
    await read(CAPTURED.titleCheckingAgain);
    expect((await pending).titleCheck).toEqual({ status: 'checking', candidate: 'Lumora Analitik Yazılım' });
  });

  it('reads the follow-up questions and sends the answers, trimmed, null where there is no explanation', async () => {
    await signedInAt(CAPTURED.evaluationQuestions);
    // The shape of the API's EvaluationQuestionsView (step 22); not a captured answer.
    const view = {
      answerable: true,
      receivedAt: '2026-11-27T08:27:39Z',
      cards: [{ id: 'B1', prompt: 'Soru?', options: [{ id: 'A', label: 'A', description: null, explanationRequired: true, explanationPrompt: 'Açıklayın.' }] }],
    };
    const reading = api.evaluationQuestions();
    (await next('GET', '/api/application/evaluation/questions')).flush(view);
    expect(await reading).toEqual(view);

    const pending = api.answerEvaluation([
      { targetFactId: 'B1', optionId: 'A', explanation: '  kendimiz yazdık  ' },
      { targetFactId: 'B2', optionId: 'UNABLE_TO_VERIFY', explanation: '   ' },
    ]);
    const post = await next('POST', '/api/application/evaluation/answers');
    expect(post.request.body).toEqual({
      answers: [
        { targetFactId: 'B1', optionId: 'A', explanation: 'kendimiz yazdık' },
        { targetFactId: 'B2', optionId: 'UNABLE_TO_VERIFY', explanation: null },
      ],
    });
    post.flush(...empty(202));
    await read(CAPTURED.evaluating);
    expect((await pending).stage).toBe('evaluating');
  });

  it('remembers the status read just before the full read, for the poller to compare', async () => {
    expect(api.work.kind).toBe('server');
    await signedInAt(CAPTURED.titleChecking);
    expect(api.work.kind === 'server' && api.work.seen()).toEqual({ stage: 'titleChecking', changedAt: 't1' });
    const status = api.work.kind === 'server' ? api.work.status() : null;
    (await next('GET', '/api/application/status')).flush({ stage: 'titleConflict', changedAt: 't2' });
    expect(await status).toEqual({ stage: 'titleConflict', changedAt: 't2' });
    // A status read alone does not change what was seen.
    expect(api.work.kind === 'server' && api.work.seen()).toEqual({ stage: 'titleChecking', changedAt: 't1' });
  });

  it('reads the reference data once per session', async () => {
    const first = api.reference();
    const second = api.reference();
    (await next('GET', '/api/reference/wizard')).flush(CAPTURED.reference);
    expect(await first).toEqual(CAPTURED.reference);
    expect(await second).toBe(await first);
    const out = api.logout();
    (await next('POST', '/api/auth/logout')).flush(...empty(204));
    await out;
    const again = api.reference();
    (await next('GET', '/api/reference/wizard')).flush(CAPTURED.reference);
    expect((await again).naceCodes).toHaveLength(10);
  });

  it('reads the evaluation reference once per session', async () => {
    const first = api.evaluationReference();
    const second = api.evaluationReference();
    (await next('GET', '/api/reference/evaluation')).flush(CAPTURED.referenceEvaluation);
    expect((await first).activities).toHaveLength(216);
    expect(await second).toBe(await first);
  });
});

describe('HttpApi step 2', () => {
  let api: HttpApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([markApiWrites])), provideHttpClientTesting()],
    });
    api = TestBed.inject(HttpApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function next(method: string, url: string) {
    await new Promise((resolve) => setTimeout(resolve));
    const req = backend.expectOne(url);
    expect(req.request.method).toBe(method);
    return req;
  }

  async function read(view: ApplicationWire, changedAt = 't1') {
    (await next('GET', '/api/application/status')).flush({ stage: view.stage, changedAt });
    (await next('GET', '/api/application')).flush(view);
  }

  async function signedInAt(view: ApplicationWire) {
    const pending = api.restore();
    (await next('GET', '/api/me')).flush({ ...ME, firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test' });
    await read(view);
    await pending;
  }

  const empty = (status: number) => [null, { status, statusText: 'x' }] as const;

  it('starts the check with the consent as ticked, completes it, and reads the application after each', async () => {
    await signedInAt(CAPTURED.titleReserved);
    let pending = api.startEligibility(true);
    const start = await next('POST', '/api/application/identity/start');
    expect(start.request.body).toEqual({ consent: true });
    expect(start.request.headers.get('X-DSP-Request')).toBe('1');
    start.flush(...empty(204));
    await read(CAPTURED.identityRunning);
    expect((await pending).eligibility!.running).toBe(true);

    pending = api.completeIdentity();
    const complete = await next('POST', '/api/application/identity/complete');
    expect(complete.request.body).toBeNull();
    complete.flush(...empty(202));
    await read(CAPTURED.declaration);
    expect((await pending).stage).toBe('declaration');
  });

  it('sends an unticked consent as false and passes on the refusal', async () => {
    await signedInAt(CAPTURED.titleReserved);
    const refused = api.startEligibility(false).catch((e: unknown) => e);
    const start = await next('POST', '/api/application/identity/start');
    expect(start.request.body).toEqual({ consent: false });
    start.flush({ title: 'x', status: 400, code: 'validation_failed', requestId: 'r', errors: { consent: ['Devam etmek için açık rıza metnini onaylayınız.'] } }, { status: 400, statusText: 'x' });
    expect(((await refused) as ApiError).fields).toEqual({ consent: ['Devam etmek için açık rıza metnini onaylayınız.'] });
  });

  it('starts again after a failed check', async () => {
    await signedInAt(IDENTITY_FAILED);
    const pending = api.startEligibility(true);
    (await next('POST', '/api/application/identity/start')).flush(...empty(204));
    await read(CAPTURED.identityRunning);
    expect((await pending).eligibility).toMatchObject({ running: true });
  });

  it('keeps the phone link token in memory only, on the application while the QR code is shown', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await signedInAt(CAPTURED.titleReserved);
    const pending = api.createPhoneLink();
    const post = await next('POST', '/api/application/phone-link');
    expect(post.request.headers.get('X-DSP-Request')).toBe('1');
    post.flush({ token: 'secret-token-1', expiresInSeconds: 600 });
    await read(CAPTURED.titleReserved);
    const app = await pending;
    expect(app.phoneLink!.token).toBe('secret-token-1');
    expect(Date.parse(app.phoneLink!.expiresAt) - Date.parse(app.phoneLink!.createdAt)).toBe(600_000);
    // Still there on the next read (the computer polls while the QR code is shown) ...
    const work = api.work.kind === 'server' ? api.work : null;
    let again = work!.application();
    await read(CAPTURED.titleReserved, 't2');
    expect((await again).phoneLink!.token).toBe('secret-token-1');
    // ... gone once the phone has started the check,
    again = work!.application();
    await read(CAPTURED.identityRunningPhone, 't3');
    const following = await again;
    expect(following.phoneLink).toBeUndefined();
    expect(following.eligibility).toMatchObject({ running: true, via: 'phone' });
    // and never written to the browser's storage.
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('forgets the token when the founder leaves the QR view', async () => {
    await signedInAt(CAPTURED.titleReserved);
    const pending = api.createPhoneLink();
    (await next('POST', '/api/application/phone-link')).flush({ token: 'secret-token-2', expiresInSeconds: 600 });
    await read(CAPTURED.titleReserved);
    await pending;
    expect(api.forgetPhoneLink()!.phoneLink).toBeUndefined();
  });

  it('calls the phone routes with the token in a header only, and the writes marked', async () => {
    let status = api.phoneLinkStatus('secret-token-3');
    let req = await next('GET', '/api/phone/status');
    expect(req.request.headers.get('X-DSP-Phone-Token')).toBe('secret-token-3');
    expect(req.request.urlWithParams).toBe('/api/phone/status');
    req.flush(CAPTURED.phoneReady);
    expect(await status).toEqual({ state: 'ready', expiresAt: CAPTURED.phoneReady.expiresAt });

    status = api.startEligibilityByPhone('secret-token-3', true);
    req = await next('POST', '/api/phone/start');
    expect(req.request.body).toEqual({ consent: true });
    expect(req.request.headers.get('X-DSP-Phone-Token')).toBe('secret-token-3');
    expect(req.request.headers.get('X-DSP-Request')).toBe('1');
    req.flush(...empty(204));
    (await next('GET', '/api/phone/status')).flush(CAPTURED.phoneRunning);
    expect(await status).toEqual({ state: 'running', startedAt: CAPTURED.phoneRunning.startedAt });

    status = api.completeIdentityByPhone('secret-token-3');
    req = await next('POST', '/api/phone/complete');
    expect(req.request.headers.get('X-DSP-Phone-Token')).toBe('secret-token-3');
    expect(req.request.headers.get('X-DSP-Request')).toBe('1');
    req.flush(...empty(202));
    (await next('GET', '/api/phone/status')).flush(CAPTURED.phoneDone);
    expect(await status).toEqual({ state: 'done' });

    status = api.phoneLinkStatus('unknown');
    (await next('GET', '/api/phone/status')).flush({ state: 'invalid', expiresAt: null, startedAt: null });
    expect(await status).toEqual({ state: 'invalid' });
  });

  it('sends the declaration as multipart with the real file and the tick as given', async () => {
    await signedInAt(CAPTURED.declaration);
    const file = new File(['%PDF-1.4'], 'fatura.pdf', { type: 'application/pdf' });
    const pending = api.submitDeclaration({ file, declared: true });
    const post = await next('POST', '/api/application/declaration');
    const body = post.request.body as FormData;
    expect((body.get('file') as File).name).toBe('fatura.pdf');
    expect((body.get('file') as File).size).toBe(file.size);
    expect(body.get('declared')).toBe('true');
    expect(post.request.headers.has('Content-Type')).toBe(false);
    post.flush(...empty(202));
    await read(CAPTURED.screening);
    expect((await pending).stage).toBe('screening');
  });

  it('shows the result once: "Ödemeye geç" sends nothing and moves on to the payment', async () => {
    await signedInAt(CAPTURED.eligible);
    const work = api.work.kind === 'server' ? api.work : null;
    let again = work!.application();
    await read(CAPTURED.eligible, 't2');
    expect((await again).stage).toBe('eligible');
    expect((await api.proceedToPayment()).stage).toBe('payment');
    backend.expectNone(() => true);
    again = work!.application();
    await read(CAPTURED.eligible, 't3');
    expect((await again).stage).toBe('payment');
  });

  it('refuses "go on" and "back to review" under manual review', async () => {
    await signedInAt(CAPTURED.manual);
    expect(((await api.proceedToPayment().catch((e: unknown) => e)) as ApiError).code).toBe('not_connected');
    expect(((await api.backToReview().catch((e: unknown) => e)) as ApiError).code).toBe('not_connected');
  });

  it('creates an application only at an explicit sign-in: a reload of a closed one reports it closed', async () => {
    const pending = api.restore();
    (await next('GET', '/api/me')).flush(ME);
    (await next('GET', '/api/application/status')).flush(CAPTURED.closed, { status: 404, statusText: 'Not Found' });
    expect(await pending).toEqual({ account: expect.objectContaining({ email: ME.email }), app: null, closed: true });
    backend.expectNone('/api/application');
  });

  it('passes on 404 no_application from a poll without creating anything', async () => {
    await signedInAt(CAPTURED.manual);
    const work = api.work.kind === 'server' ? api.work : null;
    const failed = work!.status().catch((e: unknown) => e);
    (await next('GET', '/api/application/status')).flush(CAPTURED.closed, { status: 404, statusText: 'Not Found' });
    expect(((await failed) as ApiError).code).toBe('no_application');
    backend.expectNone((r) => r.method === 'POST');
  });
});

describe('HttpApi second factor and step 3', () => {
  let api: HttpApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([markApiWrites])), provideHttpClientTesting()],
    });
    api = TestBed.inject(HttpApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function next(method: string, url: string) {
    await new Promise((resolve) => setTimeout(resolve));
    const req = backend.expectOne(url);
    expect(req.request.method).toBe(method);
    return req;
  }

  async function read(view: ApplicationWire, changedAt = 't1') {
    (await next('GET', '/api/application/status')).flush({ stage: view.stage, changedAt });
    (await next('GET', '/api/application')).flush(view);
  }

  async function signedInAt(view: ApplicationWire) {
    const pending = api.restore();
    (await next('GET', '/api/me')).flush({ ...ME, firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test' });
    await read(view);
    await pending;
  }

  const empty = (status: number) => [null, { status, statusText: 'x' }] as const;
  const problem = (p: { status: number }) => [p, { status: p.status, statusText: 'x' }] as const;
  const CARD = { holder: ' Deneme Kurucu ', number: '4242 4242 4242 4242', expiry: '12/30', cvv: '987' };

  it('asks for a step-up code with an empty body and sends the code in the body only', async () => {
    const send = api.sendStepUpCode();
    const post = await next('POST', '/api/auth/step-up');
    expect(post.request.body).toBeNull();
    expect(post.request.headers.get('X-DSP-Request')).toBe('1');
    post.flush(...empty(202));
    await send;

    const verify = api.verifyStepUpCode('482913');
    const check = await next('POST', '/api/auth/step-up/verify');
    expect(check.request.urlWithParams).toBe('/api/auth/step-up/verify');
    expect(check.request.body).toEqual({ code: '482913' });
    check.flush(...empty(204));
    await verify;
  });

  it('passes on a wrong step-up code with its field, and a refused action as step_up_required', async () => {
    const wrong = api.verifyStepUpCode('000000').catch((e: unknown) => e);
    (await next('POST', '/api/auth/step-up/verify')).flush(...problem(CAPTURED.stepUpWrongCode));
    expect(((await wrong) as ApiError).fields).toEqual({ code: ['Kod hatalı veya süresi dolmuş.'] });

    await signedInAt(CAPTURED.paymentOpen);
    const refused = api.pay(CARD).catch((e: unknown) => e);
    (await next('POST', '/api/application/payment')).flush(...problem(CAPTURED.stepUpRequired));
    expect(await refused).toMatchObject({ code: 'step_up_required', status: 403 });
  });

  it('pays with exactly { holder, cardToken }: the card number, expiry and CVV are sent nowhere and kept nowhere', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await signedInAt(CAPTURED.paymentOpen);
    const pending = api.pay(CARD);
    const post = await next('POST', '/api/application/payment');
    expect(post.request.body).toEqual({ holder: 'Deneme Kurucu', cardToken: 'tok_test_4242' });
    expect(Object.keys(post.request.body)).toEqual(['holder', 'cardToken']);
    const sent = JSON.stringify(post.request.body) + post.request.urlWithParams + JSON.stringify(post.request.headers.keys().map((k) => post.request.headers.get(k)));
    for (const secret of ['4242 4242 4242 4242', '4242424242424242', '12/30', '987']) expect(sent).not.toContain(secret);
    post.flush(...empty(204));
    await read(CAPTURED.payment3dsPending);
    const app = await pending;
    expect(app.stage).toBe('threeDs');
    // Only the holder and the last four digits are remembered, for D-3b.
    expect(app.payment).toEqual({ holder: 'DENEME KURUCU', last4: '4242', amount: 12_750 });
    expect(api['card']).toEqual({ applicationId: CAPTURED.payment3dsPending.id, holder: 'DENEME KURUCU', last4: '4242' });
    const everything = JSON.stringify(app) + JSON.stringify(api['card']) + JSON.stringify(api['view']);
    for (const secret of ['4242 4242 4242 4242', '4242424242424242', '12/30', '987']) expect(everything).not.toContain(secret);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('forgets the card after a reload: the API never returns it', async () => {
    await signedInAt(CAPTURED.paymentOpen);
    const pending = api.pay(CARD);
    (await next('POST', '/api/application/payment')).flush(...empty(204));
    await read(CAPTURED.payment3dsPending);
    await pending;
    // A reload is a new page: a new HttpApi with nothing in memory.
    const reloaded = TestBed.runInInjectionContext(() => new HttpApi());
    const restore = reloaded.restore();
    (await next('GET', '/api/me')).flush(ME);
    await read(CAPTURED.payment3dsPending);
    expect((await restore)!.app!.payment).toEqual({ holder: '', last4: '', amount: 12_750 });
  });

  it('passes on a declined card as the API words it', async () => {
    await signedInAt(CAPTURED.paymentOpen);
    const refused = api.pay({ ...CARD, number: '4000 0000 0000 0002' }).catch((e: unknown) => e);
    const post = await next('POST', '/api/application/payment');
    expect(post.request.body).toEqual({ holder: 'Deneme Kurucu', cardToken: 'tok_test_0002' });
    post.flush(...problem(CAPTURED.cardDeclined));
    expect(await refused).toMatchObject({ code: 'card_declined', message: 'Kartınızdan ödeme alınamadı. Lütfen başka bir kart deneyiniz.' });
  });

  it('confirms, resends and cancels 3-D Secure, reading the application after each', async () => {
    await signedInAt(CAPTURED.payment3dsPending);
    const wrong = api.confirm3ds('000000').catch((e: unknown) => e);
    const first = await next('POST', '/api/application/payment/3ds');
    expect(first.request.body).toEqual({ code: '000000' });
    first.flush(...problem(CAPTURED.threeDsWrongCode));
    expect(await wrong).toMatchObject({ code: '3ds_failed', message: 'Doğrulama kodu hatalı.' });

    let pending = api.resendOtp();
    const resend = await next('POST', '/api/application/payment/3ds/resend');
    expect(resend.request.body).toBeNull();
    expect(resend.request.headers.get('X-DSP-Request')).toBe('1');
    resend.flush(...empty(204));
    await read(CAPTURED.payment3dsPending, 't2');
    expect((await pending).stage).toBe('threeDs');

    pending = api.cancel3ds();
    (await next('POST', '/api/application/payment/3ds/cancel')).flush(...empty(204));
    await read(CAPTURED.paymentCancelled, 't3');
    const cancelled = await pending;
    expect(cancelled.stage).toBe('payment');
    expect(cancelled.payment).toBeUndefined();

    pending = api.confirm3ds(' 123456 ');
    const ok = await next('POST', '/api/application/payment/3ds');
    expect(ok.request.body).toEqual({ code: '123456' });
    ok.flush(...empty(204));
    await read(CAPTURED.paymentCaptured, 't4');
    expect((await pending).stage).toBe('signing');
  });
});

describe('HttpApi steps 4 and 5', () => {
  let api: HttpApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([markApiWrites])), provideHttpClientTesting()],
    });
    api = TestBed.inject(HttpApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function next(method: string, url: string) {
    await new Promise((resolve) => setTimeout(resolve));
    const req = backend.expectOne(url);
    expect(req.request.method).toBe(method);
    return req;
  }

  async function read(view: ApplicationWire, changedAt = 't1') {
    (await next('GET', '/api/application/status')).flush({ stage: view.stage, changedAt });
    (await next('GET', '/api/application')).flush(view);
  }

  async function signedInAt(view: ApplicationWire, me: MeWire = { ...ME, firstName: 'Deneme', lastName: 'Kurucu', email: 'kurucu@example.test' }) {
    const pending = api.restore();
    (await next('GET', '/api/me')).flush(me);
    await read(view);
    await pending;
  }

  const empty = (status: number) => [null, { status, statusText: 'x' }] as const;
  const problem = (p: { status: number; title?: string; code?: string; requestId?: string }) => [p, { status: p.status, statusText: 'x' }] as const;

  /** Sends one write, checks its body and the CSRF header, answers it, and answers the fresh read with `after`. */
  async function write(call: () => Promise<Application>, url: string, body: unknown, status: number, after: ApplicationWire, changedAt: string) {
    const pending = call();
    const post = await next('POST', url);
    expect(post.request.body).toEqual(body);
    expect(post.request.headers.get('X-DSP-Request')).toBe('1');
    post.flush(...empty(status));
    await read(after, changedAt);
    return pending;
  }

  it('the call: consent as ticked, start, hang up, start again and complete; a read after each', async () => {
    await signedInAt(CAPTURED.esignSigning);
    expect((await write(() => api.acceptCallTerms(true), '/api/application/esign/consent', { consent: true }, 204, CAPTURED.esignConsent, 't2')).callConsentAt).toBeTruthy();
    const open = await write(() => api.startCall(), '/api/application/esign/call/start', null, 204, CAPTURED.esignCallOpen, 't3');
    expect(open.stage).toBe('calling');
    expect(open.call!.completed).toBeUndefined();
    expect((await write(() => api.endCall(), '/api/application/esign/call/end', null, 204, CAPTURED.esignCallEnded, 't4')).stage).toBe('signing');
    await write(() => api.startCall(), '/api/application/esign/call/start', null, 204, CAPTURED.esignIssuing, 't5');
    const issuing = await write(() => api.completeCall(), '/api/application/esign/call/complete', null, 202, CAPTURED.esignIssuing, 't5');
    expect(issuing.call).toEqual({ startedAt: callStartedAt(CAPTURED.esignIssuing), completed: true });
  });

  it('a call already completed before a reload: the 409 no_open_call means the certificate is being issued', async () => {
    await signedInAt(CAPTURED.esignIssuing);
    const pending = api.completeCall();
    (await next('POST', '/api/application/esign/call/complete')).flush(...problem(CAPTURED.esignNoOpenCall));
    await read(CAPTURED.esignIssuing, 't6');
    expect((await pending).call!.completed).toBe(true);
  });

  it('sends an unticked consent as false and passes on the refusal of a call without it', async () => {
    await signedInAt(CAPTURED.esignSigning);
    const refused = api.startCall().catch((e: unknown) => e);
    (await next('POST', '/api/application/esign/call/start')).flush(...problem(CAPTURED.esignConsentMissing));
    expect(await refused).toMatchObject({ code: 'consent_missing', message: 'Görüşme başlamadan önce ön bilgilendirmeyi onaylayınız.' });
    const unticked = api.acceptCallTerms(false).catch((e: unknown) => e);
    const post = await next('POST', '/api/application/esign/consent');
    expect(post.request.body).toEqual({ consent: false });
    post.flush(...problem({ status: 400, title: 'x', code: 'validation_failed', requestId: 'r' }));
    expect(await unticked).toMatchObject({ code: 'validation_failed' });
  });

  it('a resident signs with the chosen method; the API reports calling while the provider answers', async () => {
    const resident = { ...ME, firstName: 'Deneme', lastName: 'Kurucu', founderType: 'resident' as const };
    await signedInAt(CAPTURED.residentSigning, resident);
    const app = await write(() => api.signResident('existing'), '/api/application/esign/resident', { method: 'existing' }, 202, CAPTURED.residentIssuing, 't2');
    expect(app.stage).toBe('calling');
    expect(app.call).toBeUndefined();
  });

  it('starts the set-up with the tick as given; passes on no_valid_signature', async () => {
    await signedInAt(CAPTURED.esignSigned);
    const app = await write(() => api.startSetup(true), '/api/application/setup', { confirmed: true }, 202, CAPTURED.setupStarted, 't2');
    expect(app.stage).toBe('setup');
    expect(app.setup!.steps).toBeNull();
    const refused = api.startSetup(true).catch((e: unknown) => e);
    (await next('POST', '/api/application/setup')).flush(...problem(NO_VALID_SIGNATURE));
    expect(await refused).toMatchObject({ code: 'no_valid_signature', status: 409 });
  });

  it('forgets the completed call at sign-out', async () => {
    await signedInAt(CAPTURED.esignIssuing);
    const pending = api.completeCall();
    (await next('POST', '/api/application/esign/call/complete')).flush(...empty(202));
    await read(CAPTURED.esignIssuing, 't2');
    await pending;
    expect(api['callCompleted']).not.toBeNull();
    const out = api.logout();
    (await next('POST', '/api/auth/logout')).flush(...empty(204));
    await out;
    expect(api['callCompleted']).toBeNull();
  });
});
