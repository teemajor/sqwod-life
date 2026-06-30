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
2. Action **Text** → paste your note prompt? Skip — keep it 2-tap. (Optional: add **Ask for Input**, prompt "Client problem?", to capture the why. Skip it to stay 1-tap.)
3. Action **URL** → set to:
   `https://sqwod-move-intake.<you>.workers.dev/move?key=YOUR_MOVE_KEY`
4. Action **Get Contents of URL** → Method **POST** → Request Body **JSON** → add fields:
   - `url` = **Shortcut Input** (the shared link)
   - `note` = (the Ask-for-Input result, if you added step 2; else leave out)
5. (Optional) Action **Show Notification** → "✓ Added to Sqwod".

Now from Instagram (or anywhere): **Share → Sqwod Move**. Done — that's the 2 taps.

## How it appears

The cascade picks the oldest unused move each weekday and renders it at the top of
the Daily (web + email) as **Move of the Day** — your note as the headline, a
"Watch on Instagram →" link, and the coach's @handle credited. One move runs once.

## Test
```bash
curl -X POST "https://sqwod-move-intake.<you>.workers.dev/move?key=YOUR_MOVE_KEY" \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.instagram.com/somecoach/reel/abc/","note":"Fix clients’ cranky shoulders before pressing"}'
# → ✓ Move added to the Sqwod queue  (a file appears in automation/moves/)
```
