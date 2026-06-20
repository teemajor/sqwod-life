# automation/ — the content cascade

Turns current industry news into a bilingual, self-publishing Sqwod Daily — text **and** audio:

```
ingest (real headlines) → cascade (rewrite in Sqwod voice, EN+DE) → audio (TTS + podcast feed) → commit → deploy
```

## The pieces
- **`ingest.mjs`** — pulls current fitness/wellness-industry headlines (free, Google News RSS — no key), classifies each into an Articles pillar, and writes `sources/<date>.json`.
- **`cascade.mjs`** — reads that source and writes a bilingual Sqwod Daily issue into `../site/src/content/daily/<date>.{en,de}.md`. `generate()` calls Claude to author each item natively per language; without a key it falls back to the raw headline (dry-run).
- **`audio.mjs`** — reads the day's issue, builds a spoken script (EN + DE, with a mid-roll sponsor read when the issue has a sponsor), synthesizes an MP3 per language via ElevenLabs into `../site/public/audio/<date>-<lang>.mp3`, then rebuilds the podcast RSS feeds (`site/public/podcast.xml` EN, `site/public/podcast.de.xml` DE). Without a key it skips synthesis and just rebuilds the feeds (dry-run safe).
- **`newsletter.mjs`** — renders each issue into an inbox-ready HTML email (EN + DE) at `../site/public/email/<date>-<lang>.html`, including the same sponsor slot. Paste into your ESP or wire the ESP to pull it. So ad inventory matches across **audio, web and inbox**.
- **`prompts/cascade.md`** — the instructions the model follows (voice, rules, citation).
- **`.github/workflows/content.yml`** — runs the whole chain in the cloud on a schedule (weekday mornings) + on demand, commits, and the deploy workflow ships it.

## Run it locally
```bash
node automation/ingest.mjs            # writes today's source from live news
node automation/cascade.mjs           # rewrites it into the Daily (dry-run without a key)
node automation/audio.mjs             # synth MP3s + rebuild podcast feeds (dry-run without a key)
node automation/audio.mjs --feeds-only   # just rebuild the RSS feeds from existing MP3s
node automation/newsletter.mjs        # render the HTML email (EN + DE) with sponsor slot
```

## Selling a sponsor (one ad, three surfaces)
Add a `sponsor` block to the issue frontmatter and it appears on the web page, in the email, and as a mid-roll read in the audio:
```yaml
sponsor:
  name: "Brand"
  blurb: "One-line ad copy."
  url: "https://brand.com/sqwod"   # tracked click-through
  cta: "Try it free"
```
Sponsored content is always labeled (`Anzeige`/`Sponsored`) per UWG/FTC; editorial stays independent.

## Go fully live
1. Add **GitHub secrets** (repo → Settings → Secrets and variables → Actions → New secret):
   - `ANTHROPIC_API_KEY` — turns on the Sqwod-voice rewrite (EN + DE text).
   - `ELEVENLABS_API_KEY` — turns on audio synthesis. Optional: `ELEVENLABS_VOICE_EN` / `ELEVENLABS_VOICE_DE` to pick specific voices (defaults to one multilingual voice for both).
2. The scheduled Action now ingests → rewrites → voices → commits → deploys every weekday morning. Trigger any time from **Actions → "Generate content" → Run workflow**.

## Get the show on Apple & Spotify (one-time)
The feeds live at `https://sqwod.life/podcast.xml` (EN) and `https://sqwod.life/podcast.de.xml` (DE). After the first run produces real episodes:
1. **Apple:** [Apple Podcasts Connect](https://podcastsconnect.apple.com) → add a show → paste the feed URL.
2. **Spotify:** [Spotify for Creators](https://creators.spotify.com) → add your podcast → paste the feed URL.
3. Both platforms auto-pull every new episode after that — no re-submission needed.
4. Once approved, paste the resulting show URLs into `APPLE_URL` / `SPOTIFY_URL` at the top of `site/src/pages/[lang]/daily/index.astro` so the "Listen on" buttons point to the real show.

A square cover lives at `site/public/podcast-cover.png` (swap it for final art any time).

## Controls
- **Draft vs. publish:** issues are created as `draft` by default (they show with a "Draft" tag for you to review, then flip to `published`). For fully hands-off auto-publishing, add `--status=published` to the cascade step in `content.yml`.
- **Volume / quality:** tune the queries and `--max` in `ingest.mjs`. Everything keeps its `sourceId` + source link for provenance.
- **Guardrail:** the model rewrites tone only and never invents numbers beyond the source; every item links back to the original.
