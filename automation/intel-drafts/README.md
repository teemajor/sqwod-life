# Intelligence drafts (verify → publish)

Auto-drafted Sqwod Intelligence reports land here — **never on the live site.**
The weekly generator (`automation/intelligence-generate.mjs`, workflow
`intel-generate.yml`, Wednesdays) picks the most relevant, not-yet-covered topic from
the Statista fact bank and drafts an EN + DE report into this folder, then emails you.

## To publish a draft
1. Open the `<slug>.en.md` and `<slug>.de.md` here.
2. **Verify every figure** against the real Statista source (extraction is machine-made
   and can be noisy — this is the credibility gate).
3. Fix anything, then **move both files** into `site/src/content/articles/` and **remove
   the `draft: true` line** from the frontmatter. Commit → it goes live.

Nothing here renders until you move it. The `draft: true` flag is a second safety net.
