/**
 * Sqwod Move intake — by EMAIL (Cloudflare Email Worker).
 *
 * Forward/share any coach clip to moves@sqwod.life and it lands in the Move-of-the-Day
 * queue. Workflow: see a Reel/Short/TikTok → Share → Mail → send to moves@sqwod.life.
 * The Worker reads the message, pulls the first link (subject or body), and writes
 * automation/moves/<id>.json to the repo (create-only) — same queue the Daily picks from.
 *
 * Configure via Cloudflare → Email Routing: route `moves@sqwod.life` to this Worker.
 *
 * Secrets (wrangler secret put …):
 *   GITHUB_TOKEN     fine-grained PAT, Contents: Read/Write on the repo
 * Vars (wrangler.toml [vars]):
 *   GH_OWNER, GH_REPO, GH_BRANCH
 *   ALLOWED_SENDERS  comma list — only these addresses may add a Move (rejects others)
 */

export default {
  async email(message, env, ctx) {
    // --- 1. allow-list the sender (envelope-from or header-From) ---
    const allow = (env.ALLOWED_SENDERS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const envFrom = (message.from || '').toLowerCase();

    let raw = '';
    try { raw = await new Response(message.raw).text(); } catch (_) {}
    const subject = message.headers.get('subject') || '';
    const hdrFrom = addrIn(message.headers.get('from') || '');

    if (allow.length && !allow.includes(envFrom) && !allow.includes(hdrFrom)) {
      message.setReject('Sender not authorized for Sqwod Moves');
      return;
    }

    // --- 2. find the link (prefer socials). de-soft-wrap quoted-printable first ---
    const text = raw.replace(/=\r?\n/g, '');
    const link = firstLink(subject) || firstLink(text);
    if (!link) { message.setReject('No link found — put the clip URL in the email.'); return; }

    // note = the subject minus any URL / Fwd:/Re: prefixes (a human hint for the Daily)
    const note = subject.replace(/https?:\/\/\S+/gi, '').replace(/^\s*((fwd|re|wg|aw)\s*:\s*)+/i, '').trim();

    // --- 3. write to the queue (create-only; two captures never collide) ---
    const id = `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}-${Math.random().toString(36).slice(2, 7)}`;
    const entry = { id, url: link, note, platform: platformOf(link), handle: handleOf(link), added: new Date().toISOString(), via: 'email' };
    const path = `automation/moves/${id}.json`;
    const gh = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}`;
    const r = await fetch(gh, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'sqwod-move-email', Accept: 'application/vnd.github+json' },
      body: JSON.stringify({
        message: `move: queued ${entry.platform} clip (via email)`,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(entry, null, 2)))),
        branch: env.GH_BRANCH || 'main',
      }),
    });
    // Reject on failure so the email bounces back to you (you'll know it didn't queue).
    if (!r.ok) { message.setReject(`Queue write failed (${r.status})`); return; }
    // success: accept silently (nothing to return).
  },
};

// first http(s) link — prefer known social platforms, else any URL; strip trailing junk
function firstLink(s) {
  s = String(s || '').replace(/&amp;/g, '&');
  // stop the URL at whitespace or an HTML delimiter (" ' < >) so hrefs don't drag markup
  const social = s.match(/https?:\/\/(?:www\.)?(?:instagram\.com|youtu\.be|youtube\.com|tiktok\.com|x\.com|twitter\.com|facebook\.com|fb\.watch)\/[^\s"'<>]+/i);
  const hit = social || s.match(/https?:\/\/[^\s"'<>]+/i);
  if (!hit) return '';
  return hit[0].replace(/[)\].,'”’]+$/, '').trim();
}

// pull a bare email address out of a "Name <addr>" header
function addrIn(s) {
  const m = String(s || '').match(/[<\s]([^<>\s@]+@[^<>\s]+)>?\s*$/) || String(s).match(/([^<>\s@]+@[^<>\s]+)/);
  return m ? m[1].toLowerCase() : '';
}

function platformOf(u) {
  const s = u.toLowerCase();
  if (s.includes('instagram.com')) return 'Instagram';
  if (s.includes('youtube.com') || s.includes('youtu.be')) return 'YouTube';
  if (s.includes('tiktok.com')) return 'TikTok';
  if (s.includes('twitter.com') || s.includes('x.com')) return 'X';
  if (s.includes('facebook.com') || s.includes('fb.watch')) return 'Facebook';
  return 'web';
}
function handleOf(u) {
  try {
    const p = new URL(u).pathname.split('/').filter(Boolean);
    if (p[0] && !['reel', 'reels', 'p', 'shorts', 'watch', 'status', 'video'].includes(p[0].toLowerCase())) return '@' + p[0].replace(/^@/, '');
  } catch {}
  return '';
}
