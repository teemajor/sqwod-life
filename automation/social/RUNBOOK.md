# Weekly social run — runbook

Four units a week for sqwod.life, English only. Each unit is a 1080×1350 post
(native to both the Instagram feed and LinkedIn) and a 1080×1920 story
(Instagram only), plus an Instagram caption and a LinkedIn caption.

Nothing on the image names a platform. Instagram carries the link in bio and on
the story sticker; LinkedIn carries it in the post, where it is clickable.

## Where things live

| Thing | Where |
| --- | --- |
| Code | `automation/social/` in `github.com/teemajor/sqwod-life` (public clone, no auth) |
| Design source | `Sqwod Life Social - EN.dc.html` (layout) + Sqwod V1 Visual Direction (colour and type) |
| Drive folder | **Sqwod Social** — `1Iy6Zb2ZodAGt4rRu5jrjHFATVvqgMwPQ` |
| Ledger | `ledger.json` inside that Drive folder — **the only copy that persists** |

## The run

```bash
git clone --depth 1 https://github.com/teemajor/sqwod-life.git repo
cd repo
mkdir -p node_modules
ln -sfn "$(npm root -g)/playwright" node_modules/playwright
ln -sfn "$(npm root -g)/playwright-core" node_modules/playwright-core

# ledger.json comes from Drive first — see below
node automation/social/pick.mjs --ledger /tmp/ledger.json
node automation/social/render.mjs
```

1. **Fetch the ledger** from the Drive folder and save it to `/tmp/ledger.json`.
   If it isn't there, start from `{"shipped":{}}`.
2. **Pick** — writes `automation/social/out/week.json` and updates the ledger
   with what it chose. Slot 1 prefers a Verified review, slot 2 the Daily or a
   report, slot 3 an Intel article, slot 4 a Sqwod Pod Journal post, so a week
   is never four of the same thing. Anything shipped in the last 120 days is
   skipped.
3. **Render** — writes eight PNGs to `automation/social/out/png/<week>/`.
   The run fails loudly if Geist did not load, and warns on any board whose
   content overflows its frame. Check that warning; it means the copy needs
   tightening, not that the PNG is fine.
4. **Write the captions yourself.** There is deliberately no caption template —
   templated captions read like templates. Rules below.
5. **Deliver** the eight PNGs with SendUserFile so Tee can save them to Photos
   from his phone.
6. **Upload the captions** as a plain-text file to a new `<week>` subfolder of
   the Drive folder, so he can copy-paste them on the phone.
7. **Write the updated ledger back to Drive**, replacing the old one. Skipping
   this means next week re-ships this week's units.

## Caption rules

**Instagram** — three short paragraphs. Lead with the most specific fact on the
board (a score, a figure, a named company), not a wind-up. Ends with
`Link in bio.`

**LinkedIn** — longer, written for an operator. Open with the uncomfortable
version of the point. Full URL inline on its own line. Exactly three hashtags.

Both: no emoji, no "excited to share", no rhetorical questions as openers. Voice
is rebel, creator-first, anti-big-box — direct, a little cheeky, never breathless.

On any Verified unit, add a note that the affiliate disclosure belongs in the
first comment on both platforms.

## Design notes

Colour is Sqwod V1: six semantic tokens, monochrome, light canonical. The acid
green from the original canvas is gone. `signal` (the one living colour) is
reserved for live physiology and is deliberately unavailable to these boards.

The inversion device replaces the accent — Verified, reports and analysis run on
warm off-white; Signal, Journal and Daily run on near-black; the CTA always fills
with the opposite end of the scale. Roughly half the week is light, half dark, so
four boards read as a set.

Type is Geist throughout: display 600 at tight tracking, body 400–500, data in
Geist Mono.

## Known gaps

- Intel articles often ship with empty `figures` and `takeaways` frontmatter, so
  a data-led board falls back to the description. Authoring a figure on the
  article is the real fix.
- The Daily board's three lines are split from the `summary` field on `", "` and
  `" & "`. A summary written as one clause gives one line instead of three.
- German is not wired up. The picker takes `lang` from `config.json`; the
  templates carry English CTA labels inline.
