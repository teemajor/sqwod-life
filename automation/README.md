# automation/ — the content cascade

Turns current industry news into a bilingual, self-publishing Sqwod Daily — text **and** audio:

```
ingest (real headlines) → cascade (rewrite in Sqwod voice, EN+DE) → audio (TTS + podcast feed) → commit → deploy
```

## The pieces
- **`ingest.mjs`** — pulls current fitness/wellness-industry headlines (free, Google News RSS — no key), classifies each into an Articles pillar, and writes `sources/<date>.json`.
- **`cascade.mjs`** — reads that source and writes a bilingual Sqwod Daily issue into `../site/src/content/daily/<date>.{en,de}.md`. `generate()` calls Claude to author each item natively per language; without a key it falls back to the raw headline (dry-run).
- **`audio.mjs`** — reads the day's issue, builds a spoken script (EN + DE, with a mid-roll sponsor read when the issue has a sponsor), synthesizes an MP3 per language via ElevenLabs into `../site/public/audio/<date>-<lang>.mp3`, then rebuilds the podcast RSS feeds (`site/public/podcast.xml` EN, `site/public/podcast.de.xml` DE). Without a key it skips synthesis and just rebuilds the feeds (dry-run safe).
- **`press.mjs`** — the press-release pipeline. Reads submissions from `press-queue/<id>.json` (written by the Cloudflare Worker in `infrastructure/pr-intake/`), AI-screens new ones against the content policy (writes a recommendation), and publishes the ones you mark `"status":"approved"` (premium also needs `"paid":true`, set by Stripe) into `../site/src/content/press/` (EN + DE). Run by `.github/workflows/press.yml` (hourly + manual). Dry-run safe. Full setup checklist in `infrastructure/pr-intake/README.md`.
- **`newsletter.mjs`** — renders each issue into an inbox-ready HTML email (EN + DE) at `../site/public/email/<date>-<lang>.html`. Full Morning-Brew-style section set: Money Movement, Connect the Dots (hero glyph), The Rundown (w/ source links), Policy Watch, Stat, Sponsor (the only paid click-out), Sqwod Recs, Play, Meanwhile, Share/referral (`{{referral_link}}` / `{{referral_count}}` merge tags for your ESP), subscribe. Signature movement-glyph GIFs live in `../site/public/email-assets/`. So ad inventory matches across **audio, web and inbox**.
- **`verified.mjs`** — the Sqwod Verified crowd-signal refresher. Upserts each review's **Trustpilot** chip (EN + DE) from `verified-sources.json` and bumps `updatedAt` **only when a score actually changes** (no fake-freshness churn) — so reviews stay current and search engines see genuine `dateModified` updates (the review pages also emit `Product` + `AggregateRating` JSON-LD). With `TRUSTPILOT_API_KEY` set it pulls live TrustScores from the Trustpilot Business API first; without a key it uses the researched values in the registry (dry-run safe, never invents numbers). Editorial fields (`sqwodScore`, the Sqwod assessment) are never touched. Run daily by `.github/workflows/verified.yml`.
- **`prompts/cascade.md`** — the instructions the model follows (voice, rules, citation).
- **`.github/workflows/content.yml`** — runs the whole chain in the cloud on a schedule (weekday mornings) + on demand, commits, and the deploy workflow ships it.

## Sqwod Jobs (Germany)
A weekly list of open roles in German fitness and wellness at `/en/jobs/` and `/de/jobs/`, with pay whenever the employer lists it. The pay figures are kept, structured, as the seed of a future Coach Pricing Index DE.
- **`jobs.mjs`**: fetches every source in `jobs-sources.mjs` in order (Bundesagentur für Arbeit Jobsuche API, Adzuna, brand career pages from `jobs-brands.json`, the DSSV board, Fitt Insider remote roles open to Germany; Indeed and StepStone are registered but switched off because their terms forbid scraping). It respects robots.txt, sends one request per second per host, times out after 10 s and identifies as `SqwodJobsBot/1.0`. Then it dedupes by employer + title + city (keeping the version with pay), drops off-topic and cleaning roles, and has Claude classify type, region and employment and write one-sentence EN + DE summaries (it answers "unknown" rather than guess). Pay is parsed in plain code (`parsePay`): only euro amounts count, and netto/brutto is kept as written.
  - Writes `site/src/data/jobs.json` (jobs unseen for 21 days get `expired: true` and stay in the file), appends `jobs-pay.jsonl` (append only, never delete lines; when a job's pay changes, e.g. after a parser fix, a new line with `"correction": true` is added, so readers take the last line per id), and writes the run log `jobs/last-run.json` (counts per source, failures per host).
  - New brands get their careers page found once and saved back into `jobs-brands.json` (`careersUrl`, `ats`).
- **`jobs-alert.mjs`**: the Friday email (up to 10 newest roles, pay first) to the one Resend "Jobs alert" segment, German first with English below (the Resend plan allows 3 segments, so there is no German jobs segment), under the topic "Sqwod Jobs", so its unsubscribe link ends only the alert. Sends nothing if fewer than 3 roles are new; the preview always goes to `jobs/preview.html` (`preview-{en,de}.html` are from the old two-language version).
- **`jobs-indexing.mjs`**: Indexing API ping for the two jobs pages, off while `JOBS_JSONLD_ON_LIST` in `site/src/config/seo.mjs` is false (see `BUILD-NOTES.md`).
- **`jobs-week.mjs`**: shared helpers. On Fridays with ≥ 3 new roles, `cascade.mjs` writes a "5 jobs this week" list (`jobsWeek`) after Money movement in the Daily, and `digest.mjs` adds one line to the morning review email.
- **`.github/workflows/jobs.yml`**: scrape Thursdays 18:00 Berlin (the commit triggers the deploy), alert Fridays 08:00 Berlin; both can also be started by hand.
- **Secrets / variables:** `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (free at developer.adzuna.com; without them Adzuna is skipped and the run log says so), `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, variables `RESEND_SEGMENT_JOBS_EN`, `RESEND_SEGMENT_JOBS_DE`, `JOBS_FROM`. The BA API needs none.

```bash
node automation/jobs.mjs --selftest     # pay parser, dedupe, regions, robots, expiry
node automation/jobs.mjs --dry          # fetch and count, write nothing but jobs/last-run-dry.json
node automation/jobs.mjs --discover     # only find careers pages for jobs-brands.json
node automation/jobs.mjs --since=7      # postings from the last 7 days (default 14)
node automation/jobs-alert.mjs --dry    # build the email, save the preview, send nothing
```

## Run it locally
```bash
node automation/ingest.mjs            # writes today's source from live news
node automation/cascade.mjs           # rewrites it into the Daily (dry-run without a key)
node automation/audio.mjs             # synth MP3s + rebuild podcast feeds (dry-run without a key)
node automation/audio.mjs --feeds-only   # just rebuild the RSS feeds from existing MP3s
node automation/newsletter.mjs        # render the HTML email (EN + DE) with sponsor slot
node automation/verified.mjs          # refresh Trustpilot crowd signal on every review (dry-run without a key)
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
   - `TRUSTPILOT_API_KEY` — turns on live Trustpilot TrustScores for the daily Sqwod Verified refresh (`verified.mjs`). Without it the refresh runs from the researched values in `verified-sources.json`.
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
