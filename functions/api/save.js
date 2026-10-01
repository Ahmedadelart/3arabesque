// Cloudflare Pages Function: POST /api/save
// Commits data.json (and any uploaded images) to the GitHub repo, which triggers a redeploy.
// Required secrets / variables (Pages > Settings > Variables and Secrets):
//   GITHUB_TOKEN   fine-grained token, "Contents: Read and write" on this repo only
//   GITHUB_REPO    e.g. Ahmedadelart/arabesque
//   ADMIN_EMAILS   comma-separated list, same emails as the Cloudflare Access policy
//   ACCESS_TEAM    your Zero Trust team domain, e.g. arabesque.cloudflareaccess.com
//   ACCESS_AUD     the "Application Audience (AUD) Tag" of the Access application
// Optional: GITHUB_BRANCH (default main), SITE_DIR (default public)

const b64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));

// Verify the Cloudflare Access JWT so the email can't be faked (e.g. on the *.pages.dev address).
async function accessEmail(request, env) {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return null;
  const [h, p, sig] = token.split('.');
  const header = JSON.parse(new TextDecoder().decode(b64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64url(p)));
  const team = env.ACCESS_TEAM.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const { keys } = await (await fetch(`https://${team}/cdn-cgi/access/certs`)).json();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!ok || !aud.includes(env.ACCESS_AUD) || payload.exp * 1000 < Date.now()) return null;
  return (payload.email || '').toLowerCase();
}

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function onRequestPost({ request, env }) {
  // 1) Who is this? Cloudflare Access signs a token after sign-in; we check it.
  let email = null;
  try { email = await accessEmail(request, env); } catch { email = null; }
  const allowed = (env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!email || !allowed.includes(email)) return json({ error: 'Not signed in as an admin' }, 403);
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ error: 'GITHUB_TOKEN / GITHUB_REPO not set' }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const { data, files = [], del = [], message = 'Update' } = body || {};
  if (!data || !Array.isArray(data.works)) return json({ error: 'Missing data' }, 400);
  const okPath = p => typeof p === 'string' && /^img\/[A-Za-z0-9_.-]+\.jpg$/.test(p);
  if (!files.every(f => okPath(f.path) && typeof f.b64 === 'string') || !del.every(okPath))
    return json({ error: 'Bad file path' }, 400);

  const repo = env.GITHUB_REPO, branch = env.GITHUB_BRANCH || 'main', dir = (env.SITE_DIR ?? 'public').replace(/\/$/, '');
  const P = p => (dir ? dir + '/' : '') + p;
  const gh = async (path, init = {}) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'arabesque-admin',
        'x-github-api-version': '2022-11-28',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${t.slice(0, 200)}`);
    return t ? JSON.parse(t) : {};
  };

  try {
    // 2) Guard against two admins overwriting each other.
    const ref = await gh(`/git/ref/heads/${branch}`);
    const head = ref.object.sha;
    const curFile = await gh(`/contents/${P('data.json')}?ref=${head}`);
    const current = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(curFile.content.replace(/\n/g, '')), c => c.charCodeAt(0))));
    if ((current.rev || 0) !== (data.rev || 0))
      return json({ error: 'Someone else saved changes a moment ago. Reload the page and try again.' }, 409);
    data.rev = (data.rev || 0) + 1;

    // 3) Blobs for images + data.json
    const tree = [];
    for (const f of files) {
      const b = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.b64, encoding: 'base64' }) });
      tree.push({ path: P(f.path), mode: '100644', type: 'blob', sha: b.sha });
    }
    tree.push({ path: P('data.json'), mode: '100644', type: 'blob', content: JSON.stringify(data) });
    for (const p of del) tree.push({ path: P(p), mode: '100644', type: 'blob', sha: null });

    // 4) Tree -> commit -> move branch
    const base = (await gh(`/git/commits/${head}`)).tree.sha;
    let t;
    try { t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base, tree }) }); }
    catch { t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base, tree: tree.filter(x => x.sha !== null) }) }); }
    const c = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: `${message} (${email})`, tree: t.sha, parents: [head] }) });
    await gh(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
    return json({ ok: true, rev: data.rev, commit: c.sha });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}

export const onRequest = () => json({ error: 'Use POST' }, 405);
