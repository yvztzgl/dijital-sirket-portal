import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ApiError } from './api-error';
import { HttpApi, markApiWrites } from './http-api';

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

  it('has no demo tools and rejects every call until it is connected', async () => {
    expect(api.demo).toBeNull();
    const error = await api.login().catch((e: unknown) => e);
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
