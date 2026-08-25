// route.ts — route/string helpers, copied VERBATIM from the rc3 shell.
// (nearestResolvableIdx is a post-rc3 addition: real filed routes interleave
// fixes with airway designators that never resolve in navdata, so neighbour
// lookups must walk past them.)

// Filed routes legally carry speed/level suffixes ("ETAMO/N0453F370") and any
// case. Every comparison against navdata must be made on the bare fix, or the
// token silently fails to resolve here — and EuroScope skips it in $ROUTE too.
export function bareFix(tok: string) {
  return String(tok || "")
    .split("/")[0]
    .trim()
    .toUpperCase();
}

/** Route with every token reduced to its bare fix — for sim routes / $ROUTE. */
export function stripRouteSuffixes(route: string) {
  return String(route || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.split("/")[0])
    .join(" ");
}

// First token at or beyond `from` (stepping by `dir` = +1 / -1) that resolves
// in `wpts`. Returns its index, or -1.
export function nearestResolvableIdx(
  toks: string[],
  from: number,
  dir: 1 | -1,
  wpts: any[],
): number {
  for (let i = from; i >= 0 && i < toks.length; i += dir) {
    const t = bareFix(toks[i]);
    if (wpts.some((w) => String(w.name).toUpperCase() === t)) return i;
  }
  return -1;
}

export function trimRoute(route: string, wpt: string) {
  if (!route || !wpt) return route || "";
  const toks = String(route).trim().split(/\s+/).filter(Boolean);
  const target = bareFix(wpt);
  const idx = toks.findIndex((t) => bareFix(t) === target);
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
