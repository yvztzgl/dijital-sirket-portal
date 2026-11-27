import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Api } from '@core/api/api';
import { DEMO_FLAG, DemoServerApi } from '@core/api/demo/demo-server-api';
import { apiOrigin } from '@env/api-origin';
import { toApiOrigin } from './api-origin';
import { markApiWrites } from './http-api';

const HOST = 'https://api.example.test';

function setup(origin: string) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([markApiWrites, toApiOrigin(origin)])), provideHttpClientTesting()],
  });
  return { http: TestBed.inject(HttpClient), sent: TestBed.inject(HttpTestingController) };
}

describe('toApiOrigin', () => {
  it('is off in the default build: no API address is compiled in', () => {
    expect(apiOrigin).toBe('');
  });

  it('with no address, leaves the request on the portal origin and does not ask for credentials', () => {
    const { http, sent } = setup('');
    http.get('/api/me').subscribe();
    const req = sent.expectOne('/api/me');
    expect(req.request.withCredentials).toBe(false);
    req.flush({});
  });

  it('with an address, sends an /api/ read there with the cookie', () => {
    const { http, sent } = setup(HOST);
    http.get('/api/application/status').subscribe();
    const req = sent.expectOne(HOST + '/api/application/status');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('with an address, a write still carries the X-DSP-Request header', () => {
    const { http, sent } = setup(HOST);
    http.post('/api/auth/login', { email: 'a@b.test', password: 'x' }).subscribe();
    const req = sent.expectOne(HOST + '/api/auth/login');
    expect(req.request.headers.get('X-DSP-Request')).toBe('1');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('never touches a request that is not an /api/ path', () => {
    const { http, sent } = setup(HOST);
    http.get('/assets/x.json').subscribe();
    http.get('https://elsewhere.test/api/me').subscribe();
    expect(sent.expectOne('/assets/x.json').request.withCredentials).toBe(false);
    expect(sent.expectOne('https://elsewhere.test/api/me').request.withCredentials).toBe(false);
  });

  it('the demo controls of a hosted demo build ask the API address too', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([markApiWrites, toApiOrigin(HOST)])),
        provideHttpClientTesting(),
        { provide: DEMO_FLAG, useValue: true },
        { provide: Api, useValue: { demo: null } },
      ],
    });
    const demo = TestBed.inject(DemoServerApi);
    const sent = TestBed.inject(HttpTestingController);
    const info = await vi.waitFor(() => sent.expectOne(HOST + '/api/demo'));
    expect(info.request.withCredentials).toBe(true);
    info.flush({ enabled: true, threeDsCode: '123456' });
    await demo.ready;
    expect(demo.available()).toBe(true);

    const pending = demo.title('reserved');
    const write = await vi.waitFor(() => sent.expectOne(HOST + '/api/demo/title'));
    expect(write.request.headers.get('X-DSP-Request')).toBe('1');
    expect(write.request.withCredentials).toBe(true);
    write.flush({});
    await pending;
    sent.verify();
  });
});
