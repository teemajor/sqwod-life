// Title-rule tests for the lane article engine. Run: node automation/titles.test.mjs
// The "bad" titles are real titles from the 27 Oct 2026 audit of 132 articles.
import assert from 'node:assert/strict';
import { titleProblems, headingProblems, nearDuplicate, pickLead } from './titles.mjs';

const t = (name, fn) => { try { fn(); console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n     ', e.message); process.exitCode = 1; } };
const lead = 'WILDE raises $40M Series B to scale its protein chips nationwide';

// ---- titles the audit flagged: all must be rejected
for (const bad of [
  'Fitness Is Splitting in Two — Which Side Are You On?',
  'The Fitness Industry Is Splitting in Two — Which Side Are You On?',
  'Your Studio Is Leaving Money on the Table Every Assessment',
  'Fitness Is Fracturing — Here\'s How to Pick Your Lane',
  'Big Money Is Moving Into Fitness. Here\'s How Small Studios Win',
  'AI Is Booking Your Clients\' Pilates Spots. Now What?',
  'Wellness Is Eating Fitness. Here\'s How to Not Get Swallowed.',
]) t(`rejects audit title: ${bad}`, () => assert.ok(titleProblems(bad, { leadText: lead, entity: '', number: '' }).length > 0));

// ---- trade-desk titles: pass when the anchor is really in the lead story
t('accepts a named, numbered title', () =>
  assert.deepEqual(titleProblems('WILDE Lands $40M to Scale Protein Snacks', { leadText: lead, entity: 'WILDE', number: '$40M' }), []));
t('accepts a number-only anchor', () =>
  assert.deepEqual(titleProblems('Protein Chip Maker Raises $40M for US Rollout', { leadText: lead, entity: '', number: '40' }), []));
t('rejects an entity the lead story never mentions', () =>
  assert.ok(titleProblems('Erewhon Lands $40M for Snacks', { leadText: lead, entity: 'Erewhon', number: '' }).length > 0));
t('rejects an entity claimed but missing from the title', () =>
  assert.ok(titleProblems('Snack Maker Scales Nationwide', { leadText: lead, entity: 'WILDE', number: '' }).length > 0));
t('rejects question titles', () =>
  assert.ok(titleProblems('Can WILDE Scale Protein Snacks?', { leadText: lead, entity: 'WILDE' }).some((p) => /question/.test(p))));
t('rejects titles over 70 characters', () =>
  assert.ok(titleProblems('WILDE Lands $40M to Scale Protein Snacks Across Every Supermarket Chain in America', { leadText: lead, entity: 'WILDE' }).some((p) => /characters/.test(p))));

// ---- German
const leadDe = 'Basic-Fit übernimmt 30 Studios in Bayern';
t('DE: rejects reader address', () =>
  assert.ok(titleProblems('Dein Studio und die Basic-Fit-Welle', { lang: 'de', leadText: leadDe, entity: 'Basic-Fit' }).length > 0));
t('DE: rejects "welche Seite"', () =>
  assert.ok(titleProblems('Basic-Fit wächst: Auf welcher Seite stehst du', { lang: 'de', leadText: leadDe, entity: 'Basic-Fit' }).length > 0 ||
            titleProblems('Basic-Fit wächst: welche Seite wählst du', { lang: 'de', leadText: leadDe, entity: 'Basic-Fit' }).length > 0));
t('DE: accepts a named title', () =>
  assert.deepEqual(titleProblems('Basic-Fit übernimmt 30 Studios in Bayern', { lang: 'de', leadText: leadDe, entity: 'Basic-Fit', number: '30' }), []));

// ---- duplicates against recent titles
const recent = ['Fitness Is Splitting in Two — Which Side Are You On?', 'Inside Erewhon\'s Growth Strategy'];
t('flags a near-copy of a recent title', () => assert.ok(nearDuplicate('Inside Erewhon\'s Growth Strategy for 2027', recent)));
t('passes a new subject', () => assert.equal(nearDuplicate('WILDE Lands $40M to Scale Protein Snacks', recent), null));

// ---- generic subheads from the audit
t('flags generic subheads', () => assert.equal(headingProblems("## What's Really Happening Here\n\ntext\n\n## Do This Now\n\n## Why chips beat bars at Whole Foods").length, 2));

// ---- one lead story, skipping what recent articles already covered
t('picks the first uncovered story and same-subject context', () => {
  const pool = [
    { headline: 'Old story already covered', url: 'https://a.example/1' },
    { headline: 'WILDE raises $40M Series B for protein chips', url: 'https://b.example/2' },
    { headline: 'Garmin launches new watch', url: 'https://c.example/3' },
    { headline: 'Protein chips maker WILDE expands retail reach', url: 'https://d.example/4' },
  ];
  const p = pickLead(pool, { usedUrls: new Set(['https://a.example/1']) });
  assert.equal(p.lead.url, 'https://b.example/2');
  assert.deepEqual(p.context.map((c) => c.url), ['https://d.example/4']);
});
