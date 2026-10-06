// Public endpoints (not behind Cloudflare Access):
//   POST /x/hit  {p, r, f}  cookieless page-view counter
//   POST /x/sub  {email, lang, hp}  email subscription
// Both write to the D1 database bound as DB (created automatically on deploy).
// No IP address or user agent is stored. A daily, one-way hash is kept for 2 days only, to count unique visitors.

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|monitor|curl|wget|python|node-fetch/i;

export async function ensure(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS hits (d TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (d, k))'),
    db.prepare('CREATE TABLE IF NOT EXISTS uv (d TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY (d, h))'),
    db.prepare('CREATE TABLE IF NOT EXISTS subs (email TEXT PRIMARY KEY, lang TEXT, t INTEGER, src TEXT)'),
  ]);
}
let ready = false;
async function db(env) {
  if (!env.DB) return null;
  if (!ready) { await ensure(env.DB); ready = true; }
  return env.DB;
}

const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
  .slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');

const clean = (s, n) => String(s || '').replace(/[^\w\-#/.؀-ۿ%]/g, '').slice(0, n);

export async function hit({ request, env, ctx }) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  const ua = request.headers.get('user-agent') || '';
  if (BOT.test(ua)) return json({ ok: true, skip: 'bot' });
  const D = await db(env); if (!D) return json({ ok: false, error: 'no_db' });
  let b = {}; try { b = await request.json(); } catch {}
  const day = new Date().toISOString().slice(0, 10);
  let p = clean(b.p, 60) || '#home';
  // group per-item pages so the list stays readable
  p = p.replace(/^#(aow|pio)\/.*/, '#$1/…');
  const up = k => D.prepare('INSERT INTO hits (d,k,n) VALUES (?1,?2,1) ON CONFLICT(d,k) DO UPDATE SET n=n+1').bind(day, k);
  const st = [up('all'), up('p:' + p)];
  if (b.f) {
    const country = (request.cf && request.cf.country) || '??';
    st.push(up('c:' + clean(country, 3)));
    let ref = '';
    try { ref = b.r ? new URL(b.r).hostname.replace(/^(www|m|l|lm|web)\./, '') : ''; } catch {}
    if (/3arabesque\.art$/.test(ref)) ref = '';
    st.push(up('r:' + (clean(ref, 60) || 'direct')));
    st.push(up('dev:' + (/Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop')));
  }
  const ip = request.headers.get('cf-connecting-ip') || '';
  const h = await sha(day + '|' + ip + '|' + ua + '|' + (env.ACCESS_AUD || ''));
  const work = (async () => {
    await D.batch(st);
    const r = await D.prepare('INSERT OR IGNORE INTO uv (d,h) VALUES (?1,?2)').bind(day, h).run();
    if (r.meta && r.meta.changes) await up('u').run();
    if (Math.random() < 0.02) await D.prepare('DELETE FROM uv WHERE d < ?1').bind(new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)).run();
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(work.catch(() => {})); else await work.catch(() => {});
  return json({ ok: true });
}

export async function sub({ request, env }) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  let b = {}; try { b = await request.json(); } catch {}
  if (b.hp) return json({ ok: true }); // honeypot field filled: a bot
  const email = String(b.email || '').trim().toLowerCase();
  if (email.length > 120 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(email)) return json({ ok: false, error: 'bad_email' }, 400);
  const D = await db(env); if (!D) return json({ ok: false, error: 'no_db' }, 503);
  const r = await D.prepare('INSERT OR IGNORE INTO subs (email,lang,t,src) VALUES (?1,?2,?3,?4)')
    .bind(email, b.lang === 'en' ? 'en' : 'ar', Date.now(), clean(b.src, 30)).run();
  return json({ ok: true, already: !(r.meta && r.meta.changes) });
}
