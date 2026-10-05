# Arabesque, 3arabesque.art

A static site (`public/`) plus one small Cloudflare Pages Function (`functions/api/save.js`) used by the dashboard.
Hosting is free: Cloudflare Pages for the site, Cloudflare Access (Zero Trust free plan, up to 50 users) for the admin sign-in, and GitHub for storage. The only cost is the domain.

```
public/            the website (index.html, admin/, data.json, img/)
functions/api/     /api/save: the dashboard saves through this
```

How saving works: the dashboard at `/admin` sends the edited `data.json` and any new images to `/api/save`. That function commits them to this GitHub repo, and Cloudflare redeploys the site automatically (about 1 minute).

---

## One-time setup (about 30 minutes)

### 1. GitHub
1. Create a **private** repository named `3arabesque`. Leave it empty: no README.
2. Push this folder to it. Claude can do this for you once the empty repo exists.

### 2. Cloudflare Pages
1. Create a free account at dash.cloudflare.com.
2. Go to **Workers & Pages → Create → Pages → Connect to Git** and pick the `3arabesque` repo.
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: **public**
4. Click **Save and Deploy**. The site goes live at `arabesque-xxx.pages.dev`.

### 3. Domain: 3arabesque.art
1. Buy `3arabesque.art`. Cloudflare Registrar sells .art at cost; Porkbun is about $2 for the first year and about $21 a year after that.
2. If you buy it outside Cloudflare, add the domain to Cloudflare (**Add a domain**, Free plan), then change the nameservers at the registrar to the two Cloudflare gives you.
3. In the Pages project, open **Custom domains → Set up a domain** and add `3arabesque.art`. Add `www.3arabesque.art` too.

### 4. Admin sign-in (Cloudflare Access)
1. Go to **Zero Trust** in the Cloudflare dashboard and choose the **Free** plan. It asks for a team name, e.g. `arabesque`.
2. Go to **Access → Applications → Add an application → Self-hosted**.
   - Name: `Arabesque admin`
   - Add two destinations on domain `3arabesque.art`: path **`admin`** and path **`api`**.
   - Policy: action **Allow**, include **Emails**, then list every admin email (yours, Eslam's, and so on).
   - Login method: **One-time PIN**. The person enters their email and gets a code; no password needed.
3. Save. Open the application again and copy its **Application Audience (AUD) Tag**.
4. Optional: add `arabesque-xxx.pages.dev/admin` as another destination too.

From now on, anyone who opens `3arabesque.art/admin` sees the Cloudflare sign-in screen. Only the emails you allowed get in.

### 5. Let the dashboard save
1. On GitHub, go to **Settings → Developer settings → Fine-grained tokens → Generate new token**.
   - Repository access: **Only select repositories → 3arabesque**
   - Permissions: **Contents: Read and write**
   - Expiry: up to 1 year. Set a reminder to renew it.
2. In the Cloudflare Pages project, go to **Settings → Variables and Secrets** (Production) and add:

| Name | Value |
|---|---|
| `GITHUB_TOKEN` (type: Secret) | the token from step 1 |
| `GITHUB_REPO` | `Ahmedadelart/3arabesque` |
| `ADMIN_EMAILS` | the same emails as the Access policy, comma-separated |
| `ACCESS_TEAM` | `yourteam.cloudflareaccess.com` |
| `ACCESS_AUD` | the AUD tag from step 4.3 |

3. Go to **Deployments → … → Retry deployment** so the new settings take effect.

---

## Adding or removing an admin
Do both:
- Zero Trust → Access → Applications → Arabesque admin → Policy → edit the emails.
- Pages → Settings → Variables → edit `ADMIN_EMAILS` → retry the deployment.

## What the dashboard can do
- **Challenge**: start a new month (title, texts, image, optional full banner, sources) or edit an existing one.
- **Add submissions**: upload artworks to any month or to Highlights. Images are resized in the browser to 1800px.
- **Edit artworks**: fix artist names and titles, move a work to another month, mark highlights, delete. There is a shortcut that lists every work without an artist name.
- **Artist of the week**.

If two admins save at the same moment, the second one is asked to reload first, so nobody overwrites the other.

## Limits (free plans)
- Pages: 500 deploys a month (one per save) and 25MB per file. Bandwidth is unlimited.
- GitHub: stay under about 1GB in total. That is roughly 5,000 artworks at the current size.

## Importing artworks from the Facebook group
1. Open `3arabesque.art/admin/collector.html` and drag the **«أرابيسك: اجمع»** button to the bookmarks bar.
2. On Facebook (signed in), open the group's **Media** tab, open a photo, click the bookmark, then press **Auto** (or use →). Download the file at the end.
3. In the dashboard, open **Import from Facebook**, upload the file, check names and months, and press **Import selected**.

The month is suggested from the post date (Hijri calendar, 1447). Artworks already on the site are recognised by a picture fingerprint (`ph` in `data.json`); for those, only the artist name and links are added. `/api/img` fetches the Facebook images for the dashboard (admins only, `fbcdn.net` links only).
