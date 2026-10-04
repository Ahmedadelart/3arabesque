// Entry point when deployed as a Cloudflare Worker (Workers & Pages → Import repository).
// Serves the static site from /public and handles /api/save with the same code as the Pages Function.
import { onRequestPost, onRequestGet, onRequest } from '../functions/api/save.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/save' || url.pathname === '/api/save/') {
      if (request.method === 'POST') return onRequestPost({ request, env, ctx });
      if (request.method === 'GET') return onRequestGet({ request, env, ctx });
      return onRequest();
    }
    return env.ASSETS.fetch(request);
  },
};
