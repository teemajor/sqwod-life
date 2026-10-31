# sqwod-investor-pitch — Cloudflare Worker

The AI half of the Investor Matcher on `/[lang]/intelligence/investors/`. A founder pastes
a pitch, the Worker hands it to Claude together with the investor rows the site publishes
at `/investor-data.json`, and returns a ranked top 10 with one-sentence reasons. The site
shows each reason next to its own rule-based evidence lines (stage, portfolio, cheque,
location, activity), so the AI never speaks without the numbers beside it.

```
POST /pitch  { pitch, lang, ts }  →  { summary, matches: [{ id, score, why }], model, dataDate }
```

## Deploy (run these in `infrastructure/investor-pitch/`)

```
wrangler kv namespace create PITCH_KV        # paste the id into wrangler.toml, uncomment the block
wrangler secret put ANTHROPIC_API_KEY        # sk-ant-…
wrangler deploy
```

Then set `endpoint` in `site/src/config/pitch.ts` to the Worker URL plus `/pitch`
(e.g. `https://sqwod-investor-pitch.sqwodlife.workers.dev/pitch`) and rebuild the site.
Until the endpoint is set, the pitch box on the site shows a "coming soon" note.

## Cost and abuse control

| Check | Behaviour |
|---|---|
| Origin/Referer must match `ALLOW_ORIGIN` | 403 |
| Pitch under 40 or over `MAX_CHARS` characters | 400 |
| Time-on-form (`ts`) under `MIN_FILL_MS` | 429 |
| More than `DAILY_PER_IP` reads per IP per day (needs `PITCH_KV`) | 429 |
| Sign-up gate on the site (localStorage unlock after the Sqwod Daily form) | the button sends nothing until unlocked |

One read sends about 10k input tokens (145 investor rows) and gets back about 800 output
tokens. With `claude-sonnet-5-5` that is in the range of a few cents per read; switch
`MODEL` to `claude-haiku-5-5` in `wrangler.toml` for roughly a tenth of that.
