#!/usr/bin/env node
/**
 * Sqwod Verified — PRO READ writer (Oct 2026 audience reframe).
 *
 * sqwod.life speaks to fitness industry professionals: studio and gym founders, coaches,
 * brands, investors. The consumer "buy if / skip if" stays (it feeds the FAQ schema), but
 * every review gets a `proRead` block rendered above it:
 *   clients — should a coach recommend it, to whom
 *   studio  — does it belong in a studio / gym / Pod / corporate programme
 *   brand   — what a brand, buyer or investor should take from it
 *   trade   — price, margin, distribution, channel facts in one line
 *
 * Written from the review's OWN verdict, score, pros, cons, price and body. Nothing new is
 * researched; no number may appear in the pro read that is not already in the review.
 * German is authored natively and checked; a failed check leaves the review untouched.
 *
 *   node automation/verified-proread.mjs            # all reviews missing proRead (EN + DE)
 *   node automation/verified-proread.mjs --force    # rewrite all
 *   node automation/verified-proread.mjs --slug=whoop-5 --dry
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REVIEWS = join(__dirname, '..', 'site', 'src', 'content', 'reviews');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const apiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SQWOD_MODEL || 'claude-sonnet-4-6';
const q = (s) => JSON.stringify(String(s ?? '').replace(/—/g, ', ').trim());
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

const SYSTEM = 'You are Sqwod Verified, the buyer\'s-guide desk of sqwod.life. Readers are fitness industry professionals: studio and gym founders, personal trainers and coaches, brand operators, buyers and investors. You never invent facts, prices or numbers; you only reframe what the review already established. Direct, specific, no hype, no em dashes.';

function split(src) { const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/); return m ? { fm: m[1], body: m[2] } : null; }
const field = (fm, k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.replace(/^"|"$/g, '') || '';
const block = (fm, k) => { const m = fm.match(new RegExp(`^${k}:\\n((?:  .*\\n?)+)`, 'm')); return m ? m[1] : ''; };

async function claude(prompt) {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = (await r.json()).content?.[0]?.text?.trim() || '';
      try { return JSON.parse(t.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { const m = t.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; }
    } catch (e) { console.error(`  · retry ${a}/3: ${e.message}`); if (a < 3) await new Promise((x) => setTimeout(x, a * 2000)); }
  }
  return null;
}

function prompt(lang, d) {
  const L = lang === 'de'
    ? 'Schreibe auf Deutsch, nativ, nicht übersetzt. Du-Ansprache für Coaches und Studiobetreiber:innen. Deutsches Zahlenformat.'
    : 'Write in plain, specific English.';
  return `${L}
Review of ${d.productName} (${d.category}). Sqwod Score ${d.score}/100, confidence ${d.confidence}, test status: ${d.testStatus}.
Verdict: ${d.verdict}
Pros:\n${d.pros}\nCons:\n${d.cons}
Consumer read: buy if: ${d.buy} / skip if: ${d.skip}
Price block:\n${d.value}
Body:\n${d.body.slice(0, 3500)}

Write the PROFESSIONAL read of this product for the sqwod.life audience. Four fields, each 1 to 2 sentences, concrete, drawn ONLY from the facts above (no new numbers, no new claims):
{
 "clients": "Should a coach or trainer recommend it, and to which client? Name the client type and the condition under which it earns a place in a programme.",
 "studio": "Does it belong in a studio, gym, private training room or corporate wellness programme? Think shared use, durability, hygiene, subscription per seat, member experience.",
 "brand": "What should a brand operator, retail buyer or investor take from this product: its positioning, the moat or lack of one, the risk in its model (e.g. subscription dependency, undisclosed doses, newer model).",
 "trade": "One line of commercial facts already in the review: price and price type, subscription, channel, what it competes with."
}
Respond ONLY with that JSON.`;
}

const DE = /\b(und|der|die|das|nicht|für|ist|sind|mit|auf|eine|einen|auch|wird|bei|nach|aus|oder|wie|dass|sich|dein|deine|kund)\w*\b/gi;
const isGerman = (o) => { const t = Object.values(o).join(' '); return (t.match(DE) || []).length / Math.max(1, words(t)) >= 0.08; };
function numbersOk(o, source) {
  const have = new Set((source.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));
  const mine = (Object.values(o).join(' ').match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'));
  const bad = mine.filter((n) => !have.has(n) && !have.has(String(parseFloat(n))));
  return { ok: bad.length === 0, bad };
}

function insert(src, o) {
  const yaml = ['proRead:', `  clients: ${q(o.clients)}`, `  studio: ${q(o.studio)}`, `  brand: ${q(o.brand)}`, `  trade: ${q(o.trade)}`].join('\n');
  if (/^proRead:\n(?:  .*\n?)+/m.test(src)) return src.replace(/^proRead:\n(?:  .*\n?)+/m, yaml + '\n');
  // place right after the whoFor block
  return src.replace(/^(whoFor:\n(?:  .*\n?)+)/m, `$1${yaml}\n`);
}

async function run() {
  const files = readdirSync(REVIEWS).filter((f) => /\.(en|de)\.md$/.test(f) && (!args.slug || f.startsWith(args.slug + '.')));
  let done = 0, skipped = 0, failed = 0;
  for (const f of files.sort()) {
    const path = join(REVIEWS, f), src = readFileSync(path, 'utf8'), parts = split(src);
    if (!parts) { console.log(`! ${f}: no frontmatter`); continue; }
    const { fm, body } = parts;
    if (!args.force && /^proRead:/m.test(fm)) { skipped++; continue; }
    if (field(fm, 'draft') === 'true') { skipped++; continue; }
    const lang = f.endsWith('.de.md') ? 'de' : 'en';
    const d = { productName: field(fm, 'productName'), category: field(fm, 'category'), score: field(fm, 'sqwodScore'), confidence: field(fm, 'confidence'), testStatus: field(fm, 'testStatus') || 'desk-researched',
      verdict: field(fm, 'verdict'), pros: block(fm, 'pros'), cons: block(fm, 'cons'), buy: (block(fm, 'whoFor').match(/buy:\s*(.+)/) || [])[1] || '', skip: (block(fm, 'whoFor').match(/skip:\s*(.+)/) || [])[1] || '', value: block(fm, 'value'), body };
    if (args.dry || !apiKey) { console.log(`[dry] ${f}: ${d.productName} (${d.score})`); continue; }
    const o = await claude(prompt(lang, d));
    if (!o || !o.clients || !o.studio || !o.brand || !o.trade) { console.log(`✗ ${f}: no usable answer`); failed++; continue; }
    if (lang === 'de' && !isGerman(o)) { console.log(`✗ ${f}: DE read is not German, left untouched`); failed++; continue; }
    const n = numbersOk(o, fm + '\n' + body);
    if (!n.ok) { console.log(`✗ ${f}: new numbers not in the review (${n.bad.join(', ')}), left untouched`); failed++; continue; }
    const out = insert(src, o);
    if (out === src) { console.log(`✗ ${f}: could not place proRead (no whoFor block?)`); failed++; continue; }
    writeFileSync(path, out); done++;
    console.log(`✓ ${f}`);
  }
  console.log(`\n${done} written · ${skipped} skipped (already had a pro read or draft) · ${failed} failed`);
}
run().catch((e) => { console.error(e); process.exit(1); });
