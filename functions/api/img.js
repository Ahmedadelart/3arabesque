// GET /api/img?u=<facebook image link>
// Admin-only image fetcher used by the dashboard's "import from Facebook" tab.
// Browsers can't read Facebook image pixels directly (cross-site), so the dashboard asks
// this endpoint, which fetches the picture from Facebook's image servers and hands it back.
import { checkAdmin } from './save.js';

const ALLOWED = /(^|\.)fbcdn\.net$/i;

export async function onRequestGet({ request, env }) {
  let who;
  try { who = await checkAdmin(request, env); } catch { who = {}; }
  if (!who.email) return new Response('Not signed in as an admin', { status: 403 });
  const u = new URL(request.url).searchParams.get('u') || '';
  let target;
  try { target = new URL(u); } catch { return new Response('Bad link', { status: 400 }); }
  if (target.protocol !== 'https:' || !ALLOWED.test(target.hostname)) return new Response('Only Facebook image links', { status: 400 });
  const r = await fetch(target.toString(), { headers: { 'user-agent': 'Mozilla/5.0', accept: 'image/*' }, redirect: 'follow' });
  if (!r.ok) return new Response(`Facebook answered ${r.status} (the link may have expired, collect again)`, { status: 502 });
  const type = r.headers.get('content-type') || '';
  if (!type.startsWith('image/')) return new Response('Not an image', { status: 502 });
  return new Response(r.body, { headers: { 'content-type': type, 'cache-control': 'private, max-age=3600' } });
}
export const onRequest = () => new Response('Use GET', { status: 405 });
