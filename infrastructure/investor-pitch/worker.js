/**
 * Sqwod Investor Matcher: AI pitch read (Cloudflare Worker).
 *
 * POST /pitch  { pitch, lang, ts }  →  { summary, matches: [{ id, score, why }], model, dataDate }
 *
 * The Worker fetches the compact investor rows the site builds at /investor-data.json (cached one
 * hour), hands them to Claude together with the founder's pitch and asks for a strict JSON ranking
 * of the ten best fits with one-sentence reasons tied to the data (stage, portfolio, cheque, HQ,
 * activity). The site merges the answer with its own rule-based evidence lines, so every AI reason
 * sits next to the numbers it came from.
 *
 * Secrets:  ANTHROPIC_API_KEY
 * Vars:     SITE_BASE, ALLOW_ORIGIN, MODEL, MIN_FILL_MS, MAX_CHARS, DAILY_PER_IP
 * Binding:  PITCH_KV (daily per-IP cap; recommended)
 */
const cors = (env) => ({
  'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
});
const json = (o, s, env) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...cors(env) } });

let cache = { at: 0, data: null };   // per-isolate cache of the investor rows

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    if (req.method === 'POST' && url.pathname === '/pitch') return pitch(req, env);
    return new Response('Sqwod investor pitch', { status: 200 });
  },
};

async function pitch(req, env) {
  // 1. origin gate: only the live site may call this (costs money per call)
  const origin = req.headers.get('origin') || '';
  const referer = req.headers.get('referer') || '';
  const allow = env.ALLOW_ORIGIN || '';
  if (allow && !(origin === allow || referer.startsWith(allow + '/'))) return json({ error: 'origin' }, 403, env);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'json' }, 400, env); }
  const text = String(body.pitch || '').trim();
  const lang = body.lang === 'de' ? 'de' : 'en';
  const maxChars = parseInt(env.MAX_CHARS || '2000', 10);
  if (text.length < 40) return json({ error: 'short' }, 400, env);
  if (text.length > maxChars) return json({ error: 'long' }, 400, env);
  // 2. time-on-form: a pitch "typed" in under MIN_FILL_MS is a script
  const ts = parseInt(body.ts, 10);
  if (ts && Date.now() - ts < parseInt(env.MIN_FILL_MS || '4000', 10)) return json({ error: 'fast' }, 429, env);
  // 3. daily per-IP cap
  const ip = req.headers.get('cf-connecting-ip') || '';
  if (env.PITCH_KV && ip) {
    const key = `pitch:${ip}:${new Date().toISOString().slice(0, 10)}`;
    const seen = parseInt(await env.PITCH_KV.get(key), 10) || 0;
    if (seen >= parseInt(env.DAILY_PER_IP || '5', 10)) return json({ error: 'quota' }, 429, env);
    await env.PITCH_KV.put(key, String(seen + 1), { expirationTtl: 86400 });
  }
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'config' }, 503, env);

  // 4. the investor rows the site publishes
  const data = await rows(env);
  if (!data) return json({ error: 'data' }, 503, env);

  // 5. ask Claude for a strict JSON ranking
  const prompt = buildPrompt(text, lang, data);
  let out;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.MODEL || 'claude-sonnet-5-5', max_tokens: 1800, system: SYSTEM, messages: [{ role: 'user', content: prompt }, { role: 'assistant', content: '{' }] }),
    });
    if (!r.ok) return json({ error: 'model', status: r.status }, 502, env);
    const j = await r.json();
    out = parse('{' + (j.content || []).map((c) => c.text || '').join(''));
  } catch { return json({ error: 'model' }, 502, env); }
  if (!out) return json({ error: 'parse' }, 502, env);
  const ids = new Set(data.investors.map((i) => i.id));
  const matches = (out.matches || []).filter((m) => m && ids.has(m.id)).slice(0, 10)
    .map((m) => ({ id: m.id, score: Math.max(0, Math.min(100, Math.round(Number(m.score) || 0))), why: String(m.why || '').slice(0, 400) }));
  return json({ summary: String(out.summary || '').slice(0, 600), matches, model: env.MODEL || 'claude-sonnet-5-5', dataDate: data.generatedAt }, 200, env);
}

async function rows(env) {
  if (cache.data && Date.now() - cache.at < 3600e3) return cache.data;
  try {
    const r = await fetch(`${env.SITE_BASE || 'https://sqwod.life'}/investor-data.json`, { cf: { cacheTtl: 3600 } });
    if (!r.ok) return cache.data;
    cache = { at: Date.now(), data: await r.json() };
    return cache.data;
  } catch { return cache.data; }
}

const SYSTEM = `You are the Sqwod Investor Matcher. You read a founder's pitch for a fitness, wellness or health company and rank the investors, programmes and buyers in the supplied list by fit. Use only the supplied data: stage, focus text, tags, portfolio and tracker companies, cheque size or typical round, HQ and region, activity, open calls. Never invent facts about an investor. Prefer investors whose stage covers the founder's stage, whose focus or portfolio matches what the founder builds, whose cheque fits the amount sought, who are close to the founder's country or invest abroad, and who have been active in the last 12 months. Answer with strict JSON only, no prose outside the JSON.`;

function buildPrompt(text, lang, data) {
  const compact = data.investors.map((i) => [i.id, i.name, i.type, i.country || '', i.region, i.stages.join('/'), i.check || (i.typicalRoundUsd ? `typical ~$${Math.round(i.typicalRoundUsd / 1e5) / 10}M` : ''), i.tags.join(','), i.focus, [...i.portfolio, ...i.trackerDeals].slice(0, 6).join(';'), `${i.active12m} in 12m`, i.openCall ? 'open call' : '', i.leadsRounds ? 'leads' : '', i.investsAbroad ? 'abroad' : ''].join(' | '));
  return `Founder's pitch (language: ${lang}):
"""
${text}
"""

Investors, one per line: id | name | type | country | region | stages | cheque | tags | focus | portfolio | activity | open call | leads | abroad
${compact.join('\n')}

Return JSON with exactly this shape:
{"summary": "<two sentences in ${lang === 'de' ? 'German' : 'English'}: what the founder builds, at which stage, and which kind of investor fits best>",
 "matches": [{"id": "<id from the list>", "score": <0-100>, "why": "<one sentence in ${lang === 'de' ? 'German' : 'English'} naming the concrete data points behind the fit, e.g. stage, a portfolio company, cheque, HQ, activity>"}, ... up to 10, best first]}`;
}

function parse(s) {
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
