// route.ts — route/string helpers, copied VERBATIM from the rc3 shell.
// (nearestResolvableIdx is a post-rc3 addition: real filed routes interleave
// fixes with airway designators that never resolve in navdata, so neighbour
// lookups must walk past them.)

// First token at or beyond `from` (stepping by `dir` = +1 / -1) that resolves
// in `wpts`. Returns its index, or -1.
export function nearestResolvableIdx(
  toks: string[],
  from: number,
  dir: 1 | -1,
  wpts: any[],
): number {
  for (let i = from; i >= 0 && i < toks.length; i += dir) {
    if (wpts.some((w) => w.name === toks[i])) return i;
  }
  return -1;
}

export function trimRoute(route: string, wpt: string) {
  if (!route || !wpt) return route || "";
  const toks = String(route).trim().split(/\s+/).filter(Boolean);
  const idx = toks.findIndex((t) => t.toUpperCase() === wpt.toUpperCase());
  return idx === -1 ? route : toks.slice(idx).join(" ");
}

export function pickPool(csv: string, i: number) {
  const a = (csv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return a.length ? a[i % a.length] : "";
}

export function expandCS(pat: string, seq: number) {
  if (!pat) return "UNK" + seq;
  const m = pat.match(/^(.*?)(#+)(.*)$/);
  if (!m) return pat + seq;
  return m[1] + String(seq).padStart(m[2].length, "0") + m[3];
}
