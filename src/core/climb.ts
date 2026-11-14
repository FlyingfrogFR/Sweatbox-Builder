// climb.ts — climbing entries for traffic departing close to the session FIR
// (v10). An autoBoundary aircraft spawns `preEntryNm` before its entry, at its
// filed cruise level. For a flight that left an airport just outside the FIR
// that reaches back further than it could have climbed: a Nantes departure to
// Toulouse popped at FL290, 13 NM from Nantes. These helpers say how high a
// typical jet is a given distance after take-off, and which climb transfer
// level the ESE publishes for its departure airport and gate.

/** Distance flown since departure (NM) -> altitude a typical jet has reached (ft). */
export const CLIMB_PROFILE: [number, number][] = [
  [0, 0],
  [15, 9000],
  [40, 20000],
  [80, 30000],
  [125, 36000],
  [170, 40000],
];
/** Never pop closer than this to the departure airport. */
export const MIN_ORIGIN_NM = 15;
/** Never pop lower than this, however close the airport. */
export const MIN_CLIMB_ALT = 5000;

/** Piecewise-linear through CLIMB_PROFILE, clamped at both ends. */
export function climbAlt(nm: number): number {
  const p = CLIMB_PROFILE;
  if (!(nm > p[0][0])) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (nm <= p[i][0]) {
      const [x0, y0] = p[i - 1];
      const [x1, y1] = p[i];
      return y0 + ((nm - x0) * (y1 - y0)) / (x1 - x0);
    }
  }
  return p[p.length - 1][1];
}

/**
 * The published climb-out for this flight, or null. A candidate is an
 * into-FIR line for the flight's departure airport that carries a climb level
 * and names a gate the route passes AT OR BEFORE its entry fix (a gate beyond
 * the entry would put the pop inside the FIR). A line that also names the
 * fix the route must continue to, or the destination, applies only when the
 * route does. Among the candidates: the earliest gate in route order, then a
 * line naming a continuation or destination before a generic one, then the
 * lowest level.
 */
export function pickClimbOut(
  copx: any[] | undefined,
  fir: string,
  origin: string,
  dest: string,
  toks: string[],
  wpByName: Map<string, any>,
  entryFixName: string,
): any | null {
  const F = String(fir || "").toUpperCase();
  const O = String(origin || "").toUpperCase();
  const D = String(dest || "").toUpperCase();
  if (!F || !O) return null;
  const entryIdx = toks.indexOf(String(entryFixName || "").toUpperCase());
  if (entryIdx < 0) return null;
  const cands: { c: any; idx: number; specific: boolean }[] = [];
  for (const c of copx || []) {
    if (c?.kind !== "fir") continue;
    if (String(c.toFir || "").toUpperCase() !== F) continue;
    if (String(c.depApt || "").toUpperCase() !== O) continue;
    if (c.climbLevel === null || c.climbLevel === undefined || !Number.isFinite(+c.climbLevel))
      continue;
    const fix = String(c.fix || "").toUpperCase();
    if (!wpByName.has(fix)) continue;
    const idx = toks.indexOf(fix);
    if (idx < 0 || idx > entryIdx) continue;
    const next = String(c.nextFix || "").toUpperCase();
    if (next && toks.indexOf(next, idx + 1) < 0) continue;
    const da = String(c.destApt || "").toUpperCase();
    if (da && da !== D) continue;
    cands.push({ c, idx, specific: !!(next || da) });
  }
  if (!cands.length) return null;
  cands.sort(
    (a, b) =>
      a.idx - b.idx || Number(b.specific) - Number(a.specific) || +a.c.climbLevel - +b.c.climbLevel,
  );
  return cands[0].c;
}

/** "FL230" for 23000 ft. */
export const flOf = (ft: number) => `FL${String(Math.round(ft / 100)).padStart(3, "0")}`;
