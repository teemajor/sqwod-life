# sqwod.life

Bilingual (EN/DE) intelligence & media brand for the business of fitness & wellness — part of the Sqwod ecosystem.

The repo **is** the CMS: content lives as Markdown in `site/src/content/`, automation scripts generate that content from cited sources, and GitHub Actions publish it to GitHub Pages.

---

## Strategic focus (as of June 2026)

This is a **creator-led media revenue engine**, not a pod funnel. Founder Tee Major has a real audience (YouTube ~150k, Facebook ~350k, IG ~10k, X ~3k) — distribution is the unfair advantage, so the build optimizes for converting that reach into an **owned email list** and monetizing it.

- **North-star metric:** engaged email subscribers (the asset both revenue lines need).
- **Revenue, in order:** affiliate first (fast, no gatekeeper, fits the consumer audience) → consumer/DTC sponsorship as the list scales. Gated Intelligence reports + the daily build the list.
- **Editorial law:** every piece is *problem → solution → the thing that monetizes it*. "Emotion creates motion."
- **Audience–offer fit:** the audience is consumer/prosumer fitness — lean consumer for affiliate; the operator/industry layer is the credibility halo (and Tee's authentic voice).
- **Bilingual:** lead EN (where the audience is); DE compounds as the longer-term "source in the German market" play.

## Content lanes (taxonomy)

Four reader-facing lanes; the granular content type is a `type` sub-tag under each (so founder-stories, AI/prompts, case studies etc. are all preserved):

| Lane | What | Sub-types (`type`) | Monetizes via |
|---|---|---|---|
| **MOVE** | training, technique, recovery | method, programming, recovery, technique | gear affiliate |
| **BUILD** | operators: clients, retention, pricing, ops, marketing, founders, AI | coaching-business, marketing, founder-story, case-study, ai-automation | Sqwod products + B2B sponsors |
| **GEAR** | what to buy & why | wearables, buyers-guide, tool-review | affiliate (Sqwod Verified) |
| **SIGNAL** | market data, trends, policy | market-data, trends, policy | sponsor credibility + DE source play |

Schema: `site/src/content/config.ts`. Labels/icons + `typeLabel()`: `site/src/i18n/pillars.ts`.

---

## Architecture

- `site/` — Astro static site, i18n `/en/` + `/de/`. Sections: home, daily (Sqwod Daily), articles (the 4 lanes), intelligence (gated living reports), verified (affiliate reviews + Sqwod Score), press, play, subscribe.
- `automation/` — the content engines (dependency-free Node + one Python script). See `automation/README.md`.
- `infrastructure/` — Cloudflare Workers + schemas (subscribe capture, press intake, swag fulfilment) + affiliate registry.
- `research/statista/` — private Statista source PDFs (gitignored; never published).
- `brand/` — Sqwod brand handoff (monochrome system).
- `SqwodLife_*.md` / `SqwodPod_*.md` — strategy & spec docs. `council-*` — LLM-council decision records.

### Automation pipeline (GitHub Actions)

| Workflow | Schedule | Does |
|---|---|---|
| `content.yml` | weekdays ~06:00 Berlin | `ingest` (global news + trade RSS) → `cascade` (bilingual Daily, fact-checked, auto-publish) → `audio` (ElevenLabs TTS + podcast feeds) → `newsletter` (email HTML) → commit → `send` (Resend broadcast) → heartbeat |
| `articles.yml` | Tue + Fri | `articles.mjs` — synthesizes problem→solution playbooks (BUILD) + trend briefs (SIGNAL/MOVE) from the cited news pool, EN+DE; never invents figures |
| `press.yml` | hourly | screen + publish submitted press releases |
| `leads.yml` | Mondays | weekly idea/source queue |
| `deploy.yml` | on push to `main` | build `site/` → GitHub Pages |

Scripts: `ingest.mjs` · `cascade.mjs` · `audio.mjs` · `newsletter.mjs` · `send.mjs` · `articles.mjs` · `press.mjs` · `leads.mjs` · `intelligence.py` (Statista fact-bank extractor — triage, human-verified before use).

### Stack
Astro · GitHub Pages · GitHub Actions · Anthropic API (claude-sonnet-4-6) · ElevenLabs (TTS) · **Resend** (email list + broadcasts) · Cloudflare Workers (capture, press intake) · Stripe (paid press).

> Note: email moved from beehiiv → **Resend** (beehiiv's Send API is Enterprise-only). `infrastructure/beehiiv/` is legacy.

---

## Run locally
```bash
cd site
npm install
npm run dev      # http://localhost:4321
npm run build    # static output → site/dist
```
Automation dry-runs (no keys needed) print what they'd do:
```bash
node automation/ingest.mjs --date=$(date +%F)
node automation/articles.mjs --lane=build --days=5
```

## Required secrets / config
- GitHub Actions secrets: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_EN/DE`, `RESEND_API_KEY`, `RESEND_AUDIENCE_EN/DE`; vars `RESEND_FROM`, `RESEND_REPLY_TO`.
- Cloudflare subscribe Worker (`infrastructure/subscribe/`): secret `RESEND_API_KEY`, var `RESEND_SEGMENT_EN/DE`. Endpoint wired in `site/src/config/subscribe.ts`.

## Status / next
- ✅ Live: site, bilingual auto-Daily + audio, Resend send + capture worker, gated report lead-magnet, share bars, 4-lane taxonomy, globalized/diversified sources, article engine.
- ⏳ Pending: verify `sqwod.life` domain in Resend (for sending); quality pass on the article-engine voice after first real run; **Move-of-the-Day** queue (iOS Shortcut → Sheet → Daily); signup self-segmentation tag (operator vs enthusiast); affiliate programs approved + links live.
