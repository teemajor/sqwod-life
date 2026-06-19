# sqwod.life

Bilingual (EN/DE) intelligence & media brand for the wellness industry — the top-of-funnel hub for the Sqwod ecosystem.

This repo contains the website, the content-automation pipeline, the affiliate/asset infrastructure, and the strategy docs.

## Layout
- `site/` — the website (Astro, static). The repo *is* the CMS: content lives as Markdown in `site/src/content/`.
- `automation/` — the content cascade (one source → bilingual Daily/articles). See `automation/README.md`.
- `infrastructure/` — affiliate network registry + data-model schemas (wire up when keys are ready).
- `brand/` — the app brand handoff (monochrome system, CoachThinking component).
- `SqwodLife_*.md` — strategy & spec documents.

## Run locally
```bash
cd site
npm install
npm run dev      # http://localhost:4321
npm run build    # static output → site/dist
```

## Deploy (GitHub Pages, free, custom domain)
1. Push this repo to GitHub.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds `site/` and publishes on every push to `main`.
4. Custom domain `sqwod.life` is set via `site/public/CNAME`; point your DNS at GitHub Pages to activate it.

Alternatively, connect this repo to **Vercel** or **Cloudflare Pages** (root directory: `site`) for a one-click hosted URL.

## Next to go live
- Wire `automation/cascade.mjs` `generate()` to an LLM (set `LLM_API_KEY`) + schedule it.
- Connect the email platform (signup + Sqwod Daily).
- Connect affiliate networks + build the `/go` resolver (see `infrastructure/`).
