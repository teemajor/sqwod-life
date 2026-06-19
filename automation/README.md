# automation/ — the content cascade

Turns one source document into many formats, in both languages:

```
source → (report → article →) DAILY ITEM → newsletter → social
```

## Run it (no API key needed)
```bash
node automation/cascade.mjs                 # dry-run, newest source
node automation/cascade.mjs --date=2026-06-17
node automation/cascade.mjs --status=review # change the draft status
```
This reads `sources/<date>.json` and writes a **bilingual Sqwod Daily issue** into `../site/src/content/daily/<date>.{en,de}.md` (status `draft`), which the Astro build renders at `/{en,de}/daily/`.

## How it works
- **`sources/`** — each file is the neutral, sourced input for an issue (facts + provenance + the editorial angle). In production these come from the living wiki / Statista ingest.
- **`cascade.mjs`** — the runner. `generate(step, source, lang)` is the single LLM seam.
- **`prompts/cascade.md`** — the instructions the model follows for each step.

## Going live (swap dry-run → LLM)
1. Set `LLM_API_KEY` in the environment → the runner switches out of dry-run.
2. Wire the model call inside `generate()` using `prompts/cascade.md` + `source.facts`, returning content authored natively per language.
3. Schedule it (3×/week at MVP, per the roadmap) via a scheduled task → it drafts each issue; Tee approves; publish.

## Principles baked in
- **Bilingual parity** — every run emits EN + DE as first-class output.
- **Provenance** — every item keeps its `sourceId` → the living wiki.
- **Human-in-the-loop** — output is `draft`; nothing publishes without approval.
- **One pipeline** — the same issue powers the email and the on-site feed.
