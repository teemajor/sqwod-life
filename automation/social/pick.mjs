#!/usr/bin/env node
// Picks this week's social units and writes automation/social/out/week.json.
//
//   node automation/social/pick.mjs [--week 2026-W36] [--dry]
//
// Rules that matter:
//   - One unit per slot, each slot preferring a different stream, so a week is
//     never four reviews in a row.
//   - The ledger (ledger.json) records every id ever shipped with its date; an
//     id inside its cooldown is skipped. That is what stops the run repeating
//     itself the way the daily pipeline once did.
//   - If a preferred stream has nothing eligible, the slot falls through to the
//     freshest eligible candidate from any stream rather than shipping short.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAll } from './sources.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'out');
const LEDGER = path.join(HERE, 'ledger.json');

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const dry = args.includes('--dry');

const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));

// ISO week label, e.g. 2026-W36
function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 864e5 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const week = flag('week') || isoWeek();
const today = new Date();

const ledger = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { shipped: {} };
ledger.shipped ||= {};

const inCooldown = (id) => {
  const last = ledger.shipped[id];
  if (!last) return false;
  const age = (today - new Date(last.date)) / 864e5;
  return age < cfg.cooldownDays;
};

// Freshness beats everything; a Verified review with a strong score gets a nudge
// because it is the unit that actually earns affiliate revenue.
function score(c) {
  const ageDays = c.date ? (today - new Date(c.date)) / 864e5 : 999;
  let s = Math.max(0, 100 - ageDays); // newest first
  if (c.stream === 'verified' && c.score?.value >= 80) s += 12;
  if (c.stream === 'report') s += 8;
  if (c.stream === 'daily') s += 4;
  if (c.gated) s += 6; // gated reports pull email signups
  if (!c.headline) s -= 25; // a card with no line to say is a weak card
  return s;
}

const all = await loadAll(ROOT, cfg);
const eligible = all.filter((c) => !inCooldown(c.id)).sort((a, b) => score(b) - score(a));

const picked = [];
const taken = new Set();

for (const slot of cfg.slots.slice(0, cfg.unitsPerWeek)) {
  const pick =
    eligible.find((c) => !taken.has(c.id) && slot.prefer.includes(c.stream)) ||
    eligible.find((c) => !taken.has(c.id) && !picked.some((p) => p.stream === c.stream)) ||
    eligible.find((c) => !taken.has(c.id));
  if (!pick) continue;
  taken.add(pick.id);
  picked.push({ ...pick, slot: slot.slot, code: `L${String(slot.slot).padStart(2, '0')}` });
}

const manifest = {
  week,
  generatedAt: new Date().toISOString(),
  lang: cfg.lang,
  formats: cfg.formats,
  pool: { total: all.length, eligible: eligible.length },
  units: picked,
};

if (dry) {
  console.log(JSON.stringify(manifest, null, 2));
} else {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'week.json'), JSON.stringify(manifest, null, 2));
  for (const u of picked) ledger.shipped[u.id] = { date: today.toISOString().slice(0, 10), week };
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  console.log(`${week}: picked ${picked.length} units from ${eligible.length} eligible`);
}

for (const u of picked) {
  console.error(`  ${u.code} ${u.stream.padEnd(8)} ${u.date || '—'}  ${u.title}`);
}
