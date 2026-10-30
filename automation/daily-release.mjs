#!/usr/bin/env node
/**
 * Releases a Daily that daily-trust.mjs held for review (30 Oct 2026).
 *
 *   node automation/daily-release.mjs           # act on Tee's decision (Publish / Skip)
 *   node automation/daily-release.mjs --auto    # force the auto rule now (testing)
 *
 * From 10:00 Berlin every run also sends today's held issue if Tee has not decided (the
 * clock decides, so a cancelled 10:00 dispatch is caught by the 10:30 one or any later run).
 *
 * Publish (status "approved") or --auto on a still-pending held issue: set the issue back
 * to status "published" in EN + DE, rebuild the email and the site/podcast feeds, mark the
 * queue item "released", and print release=<date> (and revised=true when a Note rewrote
 * it, so the workflow re-voices the audio) to $GITHUB_OUTPUT. The workflow then commits,
 * pushes (deploy) and sends.
 * Skip (status "rejected"): the issue stays unpublished, the queue item becomes "skipped".
 * Only today's and yesterday's issues are ever released, so an old tap can never send a
 * stale Daily.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, queueItems, writeJson, berlin } from './review-lib.mjs';
const B = berlin();
const autoTime = B.hour >= 10;

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const today = berlin().date;
const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
const DAILY = join(ROOT, 'site', 'src', 'content', 'daily');
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

function setStatus(date, status) {
  for (const lang of ['en', 'de']) {
    const p = join(DAILY, `${date}.${lang}.md`);
    if (existsSync(p)) writeFileSync(p, readFileSync(p, 'utf8').replace(/^status:\s*.*$/m, `status: "${status}"`));
  }
}

let released = '';
for (const it of queueItems().filter((q) => q.kind === 'daily' && q.held).sort((a, b) => b.date.localeCompare(a.date))) {
  const { _path, ...p } = it;
  const recent = p.date === today || p.date === yesterday;
  const go = p.status === 'approved' || ((args.auto || autoTime) && p.status === 'pending' && p.date === today);
  if (go && recent && !released) {
    setStatus(p.date, 'published');
    try {
      execSync(`node automation/newsletter.mjs --date=${p.date}`, { cwd: ROOT, stdio: 'inherit' });
      execSync('node automation/audio.mjs --feeds-only', { cwd: ROOT, stdio: 'inherit' });
    } catch (e) {
      // The issue file is broken (e.g. a bad rewrite): put it back on hold and say so, never block other approvals.
      setStatus(p.date, 'review');
      writeJson(_path, { ...p, status: 'pending', revisionError: `the issue could not be rendered: ${String(e.message).slice(0, 160)}` });
      console.log(`✗ Daily ${p.date} could not be rendered; kept on hold`);
      continue;
    }
    writeJson(_path, { ...p, held: false, status: 'released', releasedAt: new Date().toISOString(), releasedBy: p.status === 'approved' ? 'Tee' : 'auto 10:00' });
    released = p.date;
    console.log(`▶ Daily ${p.date} released (${p.status === 'approved' ? 'approved' : 'auto at 10:00, no decision'})`);
    out('release', p.date);
    if (p.revisedAt) out('revised', 'true');
  } else if (p.status === 'rejected') {
    writeJson(_path, { ...p, held: false, status: 'skipped', skippedAt: new Date().toISOString() });
    console.log(`· Daily ${p.date} skipped by Tee: stays unpublished, no email sent`);
  } else if (go && !recent) {
    writeJson(_path, { ...p, held: false, status: 'expired' });
    console.log(`· Daily ${p.date} is too old to send now: marked expired`);
  }
}
if (!released) console.log('No held Daily to release.');
