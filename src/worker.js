// Entry point when deployed as a Cloudflare Worker (Workers & Pages → Import repository).
// Serves the static site from /public and handles the endpoints below.
// /api/* is behind Cloudflare Access (admins). /x/* is public (visit counter, email signup).
import * as save from '../functions/api/save.js';
import * as img from '../functions/api/img.js';
import * as stats from '../functions/api/stats.js';
import * as pub from '../functions/pub.js';

const routes = { '/api/save': save, '/api/img': img, '/api/stats': stats };
const open = { '/x/hit': pub.hit, '/x/sub': pub.sub };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    if (open[path]) return open[path]({ request, env, ctx });
    const mod = routes[path];
    if (mod) {
      const h = mod['onRequest' + request.method[0] + request.method.slice(1).toLowerCase()] || mod.onRequest;
      if (!h) return new Response('Method not allowed', { status: 405 });
      return h({ request, env, ctx });
    }
    return env.ASSETS.fetch(request);
  },
};
