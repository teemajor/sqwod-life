# Build notes: Tools, Sqwod Jobs, Deal Tracker hero, Daily card C1b (Oct 2026)

Places where the build brief and the repo disagreed. Each one is written down here instead of guessed.

## Step 1
- **No `CLAUDE.md` in the repo.** The brief asks to read it and to update it "if it lists pages". There is none at any level, so nothing was read or updated.
- **Advertise was already in the right-hand cluster.** `Header.astro` already showed Advertise as a plain text link next to EN/DE on desktop (`.adv-link`) and only inside the phone menu (`.nav-adv`). Kept as is; Tools was added between Reports and Verified.
- **Branch.** The brief names `tools-jobs-hero`; this cloud session was set up to develop on `claude/peaceful-planck-e180sg`. Work is committed on `tools-jobs-hero`, as the brief asks.
- **Lighthouse** (v12, installed in a scratch folder, headless Chromium): accessibility 100 on `/en/tools/` and `/de/tools/`.
- **Crumbs.** `global.css` hides `.crumb` site-wide. The brief wants a visible crumb on Tools and the Deal Tracker hero, so both use the site's existing `.kick` label instead.

## Step 2
- **Monthly value chart already exists.** The brief says "never add a chart of deal value by month to this page", and also "keep every existing feature below it (charts …)". Chart 1 on the page *is* "Disclosed deal value per month" (`chartMonths` in `deals.astro`), and it was there before this build. I added nothing and removed nothing. **Tee to decide:** drop `chartMonths` from `charts` (one line) or keep it.
- **Hero sign-up source.** The page has one sign-up box (source `deal-tracker`). The hero button scrolls to it and switches its hidden `source` to `deal-tracker-hero`, so hero sign-ups are counted apart without a second form.
- **Disclosed value** is computed live: $9.1bn on 30 Oct 2026 (the brief's "$21.9BN" was a style example).
- **Dataset JSON-LD**: `validate-richresults.mjs` does not check Dataset, so it was checked by hand after the build: name, description (50 to 5,000 characters), url, creator, distribution and temporalCoverage are all present in EN and DE.
- **Review follow-ups left for Tee** (minor, not fixed): amounts are shown exactly as the source wrote them ("$40 million" next to "$22M"); normalising them belongs in `deals.mjs`. "since 21 Jun" counts from the first money deal, as briefed, although closures in the table go back to 6 Feb 2026. The page meta description now uses the new hero sub-line.
- Without JavaScript a hero sign-up is recorded as `deal-tracker` (the source switch runs in the browser).
