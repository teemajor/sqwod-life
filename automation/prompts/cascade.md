# Cascade prompts — production reference

These are the instructions the model follows at each step. The runner's `generate(step, source, lang)` feeds the step prompt + the source's **neutral facts** (never the pre-authored block) and must return content **authored natively in `lang`** — never translated after.

Global rules for every step:
- Voice: **Morning Brew for the business of fitness** — smart, witty, conversational, a little cheeky; rebel and operator-first; data-grounded but never dry. Facts airtight, delivery fun. We speak to a fun audience (coaches, trainers, studio founders, operators), so we have a bit of fun — one light joke/pun/wink per item max, and clarity always wins over the bit. Every stat ends in a "so what." German is authored native, never translated jokes.
- Cite the source. Each fact maps to `source.provenance` / `source.id` → the living wiki. Follow `EDITORIAL.md`: source claims to authority/evidence; virality (LinkedIn/X) is a signal of what's relevant/actionable, never a citation — verify against an authoritative source.
- Produce EN **and** DE as first-class outputs. German is authored, not post-processed.
- Tag with `pillar` + `conversion` from the source.
- Human-in-the-loop: output `status: draft`; Tee approves before publish.

---

## Step: report  (Sqwod Intelligence, flagship, gated)
Input: full source facts. Output: long-form report — context, the data, what it means for operators, methodology/citations. ~800–1500 words. Gated.

## Step: article  (Analysis, one pillar angle)
Input: the report + source. Output: one pillar-specific angle (e.g. the coaching implication). ~600–900 words. Links to the report.

## Step: daily-item  (Sqwod Daily)  ← implemented in the runner
Input: source facts.
Output JSON: `{ headline, dek, readMore? }`
- `headline`: ≤ 70 chars, the sharpest hook, ideally leads with the number.
- `dek`: 1–2 sentences, the "so what" for a coach/operator. End actionable.
- `readMore`: link to the article/review if one exists.

## Step: newsletter  (compile)
Input: the day's approved daily items. Output: the Sqwod Daily email — intro line + items + one sponsor slot ("Presented by / Präsentiert von"). Same content as the on-site issue (one pipeline).

## Step: social  (reach)
Input: the daily item + chart. Output: caption + on-screen text in Tee's voice (use the tee-major-content skill). Variants for 9:16 and 1:1. Feeds the video step (Remotion) where applicable.
