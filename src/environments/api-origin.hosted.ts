/**
 * The `hosted` configuration's replacement for api-origin.ts: the portal is served from its own
 * address and calls the API on this one. No trailing slash. The API must list the portal's address
 * in `Cors__Origins`, and both addresses must be under the same registrable domain, because the
 * session cookie is SameSite=Strict (docs/api-client.md, "Hosted on its own address").
 */
export const apiOrigin = 'https://dijital-sirket-api.jestiyon.com';
