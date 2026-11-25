import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, Provider } from '@angular/core';
import { HttpApi, markApiWrites } from '../app/core/http-api';

/**
 * The `http` build (`ng serve --configuration http`, `ng build --configuration http`): the real
 * API over HTTP, no demo tools. Replaces environment.ts; see that file and docs/api-client.md.
 * Requests go to `/api/...` on the portal's own origin; in development the Angular dev server
 * forwards them to the API (proxy.conf.json).
 */
export const environment: {
  api: typeof HttpApi;
  providers: (Provider | EnvironmentProviders)[];
} = {
  api: HttpApi,
  providers: [provideHttpClient(withInterceptors([markApiWrites]))],
};
