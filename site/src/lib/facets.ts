// Faceted filter for list pages (Jobs). Checkbox facets with live counts, free-text search, sort,
// removable chips, "clear all", state in the URL query string, and a bottom-sheet on phones.
// The Investor Map carries the same pattern inline; this is the reusable version.
//
// Rows carry one data attribute per facet (data-<facet>); 'many' facets hold space-separated values,
// 'one' facets a single value, 'flag' facets "1" when the row qualifies. Counts show what each option
// would yield if it were (also) ticked, given every other facet, like Amazon's left rail.
export type FacetMode = 'one' | 'many' | 'flag';
export interface FacetDef { name: string; mode: FacetMode; match?: (rowValue: string, selected: Set<string>) => boolean }
export interface FacetOptions {
  root: HTMLElement;                       // contains the rows, the sidebar and the bar
  rowSelector: string;                     // e.g. '.jb'
  facets: FacetDef[];
  nameAttr?: string;                       // data attribute searched by the text box (default 'name')
  sortKey?: (el: HTMLElement, key: string) => number | string;  // smaller first; strings compare as text
  defaultSort?: string;
  extraParam?: (p: URLSearchParams) => void;   // add read-only params when writing the URL
  onApply?: (shown: number) => void;
  moreLimit?: number;                      // facet options hidden behind "show all" (default 8)
}
export interface FacetHandle { apply(push?: boolean): void; clear(): void; state(): Record<string, Set<string>> }

export function initFacets(o: FacetOptions): FacetHandle {
  const root = o.root;
  const rows = Array.from(root.querySelectorAll<HTMLElement>(o.rowSelector));
  const list = rows[0]?.parentElement as HTMLElement;
  const side = root.querySelector<HTMLElement>('[data-fx-side]')!;
  const boxes = Array.from(side.querySelectorAll<HTMLInputElement>('input[type=checkbox],input[type=radio]'));
  const q = root.querySelector<HTMLInputElement>('[data-q]');
  const sort = root.querySelector<HTMLSelectElement>('[data-sort]');
  const shown = Array.from(root.querySelectorAll<HTMLElement>('[data-shown],[data-shown-2]'));
  const chipsUl = root.querySelector<HTMLElement>('[data-fx-chips]');
  const clears = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-clear]'));
  const none = root.querySelector<HTMLElement>('[data-none]');
  const badge = root.querySelector<HTMLElement>('[data-fx-n]');
  const nameAttr = o.nameAttr || 'name';
  const limit = o.moreLimit ?? 8;
  const byName = new Map(o.facets.map((f) => [f.name, f]));

  const state = (): Record<string, Set<string>> => {
    const s: Record<string, Set<string>> = {}; for (const f of o.facets) s[f.name] = new Set();
    for (const b of boxes) if (b.checked && s[b.name]) s[b.name].add(b.value);
    return s;
  };
  function passes(el: HTMLElement, f: FacetDef, sel: Set<string>): boolean {
    if (!sel.size) return true;
    const v = el.dataset[f.name] || '';
    if (f.match) return f.match(v, sel);
    if (f.mode === 'flag') return v === '1';
    if (f.mode === 'one') return sel.has(v);
    const have = v.split(' ');
    return [...sel].some((x) => have.includes(x));
  }
  function sortRows() {
    if (!sort || !o.sortKey) return;
    const k = sort.value;
    const sorted = [...rows].sort((a, b) => { const x = o.sortKey!(a, k), y = o.sortKey!(b, k); return typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y; });
    sorted.forEach((el) => list.insertBefore(el, none && none.parentElement === list ? none : null));
  }
  function renderChips() {
    if (!chipsUl) return;
    chipsUl.replaceChildren(...boxes.filter((b) => b.checked).map((b) => {
      const li = document.createElement('li'); const btn = document.createElement('button'); btn.type = 'button';
      const label = b.closest('label')?.querySelector('span')?.textContent?.trim() || b.value;
      btn.textContent = label; btn.setAttribute('aria-label', `${label} ×`);
      btn.addEventListener('click', () => { b.checked = false; apply(); }); li.append(btn); return li;
    }));
  }
  function writeUrl() {
    const p = new URLSearchParams(); const s = state();
    for (const f of o.facets) if (s[f.name].size) p.set(f.name, [...s[f.name]].join(','));
    if (q?.value.trim()) p.set('q', q.value.trim());
    if (sort && sort.value !== (o.defaultSort ?? sort.options[0]?.value)) p.set('sort', sort.value);
    o.extraParam?.(p);
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }
  function expand(wrap: HTMLElement, open: boolean) {
    wrap.querySelectorAll<HTMLElement>('label').forEach((l, k) => { if (k >= limit) l.hidden = !open; });
    const t = wrap.querySelector<HTMLButtonElement>('[data-fx-toggle]'); if (t) { t.dataset.open = open ? '1' : ''; t.textContent = open ? t.dataset.less! : `${t.dataset.more} (${wrap.querySelectorAll('label').length})`; }
  }
  function readUrl() {
    const p = new URLSearchParams(location.search);
    for (const b of boxes) { const raw = (p.get(b.name) || '').split(',').map((x) => x.trim().toLowerCase()); b.checked = raw.includes(b.value.toLowerCase()); }
    if (q) q.value = p.get('q') || '';
    const so = p.get('sort'); if (sort && so && [...sort.options].some((x) => x.value === so)) sort.value = so;
    for (const b of boxes) if (b.checked) { b.closest('details')?.setAttribute('open', ''); const l = b.closest('label'); if (l?.hidden) expand(l.parentElement!, true); }
  }
  function apply(push = true) {
    const s = state(); const text = (q?.value || '').trim().toLowerCase();
    let n = 0; const okBy = new Map<HTMLElement, Record<string, boolean>>();
    for (const el of rows) {
      const by: Record<string, boolean> = { text: !text || (el.dataset[nameAttr] || '').includes(text) };
      for (const f of o.facets) by[f.name] = passes(el, f, s[f.name]);
      okBy.set(el, by);
      const ok = Object.values(by).every(Boolean); el.hidden = !ok; if (ok) n++;
    }
    for (const b of boxes) {
      const f = byName.get(b.name); if (!f) continue; const one = new Set([b.value]);
      let c = 0;
      for (const el of rows) { const by = okBy.get(el)!; if (by.text && o.facets.every((g) => (g.name === f.name ? passes(el, f, one) : by[g.name]))) c++; }
      const i = b.closest('label')?.querySelector('[data-n]'); if (i) i.textContent = String(c);
      b.closest('label')?.classList.toggle('is-zero', c === 0 && !b.checked);
    }
    sortRows();
    shown.forEach((el) => (el.textContent = String(n)));
    const active = boxes.filter((b) => b.checked).length;
    if (badge) { badge.textContent = String(active); badge.hidden = !active; }
    const any = active > 0 || !!text;
    clears.forEach((c) => { if (!c.closest('[data-none]')) c.hidden = !any; });
    if (none) none.hidden = n > 0;
    renderChips();
    o.onApply?.(n);
    if (push) writeUrl();
  }
  function clear() { boxes.forEach((b) => (b.checked = false)); if (q) q.value = ''; apply(); }
  root.querySelectorAll<HTMLButtonElement>('[data-fx-toggle]').forEach((t) => t.addEventListener('click', () => expand(t.parentElement!, !t.dataset.open)));
  boxes.forEach((b) => b.addEventListener('change', () => apply()));
  q?.addEventListener('input', () => apply()); sort?.addEventListener('change', () => apply());
  clears.forEach((c) => c.addEventListener('click', clear));
  // phone sheet
  const veil = root.querySelector<HTMLElement>('[data-fx-veil]'); const opener = root.querySelector<HTMLButtonElement>('[data-fx-open]');
  function sheet(open: boolean) {
    side.classList.toggle('is-open', open); if (veil) veil.hidden = !open; document.body.classList.toggle('fx-lock', open);
    opener?.setAttribute('aria-expanded', String(open));
    if (open) { const body = side.querySelector<HTMLElement>('.fx-side-body'); if (body) body.scrollTop = 0; side.querySelector<HTMLElement>('input,button')?.focus(); } else opener?.focus();
  }
  opener?.addEventListener('click', () => sheet(true));
  root.querySelectorAll<HTMLElement>('[data-fx-close]').forEach((x) => x.addEventListener('click', () => sheet(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && side.classList.contains('is-open')) sheet(false); });
  readUrl();
  apply(false);
  return { apply, clear, state };
}
