#!/usr/bin/env node
/**
 * Sqwod Daily audio — turns a generated bilingual Daily issue into real podcast
 * episodes (EN + DE) and (re)builds the podcast RSS feeds Apple/Spotify ingest.
 *
 *   node automation/audio.mjs                 # today, both languages
 *   node automation/audio.mjs --date=2026-06-17 --lang=en
 *   node automation/audio.mjs --feeds-only    # just rebuild the RSS feeds
 *
 * TTS uses ElevenLabs when ELEVENLABS_API_KEY is set; without a key it skips
 * audio synthesis and still rebuilds the feeds from whatever MP3s exist
 * (dry-run safe — never crashes the pipeline).
 *
 * Voice selection: the ELEVENLABS_VOICE_EN / ELEVENLABS_VOICE_DE secrets WIN —
 * the operator's chosen voice is authoritative. VOICE_EN / VOICE_DE below are only
 * fallbacks used when the matching secret is unset. The synth log prints which
 * voice id was used and whether it came from the secret or the repo; the preflight
 * also prints the voice NAME when the API key is allowed to read voices.
 *
 * Env:
 *   ELEVENLABS_API_KEY     enable synthesis
 *   ELEVENLABS_VOICE_EN    your chosen English voice id (wins over the repo fallback)
 *   ELEVENLABS_VOICE_DE    your chosen German voice id (wins over the repo fallback)
 *   SITE_URL               public base, default https://sqwod.life
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAILY = join(__dirname, '..', 'site', 'src', 'content', 'daily');
const AUDIO = join(__dirname, '..', 'site', 'public', 'audio');
const PUBLIC = join(__dirname, '..', 'site', 'public');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const SITE = (process.env.SITE_URL || 'https://sqwod.life').replace(/\/$/, '');
const KEY = process.env.ELEVENLABS_API_KEY || '';
// --- Version-controlled Daily voices (rendered by eleven_multilingual_v2) ---
// EN: 'Adam' is an ElevenLabs premade voice (on every account). DE: 'Helmut' is a
// native-German Voice-Library voice — it must be saved in the account behind
// ELEVENLABS_API_KEY (it is). NOTE: env vars still win if set, so once these are
// correct you can clear ELEVENLABS_VOICE_EN/DE to make the repo the source of truth.
// Repo fallbacks (used only when the matching secret is unset). EN: Adam; DE: Helmut.
const VOICE_EN = 'pNInz6obpgDQGcFmaJgB';
const VOICE_DE = 'g1jpii0iyvtRs8fqXsd1';
// YOUR secret WINS. If ELEVENLABS_VOICE_EN/DE is set, that's the voice — full stop.
// (We don't ignore it: the operator's chosen voice is authoritative. The repo
// values above are only a fallback for when no secret is set.)
const VOICE = { en: process.env.ELEVENLABS_VOICE_EN || VOICE_EN, de: process.env.ELEVENLABS_VOICE_DE || VOICE_DE };
const VSRC = { en: process.env.ELEVENLABS_VOICE_EN ? 'secret' : 'repo', de: process.env.ELEVENLABS_VOICE_DE ? 'secret' : 'repo' };
if (KEY) console.log(`· Daily voices — EN: ${VOICE.en} (${VSRC.en}) · DE: ${VOICE.de} (${VSRC.de})`);

const SHOW = {
  en: { title: 'Sqwod Daily', desc: 'Your 5-minute audio rundown of the business of fitness and wellness — every weekday. From Sqwod.', author: 'Sqwod', owner: 'Sqwod', email: 'hello@sqwod.life' },
  de: { title: 'Sqwod Daily', desc: 'Dein 5-Minuten-Audio-Rundown zum Business von Fitness und Wellness — jeden Werktag. Von Sqwod.', author: 'Sqwod', owner: 'Sqwod', email: 'hello@sqwod.life' },
};
const GREET = { en: "It's Sqwod Daily — the business of fitness in five minutes, minus the boring parts. Let's get into it.", de: 'Hier ist Sqwod Daily — das Business von Fitness in fünf Minuten, ohne den langweiligen Teil. Los geht’s.' };
const OUTRO = { en: "And that's your Sqwod Daily. Go get one rep better — see you tomorrow.", de: 'Und das war dein Sqwod Daily. Werd eine Rep besser — bis morgen.' };

// --- tiny frontmatter reader (no deps; cascade writes JSON-quoted values) ---
const jstr = (line) => { const m = line.match(/"(?:[^"\\]|\\.)*"/); return m ? JSON.parse(m[0]) : ''; };
function parseIssue(file) {
  const text = readFileSync(file, 'utf8');
  const fm = (text.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  const out = { intro: '', summary: '', date: '', urlSlug: '', audioScript: '', items: [], sponsor: null };
  let cur = null, inSponsor = false;
  for (const ln of fm.split('\n')) {
    if (/^sponsor:/.test(ln)) { inSponsor = true; out.sponsor = {}; continue; }
    if (inSponsor) {
      if (/^\s+\w+:/.test(ln)) {
        const k = ln.trim().split(':')[0];
        out.sponsor[k] = jstr(ln);
        continue;
      }
      inSponsor = false; // dedent → sponsor block ended
    }
    if (/^audioScript:/.test(ln)) out.audioScript = jstr(ln);
    else if (/^intro:/.test(ln)) out.intro = jstr(ln);
    else if (/^summary:/.test(ln)) out.summary = jstr(ln);
    else if (/^date:/.test(ln)) out.date = jstr(ln);
    else if (/^urlSlug:/.test(ln)) out.urlSlug = jstr(ln);
    else if (/^\s*-\s*headline:/.test(ln)) { cur = { headline: jstr(ln), dek: '' }; out.items.push(cur); }
    else if (/^\s*dek:/.test(ln) && cur) cur.dek = jstr(ln);
  }
  return out;
}

const sponsorRead = (sp, lang) => {
  if (!sp || !sp.name) return '';
  const lead = lang === 'de' ? `Kurze Werbepause — präsentiert von ${sp.name}.` : `Quick word from today's sponsor, ${sp.name}.`;
  return [lead, sp.blurb].filter(Boolean).join(' ');
};
const scriptFor = (iss, lang) => {
  const sponsor = sponsorRead(iss.sponsor, lang);
  // Preferred path: the cascade authored a real spoken brief (written for the ear).
  // Use it verbatim; inject the sponsor read between paragraphs (roughly mid-roll).
  if (iss.audioScript && iss.audioScript.trim()) {
    if (!sponsor) return iss.audioScript.trim();
    const paras = iss.audioScript.trim().split('\n').filter(Boolean);
    const mid = Math.max(1, Math.floor(paras.length / 2));
    return [...paras.slice(0, mid), sponsor, ...paras.slice(mid)].join('\n\n');
  }
  // Fallback (dry-run / legacy issues with no authored script): stitch from frontmatter.
  const half = Math.ceil(iss.items.length / 2);
  const itemLines = iss.items.map((i) => `${i.headline.replace(/[.!?]+$/, '')}. ${i.dek}`);
  const body = sponsor
    ? [...itemLines.slice(0, half), sponsor, ...itemLines.slice(half)]
    : itemLines;
  return [GREET[lang], iss.intro || iss.summary, ...body, OUTRO[lang]].filter(Boolean).join('\n\n');
};

// rough duration from word count (~150 wpm) when we can't probe the file
const estDuration = (txt) => {
  const secs = Math.max(45, Math.round((txt.split(/\s+/).length / 150) * 60));
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
const hms = (mmss) => { const [m, s] = mmss.split(':').map(Number); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };

// GitHub Actions–visible logging: ::error:: shows up red in the run + annotations.
const CI = !!(process.env.GITHUB_ACTIONS || process.env.CI);
const ghError = (msg) => { if (CI) console.log(`::error title=Sqwod audio::${msg}`); console.error(`✗ ${msg}`); };
const summary = (line) => { try { if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n', { flag: 'a' }); } catch {} };

// Preflight: confirm the key works and each voice id is real BEFORE we try to synth.
// Turns a silent green run into a clear, actionable error.
async function preflight(langs) {
  if (!KEY) { ghError('ELEVENLABS_API_KEY is empty in this job. Check the secret name/scope (repo Settings → Secrets → Actions → ELEVENLABS_API_KEY).'); return false; }
  // Validate the key against the account. A least-privilege key scoped to only
  // Text-to-Speech legitimately lacks `user_read`/`voices_read` — that must NOT
  // block synthesis. Only a genuinely invalid/expired key (a non-permission 401,
  // or 403) should hard-fail here; "missing_permissions" means the key is fine,
  // just narrowly scoped, so we proceed and let synth be the real test.
  const who = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': KEY } });
  if (!who.ok) {
    const body = await who.text();
    if (!(who.status === 401 && /missing_permissions/.test(body))) {
      ghError(`ElevenLabs key rejected (${who.status}). ${body.slice(0, 160)}`); return false;
    }
    console.log('· ElevenLabs key is scoped to TTS only (no user_read) — skipping account probe, proceeding.');
  }
  // Validate each voice id we'll use; tolerate a permission-scoped key (verify at synth).
  let ok = true;
  for (const lang of langs) {
    const id = VOICE[lang];
    const v = await fetch(`https://api.elevenlabs.io/v1/voices/${id}`, { headers: { 'xi-api-key': KEY } });
    if (v.ok) { const j = await v.json().catch(() => ({})); console.log(`· voice ${lang}: "${j.name || id}" ✓`); }
    else if (v.status === 401) { console.log(`· voice ${lang}: scoped key — skipping voice probe, will verify at synth.`); }
    else { ghError(`Voice id for ${lang.toUpperCase()} ("${id}") is invalid (${v.status}). Check ELEVENLABS_VOICE_${lang.toUpperCase()}.`); ok = false; }
  }
  return ok;
}

async function synth(script, lang, outPath) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE[lang]}`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: script, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
}

const rfc822 = (d) => new Date(d + 'T06:00:00Z').toUTCString();
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildFeed(lang) {
  if (!existsSync(DAILY)) return;
  const files = readdirSync(DAILY).filter((f) => f.endsWith(`.${lang}.md`)).sort().reverse();
  const items = [];
  for (const f of files) {
    const iss = parseIssue(join(DAILY, f));
    const date = iss.date || f.slice(0, 10);
    const mp3 = join(AUDIO, `${date}-${lang}.mp3`);
    if (!existsSync(mp3)) continue;                       // only publish episodes that have audio
    const url = `${SITE}/audio/${date}-${lang}.mp3`;
    const len = statSync(mp3).size;
    const dur = hms(estDuration(scriptFor(iss, lang)));
    const niceDate = new Date(date + 'T06:00:00Z').toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const notes = [iss.summary || iss.intro, ...iss.items.map((i) => `• ${i.headline} — ${i.dek}`)].filter(Boolean).join('\n');
    items.push(
      `    <item>
      <title>${xml(`Sqwod Daily — ${niceDate}`)}</title>
      <description>${xml(notes)}</description>
      <pubDate>${rfc822(date)}</pubDate>
      <enclosure url="${url}" length="${len}" type="audio/mpeg"/>
      <guid isPermaLink="true">${url}</guid>
      <itunes:duration>${dur}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <link>${SITE}/${lang}/daily/${date}</link>
    </item>`
    );
  }
  const s = SHOW[lang];
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xml(s.title)}</title>
    <link>${SITE}/${lang}/daily</link>
    <language>${lang}</language>
    <description>${xml(s.desc)}</description>
    <itunes:author>${xml(s.author)}</itunes:author>
    <itunes:summary>${xml(s.desc)}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Health &amp; Fitness"/>
    <itunes:category text="Business"/>
    <itunes:owner><itunes:name>${xml(s.owner)}</itunes:name><itunes:email>${s.email}</itunes:email></itunes:owner>
    <itunes:image href="${SITE}/podcast-cover.png"/>
    <image><url>${SITE}/podcast-cover.png</url><title>${xml(s.title)}</title><link>${SITE}/${lang}/daily</link></image>
${items.join('\n')}
  </channel>
</rss>
`;
  const out = lang === 'en' ? join(PUBLIC, 'podcast.xml') : join(PUBLIC, `podcast.${lang}.xml`);
  writeFileSync(out, feed);
  console.log(`✓ feed (${lang}): ${items.length} episode(s) → site/public/${lang === 'en' ? 'podcast.xml' : `podcast.${lang}.xml`}`);
}

async function run() {
  mkdirSync(AUDIO, { recursive: true });
  const langs = args.lang ? [args.lang] : ['en', 'de'];
  const date = args.date || new Date().toISOString().slice(0, 10);

  if (!args['feeds-only']) {
    const ready = await preflight(langs);
    if (!ready) {
      summary('### 🔇 Sqwod Daily audio: SKIPPED — ElevenLabs preflight failed (see ::error:: above).');
      if (!KEY && !CI) console.log('· local dry-run (no ELEVENLABS_API_KEY) — rebuilding feeds only');
    } else {
      let made = 0;
      for (const lang of langs) {
        const file = join(DAILY, `${date}.${lang}.md`);
        if (!existsSync(file)) { console.log(`· no issue for ${date} (${lang}) — skipping`); continue; }
        const iss = parseIssue(file);
        const script = scriptFor(iss, lang);
        const out = join(AUDIO, `${date}-${lang}.mp3`);
        try {
          await synth(script, lang, out);
          const kb = (statSync(out).size / 1024).toFixed(0);
          console.log(`✓ audio (${lang}): ${kb} KB → audio/${date}-${lang}.mp3`);
          summary(`- ✅ Audio ${lang.toUpperCase()} — ${kb} KB → \`audio/${date}-${lang}.mp3\``);
          made++;
        } catch (e) { ghError(`TTS failed (${lang}): ${e.message}`); }
      }
      if (made === 0 && KEY) ghError(`No audio produced for ${date} (issue files missing or every synth call failed).`);
    }
  }
  for (const lang of ['en', 'de']) buildFeed(lang);
}
run();
