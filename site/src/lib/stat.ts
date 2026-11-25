// statLen: how long a headline stat is, so every big-number slot (home report cards, report
// hero, "figures that matter" tiles, article hero) can step its type down instead of letting a
// sentence-length stat fill the whole screen (Nov 2026 fix). Use as data-len={statLen(v)}.
//   s = up to 9 characters ("60%", "€1.2bn")  -> full display size
//   m = 10-16 characters ("£492 million")     -> smaller
//   l = 17+ characters (a phrase)             -> headline size, wraps normally
export const statLen = (v?: string | number | null): 's' | 'm' | 'l' => {
  const n = String(v ?? '').trim().length;
  return n > 16 ? 'l' : n > 9 ? 'm' : 's';
};
