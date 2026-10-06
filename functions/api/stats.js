// GET  /api/stats         admin only: visits and subscribers for the dashboard
// POST /api/stats {del}   admin only: remove a subscriber
import { checkAdmin } from './save.js';
import { ensure } from '../pub.js';

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function guard(request, env) {
  const a = await checkAdmin(request, env);
  if (!a.email) return json({ ok: false, reason: a.reason }, 403);
  if (!env.DB) return json({ ok: false, error: 'no_db' }, 503);
  await ensure(env.DB);
  return null;
}

export async function onRequestGet({ request, env }) {
  const g = await guard(request, env); if (g) return g;
  const days = Math.min(365, +new URL(request.url).searchParams.get('days') || 30);
  const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const { results: rows } = await env.DB.prepare('SELECT d,k,n FROM hits WHERE d >= ?1').bind(since).all();
  const { results: subs } = await env.DB.prepare('SELECT email,lang,t,src FROM subs ORDER BY t DESC').all();
  const allTime = await env.DB.prepare("SELECT COALESCE(SUM(n),0) AS v FROM hits WHERE k='all'").first();
  return json({ ok: true, since, days, rows, subs, allTime: allTime ? allTime.v : 0 });
}

export async function onRequestPost({ request, env }) {
  const g = await guard(request, env); if (g) return g;
  let b = {}; try { b = await request.json(); } catch {}
  if (b.del) await env.DB.prepare('DELETE FROM subs WHERE email = ?1').bind(String(b.del).toLowerCase()).run();
  return json({ ok: true });
}
