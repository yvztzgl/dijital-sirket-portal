import { TestBed } from '@angular/core/testing';
import { Api } from './api';
import { MockApi } from '@core/api/mock/mock-api';

describe('Api', () => {
  it('is the mock, with its demo tools, in the default build', () => {
    TestBed.configureTestingModule({});
    const api = TestBed.inject(Api);
    expect(api).toBeInstanceOf(MockApi);
    expect(api).toBe(TestBed.inject(MockApi));
    expect(api.demo).not.toBeNull();
  });
});
