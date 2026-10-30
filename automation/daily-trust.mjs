#!/usr/bin/env node
/**
 * Daily trust check (30 Oct 2026). Runs in content.yml after the email is rendered and
 * BEFORE the commit and send. Decides whether today's Daily may go out on its own.
 *
 *   node automation/daily-trust.mjs --date=2026-10-30 [--log=/tmp/cascade.log] [--no-hold]
 *
 * Writes automation/intel-queue/daily-<date>.json so the morning review email shows the
 * issue with its trust line. Two kinds of findings:
 *   HOLD  a problem a reader could see (old news, an ad, a missing source link, a number
 *         no story backs, a repeat story, EN and DE disagreeing, fewer than 3 stories, a
 *         Sqwod rec pointing at a page that does not exist). The issue is set to status
 *         "review" in EN + DE (not built, not in any feed), the send is skipped, and Tee
 *         decides in the review email: Publish sends it, Note fixes then sends, Skip drops
 *         it. Undecided by 10:00 Berlin, it goes out anyway (daily-release.mjs --auto).
 *   NOTE  worth knowing, already handled by the guards (an item rewritten from its source,
 *         the plain fallback audio script). Shown in the email; the issue still ships.
 * Prints hold=true|false to $GITHUB_OUTPUT.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { staleReason, isLabelledAd } from './article.mjs';
import { ROOT, QUEUE, writeJson, readJson, berlin } from './review-lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const date = args.date || new Date().toISOString().slice(0, 10);
const DAILY = join(ROOT, 'site', 'src', 'content', 'daily');
const file = (lang, d = date) => join(DAILY, `${d}.${lang}.md`);

// --- tiny readers for the cascade's JSON-quoted frontmatter ---
const jstr = (s) => { const m = String(s).match(/"(?:[^"\\]|\\.)*"/); try { return m ? JSON.parse(m[0]) : ''; } catch { return ''; } };
function parse(raw) {
  const fm = (raw.match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
  const lines = fm.split('\n');
  const top = (k) => jstr((lines.find((l) => l.startsWith(`${k}:`)) || '').slice(k.length + 1));
  const block = (k) => { const i = lines.findIndex((l) => l === `${k}:`); if (i < 0) return []; const out = []; for (let j = i + 1; j < lines.length && /^\s/.test(lines[j]); j++) out.push(lines[j]); return out; };
  const items = []; let cur = null;
  for (const l of block('items')) {
    if (/^\s+-\s+headline:/.test(l)) { cur = { headline: jstr(l.split('headline:')[1]) }; items.push(cur); continue; }
    const m = l.match(/^\s+(\w+):\s*(.*)$/); if (cur && m) cur[m[1]] = jstr(m[2]) || m[2].trim();
  }
  const kv = (blk) => Object.fromEntries(blk.map((l) => l.match(/^\s+-?\s*(\w+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], jstr(m[2]) || m[2].trim()]));
  const money = []; let mm = null;
  for (const l of block('moneyMoves')) { if (/^\s+-\s+entity:/.test(l)) { mm = { entity: jstr(l.split('entity:')[1]) }; money.push(mm); continue; } const m = l.match(/^\s+(\w+):\s*(.*)$/); if (mm && m) mm[m[1]] = jstr(m[2]); }
  const recs = []; let rc = null;
  for (const l of block('recs')) { if (/^\s+-\s+label:/.test(l)) { rc = { label: jstr(l.split('label:')[1]) }; recs.push(rc); continue; } const m = l.match(/^\s+(\w+):\s*(.*)$/); if (rc && m) rc[m[1]] = jstr(m[2]) || m[2].trim(); }
  return { summary: top('summary'), status: top('status'), intro: top('intro'), items, stat: kv(block('stat')), money, recs, connect: kv(block('connectDots')) };
}

const numberIn = (num, text) => {
  const t = String(text || '').replace(/\s/g, '');
  const tokens = String(num || '').match(/\d+(?:[.,]\d+)*/g) || [];
  return tokens.every((tok) => {
    const core = tok.replace(/[.,]0+$/, '');
    return [core, core.replace(/,/g, '.'), core.replace(/\./g, ','), core.replace(/[.,]/g, '')].some((v) => v && t.includes(v));
  });
};

export function trust(day, log = '') {
  const date = day;
  const hold = [], note = [];
  const en = existsSync(file('en', day)) ? parse(readFileSync(file('en', day), 'utf8')) : null;
  const de = existsSync(file('de', day)) ? parse(readFileSync(file('de', day), 'utf8')) : null;
  if (!en || !de) return { hold: [`Issue file missing (${!en ? 'EN' : 'DE'}).`], note, en, de };

  if (en.items.length < 3) hold.push(`Only ${en.items.length} stories made it through the checks.`);
  if (en.items.length !== de.items.length) hold.push(`EN has ${en.items.length} stories, DE has ${de.items.length}.`);

  for (const [lang, iss] of [['EN', en], ['DE', de]]) {
    iss.items.forEach((it, i) => {
      const txt = `${it.headline}. ${it.dek || ''}`;
      if (!/^https?:\/\//.test(it.readMore || '')) hold.push(`${lang} story ${i + 1} has no source link.`);
      if (isLabelledAd(txt)) hold.push(`${lang} story ${i + 1} reads like a labelled ad: "${it.headline.slice(0, 60)}".`);
      const why = staleReason(txt, date, it.headline);
      if (why) hold.push(`${lang} story ${i + 1} may be old news (${why}): "${it.headline.slice(0, 60)}".`);
    });
  }

  // Every number in the stat box and the money moves must appear in a story or the connect-the-dots text.
  const backing = [...en.items.map((i) => `${i.headline} ${i.dek}`), en.connect.body || ''].join(' ');
  if (en.stat.number && !numberIn(en.stat.number, backing)) hold.push(`Stat box "${en.stat.number}" is not in any story text.`);
  for (const m of en.money) if (m.amount && !numberIn(m.amount, backing)) hold.push(`Money move ${m.entity} ${m.amount} is not in any story text.`);

  // Same source link as one of the last 5 live issues = a repeat story.
  const prev = readdirSync(join(ROOT, 'site', 'src', 'content', 'daily')).filter((f) => f.endsWith('.en.md') && f < `${date}.en.md`).sort().slice(-5);
  const seen = new Map();
  for (const f of prev) { const iss = parse(readFileSync(join(DAILY, f), 'utf8')); if (iss.status !== 'published') continue; for (const it of iss.items) if (it.readMore) seen.set(it.readMore, f.slice(0, 10)); }
  en.items.forEach((it, i) => { if (seen.has(it.readMore)) hold.push(`Story ${i + 1} already ran on ${seen.get(it.readMore)}: "${it.headline.slice(0, 60)}".`); });

  // Sqwod recs must point at pages that exist.
  for (const r of en.recs) {
    const m = String(r.url || '').match(/^\/(en|de)\/verified\/([\w-]+)/);
    if (m && !existsSync(join(ROOT, 'site', 'src', 'content', 'reviews', `${m[2]}.${m[1]}.md`))) hold.push(`Rec "${r.text || r.label}" links to a review that does not exist (${r.url}).`);
  }

  // What the guards already fixed (from the cascade log).
  const count = (rx) => (log.match(rx) || []).length;
  const repaired = count(/↻ (EN|DE) repaired item/g), dropped = count(/⛔ (EN|DE) dropped \d+ item\(s\) still unsupported/g);
  if (repaired) note.push(`${repaired} story text(s) were rewritten from their source after a claim check.`);
  if (dropped) note.push(`${dropped} story(ies) were dropped because a claim could not be backed.`);
  if (/plain fallback script/.test(log)) note.push('The podcast uses the plain fallback script today.');
  if (/removed unsupported framing/.test(log)) note.push('Unsupported framing was removed from the intro or connect-the-dots text.');
  if (!existsSync(join(ROOT, 'site', 'public', 'audio', `${date}-en.mp3`))) note.push('No EN audio for today.');
  const dash = [en, de].some((iss) => /—/.test(JSON.stringify(iss)));
  if (dash) note.push('Em dash found in the issue text.');
  return { hold: [...new Set(hold)], note, en, de };
}

function setStatus(lang, status) {
  const p = file(lang); if (!existsSync(p)) return;
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^status:\s*.*$/m, `status: "${status}"`));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const log = args.log && existsSync(args.log) ? readFileSync(args.log, 'utf8') : '';
  const t = trust(date, log);
  if (!t.en && !t.de) { console.log(`No issue for ${date}: nothing to check.`); process.exit(0); }
  // Too late to wait for the 07:30 review email (GitHub ran the Daily hours late): send with the findings as notes.
  const late = berlin().hour * 60 + berlin().minute >= 9 * 60 + 30;
  if (late && t.hold.length) { t.note.unshift(...t.hold.map((h) => `Not held (run too late to wait for review): ${h}`)); t.hold = []; }
  const holding = t.hold.length > 0 && !args['no-hold'];
  mkdirSync(QUEUE, { recursive: true });
  const id = `daily-${date}`, path = join(QUEUE, `${id}.json`);
  const prev = readJson(path, {});
  writeJson(path, {
    ...prev, id, kind: 'daily', date,
    title: t.en?.summary || `Sqwod Daily ${date}`, titleDe: t.de?.summary || '',
    status: holding ? 'pending' : 'sent', held: holding,
    flags: t.hold, notes: prev.notes || [], info: t.note, createdAt: date,
  });
  if (holding) { setStatus('en', 'review'); setStatus('de', 'review'); }
  console.log(holding ? `⏸ Daily ${date} HELD for review:\n  - ${t.hold.join('\n  - ')}` : `✓ Daily ${date} passes the trust check${t.note.length ? ` (notes: ${t.note.join(' | ')})` : ''}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `hold=${holding}\n`);
}
