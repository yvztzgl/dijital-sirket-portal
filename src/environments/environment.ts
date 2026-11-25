import { EnvironmentProviders, Provider } from '@angular/core';
import { MockApi } from '../app/core/mock-api';

/**
 * Default build (`ng serve`, `ng build`, `ng test`): the in-browser mock with its demo tools.
 * The `http` configuration in angular.json replaces this file with environment.http.ts, so only
 * one of the two API implementations is ever compiled into a build. Keep both files' shapes equal.
 */
export const environment: {
  /** The class `inject(Api)` returns (see api.ts). */
  api: typeof MockApi;
  /** Extra app-wide providers this mode needs. The mock talks to nobody, so it needs none. */
  providers: (Provider | EnvironmentProviders)[];
} = {
  api: MockApi,
  providers: [],
};
