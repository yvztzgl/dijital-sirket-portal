import { HttpInterceptorFn } from '@angular/common/http';
import { apiOrigin } from '@env/api-origin';

/**
 * Sends every `/api/...` request to the API's own address when the build has one
 * (`src/environments/api-origin.ts`), and asks the browser to include the session cookie, which it
 * leaves out of requests to another origin unless told. With no address set the request is passed
 * on untouched and stays on the portal's origin. Anything that is not an `/api/` path is never
 * changed, so the cookie is not offered to another host.
 *
 * Must come after `markApiWrites` in the interceptor list: that one recognises API requests by
 * their `/api/` path, which this one turns into a full address.
 */
export const sendToApiOrigin: HttpInterceptorFn = (request, next) => toApiOrigin(apiOrigin)(request, next);

/** The interceptor for a given address; apart from `sendToApiOrigin` so a test can pass its own. */
export function toApiOrigin(origin: string): HttpInterceptorFn {
  return (request, next) => {
    if (!origin || !request.url.startsWith('/api/')) return next(request);
    return next(request.clone({ url: origin + request.url, withCredentials: true }));
  };
}
