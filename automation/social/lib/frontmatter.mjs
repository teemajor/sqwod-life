// Minimal, dependency-free frontmatter reading for the social pipeline.
// We do NOT parse full YAML — we pull the specific fields the cards need.
// House style across automation/ is zero-dependency; this keeps it that way.

export function splitFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: '', body: raw };
  return { fm: m[1], body: m[2] };
}

const unquote = (s) => {
  if (s == null) return undefined;
  let v = String(s).trim();
  if (v.endsWith('#') === false) v = v.replace(/\s+#\s.*$/, ''); // strip trailing comment
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
};

// Top-level scalar: `key: value` at column 0.
export function scalar(fm, key) {
  const re = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm');
  const m = fm.match(re);
  if (!m) return undefined;
  const v = unquote(m[1]);
  return v === '' ? undefined : v;
}

export function num(fm, key) {
  const v = scalar(fm, key);
  if (v === undefined) return undefined;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export function bool(fm, key) {
  const v = scalar(fm, key);
  if (v === undefined) return undefined;
  return /^(true|yes)$/i.test(v);
}

// The indented lines belonging to a top-level mapping key.
export function block(fm, key) {
  const lines = fm.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^${key}:\\s*$`).test(l));
  if (start === -1) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i]) && lines[i].trim() !== '') break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

// A scalar nested one level inside a mapping block: parent: \n  key: value
export function nested(fm, parent, key) {
  const b = block(fm, parent);
  if (!b) return undefined;
  const m = b.match(new RegExp(`^\\s+${key}:[ \\t]*(.*)$`, 'm'));
  if (!m) return undefined;
  const v = unquote(m[1]);
  return v === '' ? undefined : v;
}

// A simple top-level sequence of strings: key:\n  - "a"\n  - "b"
export function list(fm, key) {
  const b = block(fm, key);
  if (!b) return [];
  return b
    .split(/\r?\n/)
    .map((l) => l.match(/^\s+-\s+(.*)$/))
    .filter(Boolean)
    .map((m) => unquote(m[1]))
    .filter((v) => v && !v.startsWith('{'));
}

// A sequence of inline flow maps: key:\n  - { label: "x", value: "y" }
export function flowMaps(fm, key) {
  const b = block(fm, key);
  if (!b) return [];
  const rows = [];
  for (const line of b.split(/\r?\n/)) {
    const m = line.match(/^\s+-\s*\{(.*)\}\s*$/);
    if (!m) continue;
    const obj = {};
    // split on commas that are not inside quotes
    for (const part of m[1].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
      const kv = part.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$/);
      if (kv) obj[kv[1]] = unquote(kv[2]);
    }
    if (Object.keys(obj).length) rows.push(obj);
  }
  return rows;
}
