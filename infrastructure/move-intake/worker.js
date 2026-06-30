/**
 * Sqwod Move intake — Cloudflare Worker.
 *
 * Catches a "Move of the Day" candidate (a coach's clip you saved on IG/YT/X/TikTok)
 * and drops it in the repo queue. The Daily pipeline picks the oldest unused one,
 * renders it (links + credits the coach — never re-hosts), and marks it used.
 *
 * Route:
 *   POST or GET /move?key=SECRET&url=<link>&note=<problem it solves>
 *     - Designed for a 2-tap iOS Share Shortcut. `note` is optional.
 *     - Writes automation/moves/<ts>-<rand>.json to the repo (create-only — no
 *       read-modify-write, so two captures never collide).
 *
 * Secrets (wrangler secret put …):
 *   MOVE_KEY        shared secret — the Shortcut must send ?key=… (stops randoms)
 *   GITHUB_TOKEN    fine-grained PAT, Contents: Read/Write on the repo
 * Vars (wrangler.toml [vars]):
 *   GH_OWNER, GH_REPO, GH_BRANCH
 */
const ok = (msg) => new Response(msg, { status: 200, headers: { 'content-type': 'text/plain' } });
const bad = (msg, s = 400) => new Response(msg, { status: s, headers: { 'content-type': 'text/plain' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/move') return ok('Sqwod Move intake');

    // params from query (GET) or form/JSON (POST)
    let link = url.searchParams.get('url') || '';
    let note = url.searchParams.get('note') || '';
    let key = url.searchParams.get('key') || req.headers.get('x-move-key') || '';
    if (req.method === 'POST') {
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const b = await req.json().catch(() => ({}));
        link = link || b.url || ''; note = note || b.note || ''; key = key || b.key || '';
      } else if (ct.includes('form')) {
        const f = await req.formData();
        link = link || (f.get('url') || ''); note = note || (f.get('note') || ''); key = key || (f.get('key') || '');
      }
    }
    link = String(link).trim(); note = String(note).trim();

    if (!env.MOVE_KEY || key !== env.MOVE_KEY) return bad('unauthorized', 401);
    if (!/^https?:\/\//i.test(link)) return bad('need a valid url');

    const id = `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, url: link, note, platform: platformOf(link), handle: handleOf(link), added: new Date().toISOString() };

    const path = `automation/moves/${id}.json`;
    const gh = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}`;
    const body = {
      message: `move: queued ${entry.platform} clip`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(entry, null, 2)))),
      branch: env.GH_BRANCH || 'main',
    };
    const r = await fetch(gh, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'sqwod-move-intake', Accept: 'application/vnd.github+json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return bad(`queue failed (${r.status})`, 502);
    return ok('✓ Move added to the Sqwod queue');
  },
};

function platformOf(u) {
  const s = u.toLowerCase();
  if (s.includes('instagram.com')) return 'Instagram';
  if (s.includes('youtube.com') || s.includes('youtu.be')) return 'YouTube';
  if (s.includes('tiktok.com')) return 'TikTok';
  if (s.includes('twitter.com') || s.includes('x.com')) return 'X';
  return 'web';
}
// best-effort @handle from the URL path (e.g. instagram.com/<handle>/reel/...)
function handleOf(u) {
  try {
    const p = new URL(u).pathname.split('/').filter(Boolean);
    if (p[0] && !['reel', 'p', 'shorts', 'watch', 'status', 'video'].includes(p[0].toLowerCase())) return '@' + p[0].replace(/^@/, '');
  } catch {}
  return '';
}
