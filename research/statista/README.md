# Statista / data source drop zone (PRIVATE — never published)

Drop your **Statista PDFs and data files here** (subfolders are fine, e.g. `wearables/`,
`recovery/`, `supplements/`). This folder is **git-ignored** so the licensed source
documents are NEVER committed to the public repo or served on the site.

## Why it's private
Statista reports are licensed/copyright. We do **not** republish the PDFs. We:
1. **Extract** the key figures + provenance (report title, page, date) from each file.
2. **Cite** Statista in our published output (with an "as of" date).
3. Publish only our **analysis** — Sqwod Intelligence reports + a citable stats library
   that powers Daily stats and article footnotes. Truth wins; sources are linked/named.

## How it flows
```
research/statista/*.pdf   (private)
        ↓  extract (pdf skill) → facts + provenance
automation/intelligence/facts/*.json   (committed: numbers + citation, no copyrighted text)
        ↓
site/src/content/intelligence/*.md   (gated reports)  +  cited stats in Daily/articles
```

## Naming (helps extraction)
`<topic>-<source>-<year>.pdf` — e.g. `wearables-statista-2026.pdf`,
`recovery-spend-statista-2026.pdf`. Keep the original Statista filename if unsure.

## What gets committed vs not
- ❌ Not committed: everything in this folder except this README.
- ✅ Committed: extracted facts JSON (figures + citation) and the published reports.
