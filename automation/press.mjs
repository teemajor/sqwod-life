#!/usr/bin/env node
/**
 * Sqwod press-release pipeline — AI pre-screen + publish.
 *
 * Flow: the Cloudflare Worker (infrastructure/pr-intake) writes each submission
 * as automation/press-queue/<id>.json. This script:
 *   1) PRE-SCREEN  status "submitted" → Claude scores it against the content
 *      policy, writes a recommendation, sets status "screened".
 *   2) PUBLISH     status "approved" (you approve), and for premium also paid,
 *      → writes site/src/content/press/<slug>.<lang>.md (status published),
 *        produces the EN/DE counterpart, sets queue status "published".
 *
 * Human-in-the-loop: nothing publishes until you set status to "approved" in the
 * queue JSON (premium also needs paid:true, which the Stripe webhook sets).
 *
 *   node automation/press.mjs              # screen + publish eligible
 *   node automation/press.mjs --screen-only
 * Dry-run safe: without ANTHROPIC_API_KEY it uses heuristics + pass-through.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE = join(__dirname, 'press-queue');
const PRESS_OUT = join(__dirname, '..', 'site', 'src', 'content', 'press');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const apiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.SQWOD_MODEL || 'claude-sonnet-4-6';

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
const q = (s) => JSON.stringify(s ?? '');

async function claude(prompt, max = 1200) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: max, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`LLM HTTP ${r.status}`);
  return (await r.json()).content?.[0]?.text || '';
}

// ---- 1) PRE-SCREEN against the content policy ----
const BLOCKLIST = /\b(cure|miracle|guaranteed weight loss|cures? (cancer|disease)|crypto|casino|sexual|escort)\b/i;
async function screen(sub) {
  if (!apiKey) {
    const flagged = BLOCKLIST.test(`${sub.headline} ${sub.body}`);
    return { decision: flagged ? 'review' : 'approve', score: flagged ? 40 : 75, reasons: flagged ? 'Heuristic: contains a flagged term — needs human review.' : 'Heuristic pass: no flagged terms. Confirm industry relevance.' };
  }
  const prompt = `You screen press releases for Sqwod, a fitness/wellness-industry media brand. Apply this policy: relevant to the fitness/wellness industry; factual & verifiable; no unsubstantiated health/medical claims; no hate/defamation/illegal; nothing endangering minors; not pure spam.

Submission:
Company: ${sub.company}
Headline: ${sub.headline}
Body: ${sub.body}

Respond ONLY as minified JSON: {"decision":"approve|reject|review","score":0-100,"reasons":"one or two sentences"}.`;
  try {
    const txt = (await claude(prompt, 400)).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    return JSON.parse(txt);
  } catch (e) { return { decision: 'review', score: 50, reasons: 'Screen failed: ' + e.message }; }
}

// ---- 2) PUBLISH: clean body + optional translate ----
async function compose(sub, lang) {
  // returns { headline, dek, body, boilerplate }
  if (!apiKey) {
    return { headline: sub.headline, dek: sub.dek || '', body: sub.body, boilerplate: sub.boilerplate || '' };
  }
  const langName = lang === 'de' ? 'German' : 'English';
  const native = (sub.publishLang || sub.lang) === lang || sub.publishLang === 'both' && (sub.lang === lang);
  const prompt = `Format this company-submitted press release for publication in ${langName}. Keep it the company's voice and facts — do NOT add claims or numbers. Clean grammar/structure into tidy Markdown paragraphs. ${native ? '' : `Translate faithfully into ${langName}.`}
Return ONLY minified JSON: {"headline":"...","dek":"one-sentence summary","body":"markdown body","boilerplate":"short 'About {company}' line"}.

Company: ${sub.company}
Headline: ${sub.headline}
Dek: ${sub.dek || ''}
Body: ${sub.body}`;
  try {
    const txt = (await claude(prompt, 1600)).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    return JSON.parse(txt);
  } catch { return { headline: sub.headline, dek: sub.dek || '', body: sub.body, boilerplate: sub.boilerplate || '' }; }
}

function writeRelease(sub, slug, lang, composed, translated) {
  const fm = ['---',
    `urlSlug: ${q(slug)}`, `lang: ${q(lang)}`, `counterpart: ${q(slug)}`,
    `company: ${q(sub.company)}`, `headline: ${q(composed.headline)}`,
    `dek: ${q(composed.dek)}`, `tier: ${q(sub.tier || 'standard')}`,
    `status: ${q('published')}`, `submittedAt: ${q(sub.submittedAt || '')}`,
    `publishedAt: ${q((sub.preferredDate || new Date().toISOString().slice(0, 10)))}`,
    `companyUrl: ${q(sub.companyUrl || '')}`, `pillar: ${q(sub.pillar || 'industry-trends')}`,
  ];
  if (sub.logo) fm.push(`logo: ${q(sub.logo)}`);
  if (composed.boilerplate) fm.push(`boilerplate: ${q(composed.boilerplate)}`);
  if (translated) fm.push('translated: true');
  if (sub.link) { fm.push('links:'); fm.push(`  - { label: ${q(sub.company)}, url: ${q(sub.link)} }`); }
  fm.push('---', '', composed.body, '');
  mkdirSync(PRESS_OUT, { recursive: true });
  writeFileSync(join(PRESS_OUT, `${slug}.${lang}.md`), fm.join('\n'));
}

async function run() {
  if (!existsSync(QUEUE)) { console.log('No press-queue/ — nothing to do.'); return; }
  const files = readdirSync(QUEUE).filter((f) => f.endsWith('.json'));
  let screened = 0, published = 0;
  for (const f of files) {
    const path = join(QUEUE, f);
    const sub = JSON.parse(readFileSync(path, 'utf8'));

    if (sub.status === 'submitted') {
      sub.recommendation = await screen(sub);
      sub.status = 'screened';
      writeFileSync(path, JSON.stringify(sub, null, 2));
      screened++;
      console.log(`· screened ${sub.id} → ${sub.recommendation.decision} (${sub.recommendation.score}) — ${sub.company}`);
      continue;
    }

    const eligible = sub.status === 'approved' && (sub.tier !== 'premium' || sub.paid === true);
    if (eligible && !args['screen-only']) {
      const slug = sub.slug || `${slugify(sub.company)}-${slugify(sub.headline).slice(0, 24)}`;
      const langs = sub.publishLang === 'both' ? ['en', 'de'] : [sub.publishLang || sub.lang || 'en'];
      for (const lang of langs) {
        const composed = await compose(sub, lang);
        writeRelease(sub, slug, lang, composed, sub.publishLang === 'both' && lang !== (sub.lang || 'en'));
      }
      sub.status = 'published'; sub.slug = slug;
      writeFileSync(path, JSON.stringify(sub, null, 2));
      published++;
      console.log(`✓ published ${slug} (${langs.join('+')}) — ${sub.company} [${sub.tier}]`);
    }
  }
  console.log(`\nDone. Screened ${screened}, published ${published}. Mode: ${apiKey ? 'LLM' : 'dry-run (heuristics)'}.`);
}
run();
