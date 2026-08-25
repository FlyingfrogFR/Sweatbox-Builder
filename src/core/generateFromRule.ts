// generateFromRule.ts
//
// Copied VERBATIM from the rc3 shell (function generateFromRule). The only
// changes are mechanical: Math.random() -> rng(), window.SB.stars -> getStars(),
// and explicit imports of the helpers the shell exposed on window.SB. The
// algorithm — squawk '0000'->rule fallback, routeContains filter, the
// excludeNonRouting acceptable-set built from STAR upstream fixes, the
// rate/separation interval math, count = floor(duration/intMin)+1 — is unchanged
// EXCEPT for one intentional bug-fix divergence from rc3: pool-sourced
// callsigns are now checked against / registered in usedSet (rc3 never did
// either, so two rules with overlapping pool filters emitted duplicate
// callsigns). The fix only changes output for inputs the golden fixtures
// avoid — no fixture runs two overlapping pool rules, and every fixture pool
// entry carries a unique callsign — so parity with the goldens is preserved;
// tests/dedup.test.ts exercises the divergence port-side only.

import { computeSpawnGs } from "./speed";
import { GS_BY_WTC } from "./tables";
import { trimRoute, pickPool, expandCS, nearestResolvableIdx } from "./route";
import { preEntryOffset, bearingBetween, destinationPoint, distanceNm } from "./geo";
import { genCS } from "./callsign";
import { assignSquawk } from "./squawk";
import { uid } from "./uid";
import { getStars } from "./stars";
import { rng } from "./rng";

// Home airport of the scenario: origin of departures / destination of
// arrivals. Rules created before the field existed carry no homeIcao and keep
// the original hardcoded LFPG so legacy rulesets generate byte-identically.
function homeApt(rule: any) {
  return rule.homeIcao === undefined ? "LFPG" : String(rule.homeIcao).trim().toUpperCase();
}

// Spawn schedule for a rule. Default ("regular", or field absent) keeps the
// original evenly-spaced times — and makes NO rng() calls, so legacy rules and
// the golden fixtures generate byte-identically. timingMode "random" keeps the
// SAME aircraft count but draws the spawn times randomly across the window,
// never closer than MIN_RANDOM_GAP_MIN from the same fix: sorted uniforms over
// the slack the gaps leave, floors re-added, then a cumulative pass so the
// 2-minute guarantee survives the 0.1-min start rounding.
const MIN_RANDOM_GAP_MIN = 2;
function buildSchedule(rule: any, count: number, intMin: number): number[] {
  const t0 = +rule.startOffset || 0;
  if (rule.timingMode !== "random") {
    const t = [];
    for (let i = 0; i < count; i++) t.push(t0 + i * intMin);
    return t;
  }
  const gap = MIN_RANDOM_GAP_MIN;
  const slack = Math.max(0, (+rule.duration || 0) - gap * (count - 1));
  const u: number[] = [];
  for (let i = 0; i < count; i++) u.push(rng() * slack);
  u.sort((a, b) => a - b);
  const t: number[] = [];
  for (let i = 0; i < count; i++) {
    let v = Math.round((t0 + u[i] + i * gap) * 10) / 10;
    if (i > 0 && v < t[i - 1] + gap) v = Math.round((t[i - 1] + gap) * 10) / 10;
    t.push(v);
  }
  return t;
}

// First intersection of the leg a->b with any boundary segment, as a fraction
// along the leg (so "earliest crossing" is well defined). Planar maths with
// longitude scaled by cos(lat): at FIR scale the error is far below the 1 NM
// spawn offset. Segments are [lat1, lon1, lat2, lon2].
function firstBoundaryHit(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  segs: number[][],
) {
  const k = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180) || 1;
  const x1 = a.lon * k,
    y1 = a.lat,
    x2 = b.lon * k,
    y2 = b.lat;
  let best: { t: number; lat: number; lon: number } | null = null;
  for (const sg of segs) {
    const X1 = sg[1] * k,
      Y1 = sg[0],
      X2 = sg[3] * k,
      Y2 = sg[2];
    const d = (x2 - x1) * (Y2 - Y1) - (y2 - y1) * (X2 - X1);
    if (Math.abs(d) < 1e-12) continue; // parallel
    const t = ((X1 - x1) * (Y2 - Y1) - (Y1 - y1) * (X2 - X1)) / d;
    const u = ((X1 - x1) * (y2 - y1) - (Y1 - y1) * (x2 - x1)) / d;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    if (!best || t < best.t)
      best = { t, lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
  }
  return best;
}

// FIR boundaries are level-dependent, so every boundary test is made at the
// level the aircraft will actually spawn at. ±2000 ft of slack absorbs
// sector-stack edges (an FL360 flight between a 295–345 sector and a 365–660
// one belongs to both for our purposes).
const BAND_SLACK = 2000;
const inBand = (ft: number, lower: number, upper: number) =>
  ft >= lower - BAND_SLACK && ft <= upper + BAND_SLACK;

const OCTANTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const octantOf = (brg: number) => OCTANTS[Math.round((((brg % 360) + 360) % 360) / 45) % 8];

export function generateFromRule(
  rule: any,
  waypoints: any[],
  usedSet: Set<string> = new Set(),
  pool: any[] = [],
  copx?: any[],
  boundaryFir?: string,
  firBounds?: Record<string, number[][]>,
) {
  // autoBoundary (pool rules only): each aircraft spawns where ITS OWN filed
  // route crosses the scenario FIR boundary — no rule-level spawn waypoint.
  const autoBoundary = rule.spawnMode === "autoBoundary" && !!rule.poolSource;
  // The presence of the (post-rc3) spawnMode key arms the never-on-fix
  // invariant: min 1 NM pre-entry offset, and no silent on-fix placement when
  // no inbound bearing is derivable. Raw legacy rules without the key (the
  // golden fixtures) keep rc3 behavior byte-for-byte; every rule that passes
  // through the app's create/import paths carries the key via emptyRule().
  const hasNewFields = rule.spawnMode !== undefined;
  const effPre = hasNewFields ? Math.max(1, +rule.preEntryNm || 1) : +rule.preEntryNm || 0;
  const wp = autoBoundary ? null : waypoints.find((w) => w.name === rule.spawnWaypoint);
  if (!autoBoundary && !wp)
    return { aircraft: [], error: `Waypoint "${rule.spawnWaypoint}" not found in navdata` };
  const _rgs = (() => {
    if (rule.gsMode === "fixed") return computeSpawnGs(rule, "");
    const ft = (rule.typePool || "").split(",")[0].trim().toUpperCase();
    return computeSpawnGs(rule, ft) || GS_BY_WTC.M;
  })();
  const intMin =
    rule.schedulingMode === "separation"
      ? (rule.nmSeparation / Math.max(_rgs, 1)) * 60
      : 60 / Math.max(rule.rate, 0.1);
  const rwy = rule.rwyInUse || rule.runway || "";
  const fpTemplates = (rule.fpRouteTemplates || []).filter(Boolean);
  const pickFP = () =>
    fpTemplates.length > 0
      ? fpTemplates[Math.floor(rng() * fpTemplates.length)]
      : rule.fpRouteTemplate || "";

  if (rule.poolSource) {
    const dDep = (rule.poolDep || "").toUpperCase().trim();
    const dArr = (rule.poolArr || "").toUpperCase().trim();
    const dDepList = dDep
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    const dArrList = dArr
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    // routeContains — comma-separated waypoint tokens that MUST appear in
    // the pool aircraft's filed route for it to be eligible. Use this for
    // departures (where spawnWaypoint is a synthetic runway-end fix that
    // never appears in real FPs) or any rule where you want a directional
    // filter beyond DEP/ARR. E.g. routeContains: "BATAG,PO302" keeps only
    // LFPO departures heading southeast on the BATAG family.
    // autoBoundary ignores routeContains / excludeNonRouting — the boundary
    // crossing IS the routing filter. DEP/ARR filters still apply.
    const rcList = (autoBoundary ? "" : rule.routeContains || "")
      .toUpperCase()
      .trim()
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    let matches = pool.filter((p) => {
      if (dDepList.length && !dDepList.includes(p.origin)) return false;
      if (dArrList.length && !dArrList.includes(p.dest)) return false;
      if (rcList.length) {
        const tokens = (p.route || "")
          .toUpperCase()
          .split(/\s+/)
          .map((t: string) => t.split("/")[0]);
        if (!rcList.some((tok: string) => tokens.includes(tok))) return false;
      }
      return true;
    });

    // ---- autoBoundary: derive each aircraft's entry into the session FIR
    // from its OWN filed route (a filter before the count loop — the rate math
    // below is untouched).
    //
    // Two sources, in order of preference:
    //   1. BOUNDARY GEOMETRY from the ESE's [AIRSPACE] sectorlines — the first
    //      place the route actually crosses the FIR edge. Works with any ESE
    //      and any AIRAC, and puts the aircraft exactly on the boundary
    //      instead of at the nearest published gate.
    //   2. FIR_COPX gates — the published crossing points, used when the file
    //      has no usable sector geometry.
    // spawnPlan[pool entry] = where and how that aircraft enters.
    // The level this aircraft will spawn at — its own filed cruise under
    // spawnAltMode "poolCruise", otherwise the rule's spawn altitude.
    const levelOf = (tmpl: any) =>
      rule.spawnAltMode === "poolCruise" ? (tmpl.cruiseFL || 350) * 100 : +rule.spawnAlt || 18000;

    let bandFallbackNote: string | null = null;
    const spawnPlan = new Map<
      any,
      { fixName: string; fixWp: any; at?: { lat: number; lon: number }; brg?: number }
    >();
    let ref: { lat: number; lon: number } | null = null;
    if (autoBoundary) {
      const fir = (boundaryFir || "").trim().toUpperCase();
      const wpByName = new Map(waypoints.map((w) => [String(w.name).toUpperCase(), w]));
      const segs = (firBounds || {})[fir] || [];
      const useGeometry = segs.length > 0;

      // Gates INTO the session FIR only (toFir filter): a route may cross a
      // neighbouring FIR first, and its first boundary fix overall would
      // spawn it a whole FIR too early.
      // fix -> the into-FIR entries published for it, each with the band of the
      // sector the traffic is arriving OUT of (the correct discriminator: it is
      // the airspace the aircraft is in when it reaches the fix).
      const gateEntries = new Map<string, { destApt: string; lower: number; upper: number }[]>();
      for (const c of copx || []) {
        if (c.kind !== "fir" || String(c.toFir || "").toUpperCase() !== fir) continue;
        const f = String(c.fix || "").toUpperCase();
        if (!wpByName.has(f)) continue;
        if (!gateEntries.has(f)) gateEntries.set(f, []);
        gateEntries.get(f)!.push({
          destApt: String(c.destApt || "").toUpperCase(),
          lower: +c.fromLower || 0,
          upper: c.fromUpper === undefined ? Infinity : +c.fromUpper,
        });
      }
      const gateApts = gateEntries;
      if (!fir || (!useGeometry && gateEntries.size === 0))
        return {
          aircraft: [],
          error: !fir
            ? "Auto-boundary spawn: set the scenario FIR in the C1 tab"
            : `Auto-boundary spawn: the loaded ESE has no ${fir} sector geometry and no ${fir} FIR_COPX gates`,
        };

      // Direction reference: centroid of the boundary, or of the gates.
      if (useGeometry) {
        let sLat = 0,
          sLon = 0;
        for (const sg of segs) {
          sLat += sg[0] + sg[2];
          sLon += sg[1] + sg[3];
        }
        ref = { lat: sLat / (segs.length * 2), lon: sLon / (segs.length * 2) };
      } else {
        let sLat = 0,
          sLon = 0;
        for (const f of gateEntries.keys()) {
          const w = wpByName.get(f)!;
          sLat += w.lat;
          sLon += w.lon;
        }
        ref = { lat: sLat / gateEntries.size, lon: sLon / gateEntries.size };
      }

      const dirList = (rule.entryDirection || "")
        .toUpperCase()
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const nDepArr = matches.length;
      let nBoundary = 0;
      let nBandFallback = 0;
      const survivors: any[] = [];
      for (const p of matches) {
        const toks = (p.route || "")
          .toUpperCase()
          .split(/\s+/)
          .filter(Boolean)
          .map((t: string) => t.split("/")[0]);
        let plan: {
          fixName: string;
          fixWp: any;
          at?: { lat: number; lon: number };
          brg?: number;
        } | null = null;

        const level = levelOf(p);
        let banded = true;

        if (useGeometry) {
          // Only the boundary that exists at THIS aircraft's level: most
          // sectorlines are low-level TMA/CTR edges deep inside the FIR, and a
          // UAC-level flight must not "enter" the FIR across one of those.
          const atLevel = segs.filter((sg) => sg.length < 6 || inBand(level, sg[4], sg[5]));
          const legs = toks.map((t: string) => wpByName.get(t)).filter(Boolean) as any[];
          const names = toks.filter((t: string) => wpByName.has(t));
          const scan = (use: number[][]) => {
            for (let i = 0; i < legs.length - 1; i++) {
              const hit = firstBoundaryHit(legs[i], legs[i + 1], use);
              if (!hit) continue;
              return {
                fixName: names[i + 1],
                fixWp: legs[i + 1],
                at: { lat: hit.lat, lon: hit.lon },
                brg: bearingBetween(legs[i].lat, legs[i].lon, legs[i + 1].lat, legs[i + 1].lon),
              };
            }
            return null;
          };
          plan = scan(atLevel);
          // Rather than drop the aircraft, fall back to the level-blind
          // boundary and say so — a band that excludes everything usually means
          // unusual sector altitudes in the file, not that the flight stays out.
          if (!plan) {
            plan = scan(segs);
            if (plan) banded = false;
          }
        }
        if (!plan && gateEntries.size) {
          // Published gates: a route token counts as this aircraft's entry only
          // when one of its into-FIR entries is published for the band the
          // aircraft is in. The FROM sector's band is the discriminator — that
          // is the airspace the aircraft occupies on the way in. Without it an
          // FL360 flight on "DEKOD UN857 DISAK" gates at DEKOD (published
          // FL195-265) and spawns well inside the upper-level boundary.
          const dest = String(p.dest || "").toUpperCase();
          const pick = (bandAware: boolean) => {
            const fits = (e: { lower: number; upper: number }) =>
              !bandAware || inBand(level, e.lower, e.upper);
            const cands = toks.filter((t: string) => (gateEntries.get(t) || []).some(fits));
            if (!cands.length) return null;
            const fixName =
              cands.find((f: string) =>
                (gateEntries.get(f) || []).some((e) => e.destApt === dest && fits(e)),
              ) || cands[0];
            return { fixName, fixWp: wpByName.get(fixName)! };
          };
          plan = pick(true);
          if (!plan) {
            plan = pick(false);
            if (plan) banded = false;
          }
        }
        if (!plan) continue;
        nBoundary++;
        if (!banded) nBandFallback++;
        const at = plan.at || plan.fixWp;
        if (
          dirList.length &&
          !dirList.includes(octantOf(bearingBetween(ref.lat, ref.lon, at.lat, at.lon)))
        )
          continue;
        spawnPlan.set(p, plan);
        survivors.push(p);
      }
      if (!survivors.length)
        return {
          aircraft: [],
          error: `Auto-boundary (${useGeometry ? `${fir} boundary geometry` : `${fir} published gates`}): ${nDepArr} matched DEP/ARR · ${nBoundary} enter the FIR${nBandFallback ? ` (${nBandFallback} via band fallback)` : ""} · 0 match direction [${dirList.join(",") || "any"}]`,
        };
      matches = survivors;
      if (nBandFallback)
        bandFallbackNote = `${nBandFallback} aircraft matched no ${fir} boundary at their level — placed using the level-blind boundary instead`;
    }

    if (!autoBoundary && rule.excludeNonRouting !== false && rule.spawnWaypoint) {
      const spwn = rule.spawnWaypoint.toUpperCase();
      const rwy = (rule.rwyInUse || rule.runway || "").toUpperCase();
      const acceptable = new Set([spwn]);
      // Seed acceptable with routeContains tokens so the excludeNonRouting
      // check below doesn't reject aircraft that already passed the
      // routeContains filter (especially relevant for departures where the
      // synthetic spawnWaypoint won't be in any FP).
      for (const tok of rcList) acceptable.add(tok);
      for (const s of getStars() || []) {
        if ((s.iaf || "").toUpperCase() !== spwn) continue;
        if (rwy && (s.runway || "").toUpperCase() !== rwy) continue;
        const wpts = (s.waypoints || []).map((w: string) => w.toUpperCase());
        const iafIdx = wpts.indexOf(spwn);
        if (iafIdx < 0) continue;
        for (let i = 0; i < iafIdx; i++) acceptable.add(wpts[i]);
      }
      const before = matches.length;
      matches = matches.filter((p) =>
        (p.route || "")
          .toUpperCase()
          .split(/\s+/)
          .some((t: string) => acceptable.has(t.split("/")[0])),
      );
      if (!matches.length) {
        const upstreams = [...acceptable].filter((w) => w !== spwn);
        const hint = upstreams.length
          ? ` (or its STAR entry fix${upstreams.length > 1 ? "es" : ""}: ${upstreams.join(", ")})`
          : "";
        return {
          aircraft: [],
          error: `No pool aircraft route via "${rule.spawnWaypoint}"${hint}. ${before} matched DEP/ARR. Disable "Exclude non-routing" to override.`,
        };
      }
    }
    if (!matches.length)
      return {
        aircraft: [],
        error: `No pool aircraft match DEP="${dDep || "any"}" ARR="${dArr || "any"}"`,
      };
    const count = Math.max(1, Math.floor(rule.duration / intMin) + 1);
    const schedule = buildSchedule(rule, count, intMin);
    const anchorPrior = rule.spawnAnchor === "priorFix";
    const priorMax = +rule.priorFixMaxNm || 80;
    let excluded = 0;
    const out = [];
    for (let i = 0; i < Math.min(count, matches.length); i++) {
      const tmpl = matches[i];
      const startMin = schedule[i];
      const fpR = tmpl.route || pickFP();
      const typ = tmpl.type || pickPool(rule.typePool, i);

      // ---- per-aircraft spawn resolution (post-rc3; legacy rules without
      // spawnMode take the `wp`/rule-level path exactly as before).
      // Entry fix: the rule's waypoint, or this aircraft's own boundary gate.
      let spawnName: string = rule.spawnWaypoint;
      let spawnWp: any = wp;
      // Geometric entry: the exact point the route crosses the FIR edge, with
      // the leg's inbound bearing. Set only when boundary geometry produced it.
      let crossAt: { lat: number; lon: number } | null = null;
      let crossBrg: number | null = null;
      if (autoBoundary) {
        const plan = spawnPlan.get(tmpl)!;
        spawnName = plan.fixName;
        spawnWp = plan.fixWp;
        if (plan.at && plan.brg !== undefined) {
          crossAt = plan.at;
          crossBrg = plan.brg;
        }
      }
      // spawnAnchor "priorFix": walk back from the entry fix in the aircraft's
      // own filed route to the previous resolvable fix, so the real filed leg
      // into the boundary gets flown. Falls back to the entry fix when there
      // is none, it's not in this FP, or it's farther than priorFixMaxNm.
      const entryName = spawnName;
      const entryWp = spawnWp;
      if (hasNewFields && anchorPrior && fpR) {
        const toks = String(fpR)
          .toUpperCase()
          .split(/\s+/)
          .filter(Boolean)
          .map((t: string) => t.split("/")[0]);
        const idxE = toks.indexOf(String(entryName).toUpperCase());
        if (idxE > 0) {
          const pi = nearestResolvableIdx(toks, idxE - 1, -1, waypoints);
          if (pi >= 0) {
            const pw = waypoints.find((w) => w.name === toks[pi]);
            if (pw && entryWp && distanceNm(pw.lat, pw.lon, entryWp.lat, entryWp.lon) <= priorMax) {
              spawnName = toks[pi];
              spawnWp = pw;
            }
          }
        }
      }
      const priorChosen = spawnName !== entryName;
      // autoBoundary: SIM RTE = the aircraft's own FP RTE from the spawn fix —
      // per-rule sim-route templates don't exist in this mode.
      let simR =
        autoBoundary || priorChosen
          ? trimRoute(fpR, spawnName)
          : trimRoute(rule.simRouteTemplate || fpR, spawnName);
      let acLat = spawnWp ? spawnWp.lat : 0;
      let acLon = spawnWp ? spawnWp.lon : 0;
      let acPre = hasNewFields ? effPre : +rule.preEntryNm || 0;
      if (crossAt && crossBrg !== null && !priorChosen) {
        // Spawn effPre NM BEFORE the crossing point, on the inbound leg, so the
        // aircraft is outside the FIR and flies in along its own filed track.
        // The position is final — the serializer must not offset it again.
        const back = destinationPoint(crossAt.lat, crossAt.lon, (crossBrg + 180) % 360, effPre);
        acLat = back.lat;
        acLon = back.lon;
        acPre = 0;
      } else if (hasNewFields) {
        // Never-on-fix invariant: predict the serializer's offset. When no
        // inbound bearing is derivable even after the airway walks:
        // autoBoundary uses the last-resort radial (spawn effPre NM beyond the
        // gate on the centroid→gate radial, i.e. outside the FIR, heading
        // toward the gate); waypoint mode excludes the aircraft and reports it.
        const off = preEntryOffset(spawnName, simR, acPre, waypoints, fpR);
        if (!off && autoBoundary && ref && entryWp) {
          const radial = bearingBetween(ref.lat, ref.lon, entryWp.lat, entryWp.lon);
          const pos = destinationPoint(entryWp.lat, entryWp.lon, radial, effPre);
          spawnName = entryName;
          spawnWp = entryWp;
          simR = trimRoute(fpR, entryName);
          acLat = pos.lat;
          acLon = pos.lon;
          acPre = 0; // position is already offset — the serializer must not re-offset
        } else if (!off) {
          excluded++;
          continue;
        }
      }
      // spawnAltMode "poolCruise": each aircraft spawns at its own filed
      // cruise level (FP/level coherence for overflight bands). Absent or
      // "fixed" reproduces the original rule-level spawnAlt exactly. Note the
      // separation-mode interval math above keeps using the rule-level
      // representative speed (_rgs) — an acceptable approximation.
      const acAlt =
        rule.spawnAltMode === "poolCruise" ? (tmpl.cruiseFL || 350) * 100 : +rule.spawnAlt || 18000;
      let cs = tmpl.callsign;
      if (!cs) {
        cs = genCS((rule.isDeparture ? dArr : dDep) || "", usedSet, { heavy: !!rule.heavy });
      } else if (usedSet.has(cs)) {
        // Overlapping pool rules select the same entries — suffix A-Z so the
        // .scn never carries two aircraft with the same callsign; numeric
        // suffixes past Z keep the guarantee airtight for pathological pools.
        const base = cs;
        let s = 0;
        while (usedSet.has(cs) && s < 26) {
          cs = base + String.fromCharCode(65 + s);
          s++;
        }
        for (let n = 2; usedSet.has(cs); n++) cs = base + n;
      }
      usedSet.add(cs);
      out.push({
        id: uid(),
        callsign: cs,
        squawk:
          rule.squawkMode === "random"
            ? assignSquawk(rule, typ)
            : tmpl.squawk && tmpl.squawk !== "0000"
              ? tmpl.squawk
              : rule.squawk || "1000",
        type: typ,
        origin: tmpl.origin,
        dest: tmpl.dest,
        cruiseAlt: (tmpl.cruiseFL || 350) * 100,
        lat: acLat,
        lon: acLon,
        alt: acAlt,
        gs: computeSpawnGs(rule, typ, acAlt),
        runway: rwy,
        spawnWaypoint: spawnName,
        preEntryNm: acPre,
        fpRoute: fpR,
        simRoute: simR,
        starRoute: autoBoundary ? "" : rule.simRouteTemplate || "",
        start: Math.round(startMin * 10) / 10,
        reqAltWpt: rule.reqAltWpt,
        reqAltVal: rule.reqAltVal,
        isDeparture: rule.isDeparture,
        ruleId: rule.id,
        // Marks aircraft whose spawn went through the never-on-fix invariant;
        // the serializer's airway-aware heading fallbacks key off this.
        ...(hasNewFields ? { spawnMode: autoBoundary ? "autoBoundary" : "waypoint" } : {}),
      });
    }
    return {
      aircraft: out,
      error: null,
      warning:
        bandFallbackNote ||
        (excluded > 0
          ? `${excluded} aircraft skipped — no resolvable fix to derive the inbound leg (they would spawn exactly on ${rule.spawnWaypoint})`
          : null),
    };
  }

  const count = Math.max(1, Math.floor(rule.duration / intMin) + 1);
  const schedule = buildSchedule(rule, count, intMin);
  const useRand = rule.randomCallsign !== false;
  const regICAO = rule.isDeparture
    ? (rule.destPool || "").split(",")[0].trim()
    : (rule.originPool || "").split(",")[0].trim();
  let excludedTmpl = 0;
  const out = [];
  for (let i = 0; i < count; i++) {
    const startMin = schedule[i];
    const seq = (rule.seq || 1) + i;
    let cs;
    if (useRand) {
      cs = genCS(regICAO, usedSet, { heavy: !!rule.heavy });
    } else {
      cs = expandCS(rule.callsignPattern, seq);
      let b = 0;
      while (usedSet.has(cs) && b < 100) {
        b++;
        cs = expandCS(rule.callsignPattern, seq + b * 1000);
      }
      usedSet.add(cs);
    }
    const type = pickPool(rule.typePool, i);
    const fpR = pickFP();
    const simR = rule.simRouteTemplate
      ? trimRoute(rule.simRouteTemplate, rule.spawnWaypoint)
      : trimRoute(fpR, rule.spawnWaypoint);
    // Never-on-fix invariant (rules carrying the post-rc3 spawnMode key only —
    // raw legacy rules keep rc3 behavior byte-for-byte): when no inbound
    // bearing is derivable the aircraft would sit exactly on the fix, so it is
    // excluded and reported instead. Checked after the callsign draw so the
    // rng stream of the shared path is untouched.
    if (hasNewFields && !preEntryOffset(rule.spawnWaypoint, simR, effPre, waypoints, fpR)) {
      excludedTmpl++;
      continue;
    }
    out.push({
      id: uid(),
      callsign: cs,
      squawk: assignSquawk(rule, type),
      type,
      // Blank homeIcao (an explicit "" — legacy rules without the field still
      // get LFPG from homeApt) means overflight/transit: BOTH ends come from
      // the pools. Golden-safe: no fixture rule carries a homeIcao key.
      origin: rule.isDeparture
        ? homeApt(rule) || pickPool(rule.originPool, i)
        : pickPool(rule.originPool, i),
      dest: rule.isDeparture
        ? pickPool(rule.destPool, i)
        : homeApt(rule) || pickPool(rule.destPool, i),
      cruiseAlt: +rule.cruiseAlt || 35000,
      lat: wp.lat,
      lon: wp.lon,
      alt: +rule.spawnAlt || 18000,
      gs: computeSpawnGs(rule, type),
      runway: rwy,
      spawnWaypoint: rule.spawnWaypoint,
      preEntryNm: hasNewFields ? effPre : +rule.preEntryNm || 0,
      fpRoute: fpR,
      simRoute: simR,
      starRoute: rule.simRouteTemplate || "",
      start: Math.round(startMin * 10) / 10,
      reqAltWpt: rule.reqAltWpt,
      reqAltVal: rule.reqAltVal,
      isDeparture: rule.isDeparture,
      ruleId: rule.id,
      ...(hasNewFields ? { spawnMode: "waypoint" } : {}),
    });
  }
  return {
    aircraft: out,
    error: null,
    warning:
      excludedTmpl > 0
        ? `${excludedTmpl} aircraft skipped — no route to derive the inbound leg from (set an FP route template; they would spawn exactly on ${rule.spawnWaypoint})`
        : null,
  };
}
