# Intelligence drafts (flagship → approve → publish)

Monthly flagship reports land here, **never on the live site.** The generator
(`automation/intelligence-flagship.mjs`, workflow `intel-flagship.yml`, 1st of each month) picks
the richest uncovered Statista study from the chart bank (`automation/intelligence-charts/`),
adds newer public sources by web search, drafts EN + DE natively, checks every number against
the data, and emails Tee an Approve / Reject link.

## Flow
1. Draft arrives here as `<slug>.en.md` + `<slug>.de.md` with a queue item in `../intel-queue/flagship-<slug>.json`.
2. Tee reads the email (word counts, charts, stray-number warnings, links to both files) and taps **Approve** or **Reject**.
3. The 4-hourly `intel-apply.yml` run publishes approved drafts into `site/src/content/articles/`
   (draft line removed, dated that day, study logged in `../intel-flagship-log.json`) or moves rejected ones to `_rejected/`.
4. Published source copies are kept in `_published/`.

## Refreshing the chart bank
The Statista PPTX decks are private (gitignored). When new decks are added to `research/statista/`,
run `node automation/statista-charts.mjs` on the Mac and commit `automation/intelligence-charts/`.

## Manual run
Actions → "Intelligence — monthly flagship report" → Run workflow (optionally force a study id).

`_rejected/` holds the 12 auto-drafts from the retired weekly generator (misread PDF figures, English "German" files). Do not publish them.
