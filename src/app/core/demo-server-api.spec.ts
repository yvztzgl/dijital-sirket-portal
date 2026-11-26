import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Api } from './api';
import { ApiError } from './api-error';
import { DEMO_FLAG, DemoServerApi } from './demo-server-api';
import { markApiWrites } from './http-api';

describe('DemoServerApi', () => {
  /** `api.demo` set = mock mode; null = HTTP mode. The flag is the http-demo build's switch. */
  function setUp(opts: { flag: boolean; mock: boolean }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([markApiWrites])),
        provideHttpClientTesting(),
        { provide: DEMO_FLAG, useValue: opts.flag },
        { provide: Api, useValue: { demo: opts.mock ? {} : null } },
      ],
    });
    return { demo: TestBed.inject(DemoServerApi), backend: TestBed.inject(HttpTestingController) };
  }

  it('is not available in mock mode and asks the API nothing', async () => {
    const { demo, backend } = setUp({ flag: true, mock: true });
    await demo.ready;
    expect(demo.available()).toBe(false);
    backend.verify();
  });

  it('is not available without the build flag', async () => {
    const { demo, backend } = setUp({ flag: false, mock: false });
    await demo.ready;
    expect(demo.available()).toBe(false);
    backend.verify();
  });

  it('is not available when the API answers 404 (demo off in the API)', async () => {
    const { demo, backend } = setUp({ flag: true, mock: false });
    const req = await vi.waitFor(() => backend.expectOne('/api/demo'));
    req.flush({ title: 'Bulunamadı.', status: 404, code: 'not_found' }, { status: 404, statusText: 'Not Found' });
    await demo.ready;
    expect(demo.available()).toBe(false);
    expect(demo.threeDsCode()).toBeNull();
  });

  it('is available when the API says enabled, and its writes carry the write header', async () => {
    const { demo, backend } = setUp({ flag: true, mock: false });
    (await vi.waitFor(() => backend.expectOne('/api/demo'))).flush({ enabled: true, threeDsCode: '123456' });
    await demo.ready;
    expect(demo.available()).toBe(true);
    expect(demo.threeDsCode()).toBe('123456');

    const pending = demo.title('reserved').catch((e: unknown) => e);
    const req = await vi.waitFor(() => backend.expectOne('/api/demo/title'));
    expect(req.request.body).toEqual({ result: 'reserved' });
    expect(req.request.headers.get('X-DSP-Request')).toBe('1');
    req.flush(
      { title: 'Bu işlem başvurunun şu anki adımında yapılamaz.', status: 409, code: 'demo_wrong_stage', requestId: 'x' },
      { status: 409, statusText: 'Conflict' },
    );
    const error = await pending;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('demo_wrong_stage');
  });
});
