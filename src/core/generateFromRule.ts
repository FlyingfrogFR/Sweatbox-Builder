// generateFromRule.ts
//
// Copied VERBATIM from the rc3 shell (function generateFromRule). The only
// changes are mechanical: Math.random() -> rng(), window.SB.stars -> getStars(),
// and explicit imports of the helpers the shell exposed on window.SB. The
// algorithm — squawk '0000'->rule fallback, routeContains filter, the
// excludeNonRouting acceptable-set built from STAR upstream fixes, the
// rate/separation interval math, count = floor(duration/intMin)+1 — is unchanged.

import { computeSpawnGs } from "./speed";
import { GS_BY_WTC } from "./tables";
import { trimRoute, pickPool, expandCS } from "./route";
import { genCS } from "./callsign";
import { assignSquawk } from "./squawk";
import { uid } from "./uid";
import { getStars } from "./stars";
import { rng } from "./rng";

export function generateFromRule(
  rule: any,
  waypoints: any[],
  usedSet: Set<string> = new Set(),
  pool: any[] = [],
) {
  const wp = waypoints.find((w) => w.name === rule.spawnWaypoint);
  if (!wp) return { aircraft: [], error: `Waypoint "${rule.spawnWaypoint}" not found in navdata` };
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
    const dDepList = dDep.split(",").map((s: string) => s.trim()).filter(Boolean);
    const dArrList = dArr.split(",").map((s: string) => s.trim()).filter(Boolean);
    // routeContains — comma-separated waypoint tokens that MUST appear in
    // the pool aircraft's filed route for it to be eligible. Use this for
    // departures (where spawnWaypoint is a synthetic runway-end fix that
    // never appears in real FPs) or any rule where you want a directional
    // filter beyond DEP/ARR. E.g. routeContains: "BATAG,PO302" keeps only
    // LFPO departures heading southeast on the BATAG family.
    const rcList = (rule.routeContains || "")
      .toUpperCase()
      .trim()
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
    let matches = pool.filter((p) => {
      if (dDepList.length && !dDepList.includes(p.origin)) return false;
      if (dArrList.length && !dArrList.includes(p.dest)) return false;
      if (rcList.length) {
        const tokens = (p.route || "").toUpperCase().split(/\s+/).map((t: string) => t.split("/")[0]);
        if (!rcList.some((tok: string) => tokens.includes(tok))) return false;
      }
      return true;
    });
    if (rule.excludeNonRouting !== false && rule.spawnWaypoint) {
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
        (p.route || "").toUpperCase().split(/\s+/).some((t: string) => acceptable.has(t.split("/")[0])),
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
      return { aircraft: [], error: `No pool aircraft match DEP="${dDep || "any"}" ARR="${dArr || "any"}"` };
    const count = Math.max(1, Math.floor(rule.duration / intMin) + 1);
    const out = [];
    for (let i = 0; i < Math.min(count, matches.length); i++) {
      const tmpl = matches[i];
      const startMin = rule.startOffset + i * intMin;
      const fpR = tmpl.route || pickFP();
      const typ = tmpl.type || pickPool(rule.typePool, i);
      let cs = tmpl.callsign;
      if (!cs) cs = genCS((rule.isDeparture ? dArr : dDep) || "", usedSet, { heavy: !!rule.heavy });
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
        lat: wp.lat,
        lon: wp.lon,
        alt: +rule.spawnAlt || 18000,
        gs: computeSpawnGs(rule, typ),
        runway: rwy,
        spawnWaypoint: rule.spawnWaypoint,
        preEntryNm: +rule.preEntryNm || 0,
        fpRoute: fpR,
        simRoute: trimRoute(rule.simRouteTemplate || fpR, rule.spawnWaypoint),
        starRoute: rule.simRouteTemplate || "",
        start: Math.round(startMin * 10) / 10,
        reqAltWpt: rule.reqAltWpt,
        reqAltVal: rule.reqAltVal,
        isDeparture: rule.isDeparture,
        ruleId: rule.id,
      });
    }
    return { aircraft: out, error: null };
  }

  const count = Math.max(1, Math.floor(rule.duration / intMin) + 1);
  const useRand = rule.randomCallsign !== false;
  const regICAO = rule.isDeparture
    ? (rule.destPool || "").split(",")[0].trim()
    : (rule.originPool || "").split(",")[0].trim();
  const out = [];
  for (let i = 0; i < count; i++) {
    const startMin = rule.startOffset + i * intMin;
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
    out.push({
      id: uid(),
      callsign: cs,
      squawk: assignSquawk(rule, type),
      type,
      origin: rule.isDeparture ? "LFPG" : pickPool(rule.originPool, i),
      dest: rule.isDeparture ? pickPool(rule.destPool, i) : "LFPG",
      cruiseAlt: +rule.cruiseAlt || 35000,
      lat: wp.lat,
      lon: wp.lon,
      alt: +rule.spawnAlt || 18000,
      gs: computeSpawnGs(rule, type),
      runway: rwy,
      spawnWaypoint: rule.spawnWaypoint,
      preEntryNm: +rule.preEntryNm || 0,
      fpRoute: fpR,
      simRoute: simR,
      starRoute: rule.simRouteTemplate || "",
      start: Math.round(startMin * 10) / 10,
      reqAltWpt: rule.reqAltWpt,
      reqAltVal: rule.reqAltVal,
      isDeparture: rule.isDeparture,
      ruleId: rule.id,
    });
  }
  return { aircraft: out, error: null };
}
