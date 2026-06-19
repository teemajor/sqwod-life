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
 * Env:
 *   ELEVENLABS_API_KEY     enable synthesis
 *   ELEVENLABS_VOICE_EN    voice id for English  (default: multilingual voice)
 *   ELEVENLABS_VOICE_DE    voice id for German   (default: same multilingual voice)
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
// ElevenLabs "multilingual v2" reads EN + DE from one voice; override per language if you like.
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel — multilingual
const VOICE = { en: process.env.ELEVENLABS_VOICE_EN || DEFAULT_VOICE, de: process.env.ELEVENLABS_VOICE_DE || DEFAULT_VOICE };

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
  const out = { intro: '', summary: '', date: '', urlSlug: '', items: [] };
  let cur = null;
  for (const ln of fm.split('\n')) {
    if (/^intro:/.test(ln)) out.intro = jstr(ln);
    else if (/^summary:/.test(ln)) out.summary = jstr(ln);
    else if (/^date:/.test(ln)) out.date = jstr(ln);
    else if (/^urlSlug:/.test(ln)) out.urlSlug = jstr(ln);
    else if (/^\s*-\s*headline:/.test(ln)) { cur = { headline: jstr(ln), dek: '' }; out.items.push(cur); }
    else if (/^\s*dek:/.test(ln) && cur) cur.dek = jstr(ln);
  }
  return out;
}

const scriptFor = (iss, lang) => [
  GREET[lang],
  iss.intro || iss.summary,
  ...iss.items.map((i) => `${i.headline}. ${i.dek}`),
  OUTRO[lang],
].filter(Boolean).join('\n\n');

// rough duration from word count (~150 wpm) when we can't probe the file
const estDuration = (txt) => {
  const secs = Math.max(45, Math.round((txt.split(/\s+/).length / 150) * 60));
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
const hms = (mmss) => { const [m, s] = mmss.split(':').map(Number); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };

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
    for (const lang of langs) {
      const file = join(DAILY, `${date}.${lang}.md`);
      if (!existsSync(file)) { console.log(`· no issue for ${date} (${lang}) — skipping`); continue; }
      const iss = parseIssue(file);
      const script = scriptFor(iss, lang);
      const out = join(AUDIO, `${date}-${lang}.mp3`);
      if (!KEY) { console.log(`· dry-run (no ELEVENLABS_API_KEY): would synth ${script.split(/\s+/).length} words → audio/${date}-${lang}.mp3`); continue; }
      try { await synth(script, lang, out); console.log(`✓ audio (${lang}): ${(statSync(out).size / 1024).toFixed(0)} KB → audio/${date}-${lang}.mp3`); }
      catch (e) { console.error(`✗ TTS failed (${lang}): ${e.message}`); }
    }
  }
  for (const lang of ['en', 'de']) buildFeed(lang);
}
run();
