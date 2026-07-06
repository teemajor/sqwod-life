# Sqwod Move intake — by email

Forward or share any coach clip to **`moves@sqwod.life`** and it lands in the
Move-of-the-Day queue. The Daily then picks the oldest unused one, features it (links +
credits the coach, never re-hosts), and marks it used.

Your workflow: see a Reel / Short / TikTok → **Share → Mail → send to `moves@sqwod.life`**.
Put the link anywhere in the email; the subject becomes the optional "note" (a one-line
hint about what the move solves). Only `tee@teemajor.com` and `tee@sqwod.life` are
accepted — anything else bounces.

## One-time setup (~10 min, free)

### 1. Deploy the Worker
```bash
cd infrastructure/move-email
npx wrangler secret put GITHUB_TOKEN     # fine-grained PAT, Contents: Read/Write on teemajor/sqwod-life
npx wrangler deploy
```
(Reuse the same `GITHUB_TOKEN` you set on the `move-intake` Worker if you still have it.)
Prefer no terminal? Create a Worker named `sqwod-move-email` in the dashboard, paste
`worker.js`, then add the vars from `wrangler.toml` (GH_OWNER/GH_REPO/GH_BRANCH/
ALLOWED_SENDERS) and the `GITHUB_TOKEN` secret under Settings → Variables and Secrets.

### 2. Turn on Email Routing for sqwod.life
Cloudflare → **your domain → Email → Email Routing → Get started**. It auto-adds the
required MX + TXT (SPF) DNS records. Verify.

### 3. Route the address to the Worker
Email Routing → **Routes → Create address** → `moves@sqwod.life` → Action:
**Send to a Worker** → pick `sqwod-move-email` → save.

### 4. Test
Email a link (e.g. an Instagram reel URL) from `tee@teemajor.com` to `moves@sqwod.life`.
Within a few seconds a file appears at `automation/moves/<id>.json` in the repo. The next
Daily run features it. A non-allowed sender, or an email with no link, bounces back.

## Notes
- **Coexists with the HTTP `move-intake` Worker** — both write the same queue file format,
  so you can add Moves by email *or* the iOS Shortcut. Use whichever's handier.
- Reads the link from the subject first, then the body (handles quoted-printable wrapping).
- Prefers Instagram/TikTok/YouTube/X/Facebook links, else the first URL it finds.
- `via: "email"` is stamped on each entry so you can tell how a Move was added.
- Email Routing (receiving) is independent of Resend (sending) — no conflict.
