# Build notes: Tools, Sqwod Jobs, Deal Tracker hero, Daily card C1b (Oct 2026)

Places where the build brief and the repo disagreed. Each one is written down here instead of guessed.

## Step 1
- **No `CLAUDE.md` in the repo.** The brief asks to read it and to update it "if it lists pages". There is none at any level, so nothing was read or updated.
- **Advertise was already in the right-hand cluster.** `Header.astro` already showed Advertise as a plain text link next to EN/DE on desktop (`.adv-link`) and only inside the phone menu (`.nav-adv`). Kept as is; Tools was added between Reports and Verified.
- **Branch.** The brief names `tools-jobs-hero`; this cloud session was set up to develop on `claude/peaceful-planck-e180sg`. Work is committed on `tools-jobs-hero`, as the brief asks.
- **Lighthouse** (v12, installed in a scratch folder, headless Chromium): accessibility 100 on `/en/tools/` and `/de/tools/`.
