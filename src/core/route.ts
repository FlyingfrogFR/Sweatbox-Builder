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

// ---------------------------------------------------------------- 7.10.0 ---
// "DCT" is the direct token real filed routes are full of; EuroScope needs
// none of them. Removing them is an explicit action in the aircraft editor, on
// the board and in the pool — never automatic — so every existing input still
// generates byte for byte what it did.
const isDct = (t: string) => bareFix(t) === "DCT";

/** How many DCT tokens a route carries (any case, with or without a suffix). */
export function countDct(route: any): number {
  return String(route || "")
    .split(/\s+/)
    .filter(isDct).length;
}

/**
 * The route without its DCT tokens. A route with none comes back untouched —
 * whitespace included — so the action is a no-op rather than a reformat.
 */
export function stripDct(route: any): string {
  const s = String(route || "");
  const toks = s.trim().split(/\s+/).filter(Boolean);
  if (!toks.some(isDct)) return s;
  return toks.filter((t) => !isDct(t)).join(" ");
}
