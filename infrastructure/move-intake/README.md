# Sqwod Move intake — capture a "Move of the Day" in 2 taps

You curate clips on IG/YT/X/TikTok. This catches the one you pick and queues it; the
Daily pipeline features the oldest unused one — **linking and crediting the coach,
never re-hosting** — then marks it used.

```
IG share → Shortcut → POST /move (this Worker) → automation/moves/<id>.json (repo)
                                                          │
cascade.mjs pickMove() → Daily "Move of the Day" (top of issue + email) → used.json
```

## 1. Deploy the Worker (one time)

```bash
cd infrastructure/move-intake
wrangler login
wrangler secret put MOVE_KEY        # make up a long random string — your Shortcut sends it
wrangler secret put GITHUB_TOKEN    # fine-grained PAT: Contents Read/Write on sqwod-life
wrangler deploy
```
Note the URL, e.g. `https://sqwod-move-intake.<you>.workers.dev`.

## 2. Build the iOS Shortcut (one time, ~3 min)

Shortcuts app → **+** → name it "Sqwod Move":
1. Settings (ⓘ) → **Show in Share Sheet** → Accept **URLs**.
2. Action **Ask for Input** → prompt: "What does this move fix / who's it for?" — **required**.
   The pipeline SKIPS moves without a note (a bare "Watch →" button gets no clicks);
   one sentence of context is what makes the card work. Mention the coach's @handle
   here too if the URL doesn't contain it (reel share links don't).
3. Action **URL** → set to:
   `https://sqwod-move-intake.<you>.workers.dev/move?key=YOUR_MOVE_KEY`
4. Action **Get Contents of URL** → Method **POST** → Request Body **JSON** → add fields:
   - `url` = **Shortcut Input** (the shared link)
   - `note` = the Ask-for-Input result
5. (Optional) Action **Show Notification** → "✓ Added to Sqwod".

Now from Instagram (or anywhere): **Share → Sqwod Move**. Done — that's the 2 taps.

## How it appears

The cascade picks the oldest unused move **that has a note** each weekday and
renders it at the top of the Daily (web + email) as **Move of the Day** — your
note as the headline, an on-brand play banner linking to the clip, and the
coach's @handle credited. Moves without a note stay in the queue (a warning is
logged) until you add one to their JSON. One move runs once.

## Test
```bash
curl -X POST "https://sqwod-move-intake.<you>.workers.dev/move?key=YOUR_MOVE_KEY" \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.instagram.com/somecoach/reel/abc/","note":"Fix clients’ cranky shoulders before pressing"}'
# → ✓ Move added to the Sqwod queue  (a file appears in automation/moves/)
```
