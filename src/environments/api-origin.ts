/**
 * Where the API lives, as seen from the browser. Empty in every build except `hosted` and
 * `hosted-demo`: requests then go to `/api/...` on the portal's own address (the dev server's
 * proxy, or a web server that passes `/api` on). Those two configurations replace this file with
 * api-origin.hosted.ts. Each of them names every replacement it needs, because Angular does not
 * add one configuration's `fileReplacements` to another's. See docs/api-client.md, "Hosted on its
 * own address".
 */
export const apiOrigin = '';
