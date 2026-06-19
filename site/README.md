# sqwod.life — site

Bilingual (EN/DE) wellness-industry intelligence & media brand, built on **Astro**.
The repo *is* the CMS: content lives as Markdown with the tagging taxonomy; Claude Code authors, versions, and ships it.

## Run it
```bash
cd site
npm install
npm run dev      # http://localhost:4321  → redirects to /en/
npm run build    # static output in dist/
```

## What's here (scaffold)
- **i18n** — explicit `/en/` + `/de/` routing via the `[lang]` segment; `hreflang` + canonical wired in `Base.astro`; sitemap integration on.
- **Design system** — `src/styles/global.css`, monochrome (ink `#0e0e10` / chalk `#FAFAFA`), default dark. Matches the app brand.
- **Content model** — `src/content/config.ts` enforces the Phase 3 taxonomy (pillar × lang × format × conversion) via zod. Sample bilingual review in `src/content/reviews/`.
- **Components** — `ScoreBadge` (diamond-seed), `ScoreBreakdown` (the 3-part Sqwod Score), `ProductViewer` (drag/touch 3D ring, Three.js).
- **Pages** — home, `verified/` buyer's-guide (ranked by Sqwod Score), `verified/[slug]` review (turns the mockup into a real, data-driven page), `impressum`.

## Wiring still to do (handoff points)
- Replace the `ScoreBadge` SVG path with the **exact app seed path** for a pixel-true mark.
- Connect `infrastructure/` (affiliate adapters + `/go/{offer}` resolver) so prices/links go live — see `../SqwodLife_Verified-Infrastructure_v1.md`.
- Add newsletter (beehiiv), consent (Usercentrics), analytics (Plausible/PostHog) per `../SqwodLife_Stack-Wiki-Roadmap_v1.md`.
- Fonts: drop in the brand typeface; add a real favicon.
- Remaining sections (Daily, Intelligence, Topics, About, legal) — stubs to build out next.

## Notes
- The 3D viewer loads Three.js from CDN and renders a generic ring stand-in; per-product `.glb` (hero products) loads via the asset model in `infrastructure/schemas/product-asset.schema.json`.
- `/go/{slug}` links are placeholders until the affiliate resolver is built.
