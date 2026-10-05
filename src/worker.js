// Entry point when deployed as a Cloudflare Worker (Workers & Pages → Import repository).
// Serves the static site from /public and handles /api/* with the same code as the Pages Functions.
import * as save from '../functions/api/save.js';
import * as img from '../functions/api/img.js';

const routes = { '/api/save': save, '/api/img': img };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const mod = routes[url.pathname.replace(/\/$/, '')];
    if (mod) {
      const h = mod['onRequest' + request.method[0] + request.method.slice(1).toLowerCase()] || mod.onRequest;
      return h({ request, env, ctx });
    }
    return env.ASSETS.fetch(request);
  },
};
