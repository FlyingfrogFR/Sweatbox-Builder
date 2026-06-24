// s3.tsx — S3 Approach generator. Ported from scenario-s3-approach.js with its
// behavior unchanged; the only difference is helpers are imported from src/core
// and src/ui instead of being pulled off window.SB. Exposes RulePanel so the C1
// module can mount the same UI with mode="C1" (see c1.tsx).
//
// generateFromRule reads STARs via getStars() (App mirrors its stars state there,
// exactly as the rc3 shell mirrored to window.SB.stars), so the excludeNonRouting
// behavior is identical.

import { useState, useEffect, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { genCS } from "../core/callsign";
import { trimRoute } from "../core/route";
import { computeSpawnGs, machToTas, iasToTas } from "../core/speed";
import { GS_BY_WTC, TYPE_CATS } from "../core/tables";
import { poolIcaosByRegion } from "../core/callsign";
import { SRC_LABELS } from "../core/pool";
import { emptyRule } from "../core/model";
import { generateFromRule } from "../core/generateFromRule";
import { registerGenerator } from "./registry";

// Shared helper: parse a comma-separated, whitespace-tolerant token list.
const parseTokenList = (val: string) =>
  (val || "")
    .toUpperCase()
    .trim()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Does this pool entry's filed route contain at least one of the tokens?
const routeMatchesTokens = (route: string, tokens: string[]) => {
  if (!tokens.length) return true;
  const rTokens = (route || "").toUpperCase().split(/\s+/).map((t) => t.split("/")[0]);
  return tokens.some((tok) => rTokens.includes(tok));
};

function RateCalc() {
  const [rate, setRate] = useState(10);
  const [dur, setDur] = useState(30);
  const interval = 3600 / Math.max(rate, 0.1);
  const count = Math.max(1, Math.floor((dur * 60) / interval) + 1);
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 flex items-center gap-4 flex-wrap text-xs">
      <span className="font-semibold text-slate-400 uppercase">Rate Calc</span>
      <input
        type="number"
        value={rate}
        onChange={(e) => setRate(+e.target.value)}
        min="1"
        max="60"
        className="w-14 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 font-mono"
      />
      <span className="text-slate-400">/hr ×</span>
      <input
        type="number"
        value={dur}
        onChange={(e) => setDur(+e.target.value)}
        min="1"
        className="w-14 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 font-mono"
      />
      <span className="text-slate-400">min =</span>
      <span className="text-sky-400 font-mono text-sm">{count} aircraft</span>
      <span className="text-slate-300 font-mono"> · {interval.toFixed(0)}s</span>
    </div>
  );
}

function RuleEditor({ rule, waypoints, pool, stars, copx, scenarioIls, onSave, onCancel }: any) {
  const [r, setR] = useState(rule);
  const [wptSearch, setWptSearch] = useState(rule.spawnWaypoint || "");
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  const [routePickerSel, setRoutePickerSel] = useState(new Set<string>());
  const [selectedStarByIaf, setSelectedStarByIaf] = useState<Record<string, string>>({});
  const update = (f: string, v: any) => setR((prev: any) => ({ ...prev, [f]: v }));
  const pickWpt = (w: any) => {
    update("spawnWaypoint", w.name);
    setWptSearch(w.name);
  };

  const toggleCat = (cat: string) => {
    const cats = r.typeCategories || [];
    const newCats = cats.includes(cat) ? cats.filter((c: string) => c !== cat) : [...cats, cat];
    const tp =
      newCats.length > 0
        ? [...new Set(newCats.flatMap((c: string) => TYPE_CATS[c]?.types || []))].join(",")
        : r.typePool;
    setR((prev: any) => ({ ...prev, typeCategories: newCats, ...(newCats.length > 0 ? { typePool: tp } : {}) }));
  };
  const clearCats = () => setR((prev: any) => ({ ...prev, typeCategories: [], typePool: "" }));

  const appendApt = (field: string, icao: string) => {
    const cur = (r[field] || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    if (!cur.includes(icao)) update(field, [...cur, icao].join(","));
  };
  const removeApt = (field: string, icao: string) =>
    update(field, (r[field] || "").split(",").map((s: string) => s.trim()).filter((s: string) => s && s !== icao).join(","));

  const originsByRegion = useMemo(() => poolIcaosByRegion(pool, "origin"), [pool]);
  const destsByRegion = useMemo(() => poolIcaosByRegion(pool, "dest"), [pool]);

  const routeCandidates = useMemo(() => {
    const entries = pool.filter((p: any) => p.route);
    const filterIcaos = (r.isDeparture ? r.destPool : r.originPool || "")
      .split(",")
      .map((s: string) => s.trim().toUpperCase())
      .filter(Boolean);
    if (!filterIcaos.length) return entries;
    return entries.filter((p: any) => filterIcaos.includes(r.isDeparture ? p.dest : p.origin));
  }, [pool, r.isDeparture, r.originPool, r.destPool]);

  const toggleRoutePicker = (id: string) => {
    setRoutePickerSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const applyRouteSelection = () => {
    const sel = routeCandidates.filter((p: any) => routePickerSel.has(p.id));
    if (!sel.length) return;
    update("fpRouteTemplates", sel.map((p: any) => p.route));
    if (sel.length === 1) update("fpRouteTemplate", sel[0].route);
    setShowRoutePicker(false);
  };

  // STAR filter: runway AND (for arrivals) destination airport.
  const starsForRwy = useMemo(
    () =>
      (stars || []).filter((s: any) => {
        if (!r.rwyInUse || s.runway !== r.rwyInUse.toUpperCase()) return false;
        if (!r.isDeparture) {
          const apt = (r.poolArr || r.destPool || "").split(",")[0].trim().toUpperCase();
          if (apt && s.airport !== apt) return false;
        }
        return true;
      }),
    [stars, r.rwyInUse, r.isDeparture, r.poolArr, r.destPool],
  );
  const iafGroups = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const s of starsForRwy) {
      if (!g[s.iaf]) g[s.iaf] = [];
      g[s.iaf].push(s);
    }
    return Object.entries(g).map(([iaf, starList]) => ({ iaf, starList }));
  }, [starsForRwy]);
  const getCopx = (iaf: string) => (copx || []).find((c: any) => c.fix === iaf);
  const applyStarConfig = (iaf: string, star: any, c: any) => {
    setWptSearch(iaf);
    setR((prev: any) => ({
      ...prev,
      spawnWaypoint: iaf,
      simRouteTemplate: star.waypoints.join(" "),
      reqAltWpt: iaf,
      ...(c ? { reqAltVal: c.level } : {}),
    }));
  };

  const wptMatches = useMemo(() => {
    const f = wptSearch.trim().toUpperCase();
    if (!f || f === r.spawnWaypoint) return [];
    return waypoints.filter((w: any) => w.name.startsWith(f)).slice(0, 10);
  }, [wptSearch, waypoints, r.spawnWaypoint]);
  const repGs = (() => {
    if (r.gsMode === "fixed") return computeSpawnGs(r, "");
    const ft = (r.typePool || "").split(",")[0].trim().toUpperCase();
    return computeSpawnGs(r, ft) || GS_BY_WTC.M;
  })();
  const intMin =
    r.schedulingMode === "separation"
      ? (r.nmSeparation / Math.max(repGs, 1)) * 60
      : 60 / Math.max(r.rate, 0.1);
  const count = Math.max(1, Math.floor(r.duration / intMin) + 1);
  const sampleTimes: string[] = [];
  for (let i = 0; i < Math.min(count, 6); i++) sampleTimes.push((r.startOffset + i * intMin).toFixed(1));
  const poolMatches = useMemo(() => {
    if (!r.poolSource) return [];
    const d = (r.poolDep || "").toUpperCase().trim();
    const a = (r.poolArr || "").toUpperCase().trim();
    const dList = d.split(",").map((s: string) => s.trim()).filter(Boolean);
    const aList = a.split(",").map((s: string) => s.trim()).filter(Boolean);
    const rcList = parseTokenList(r.routeContains);
    return pool.filter((p: any) => {
      if (dList.length && !dList.includes(p.origin)) return false;
      if (aList.length && !aList.includes(p.dest)) return false;
      if (!routeMatchesTokens(p.route, rcList)) return false;
      return true;
    });
  }, [r.poolSource, r.poolDep, r.poolArr, r.routeContains, pool]);
  const useRand = r.randomCallsign !== false;
  const activeCats = r.typeCategories || [];
  const multiRoutes = (r.fpRouteTemplates || []).filter(Boolean);
  const previewCS = useMemo(() => {
    if (!useRand || r.poolSource) return [];
    const reg = r.isDeparture
      ? (r.destPool || "").split(",")[0].trim()
      : (r.originPool || "").split(",")[0].trim();
    const used = new Set<string>();
    return Array.from({ length: 4 }, () => genCS(reg, used, { heavy: !!r.heavy }));
  }, [useRand, r.poolSource, r.heavy, r.isDeparture, r.originPool, r.destPool, r.id]);
  const trimPrev = useMemo(
    () => (r.spawnWaypoint ? trimRoute(r.simRouteTemplate || "", r.spawnWaypoint) : r.simRouteTemplate || ""),
    [r.simRouteTemplate, r.spawnWaypoint],
  );

  const speedPreview = useMemo(() => {
    if (r.gsMode !== "fixed") return null;
    const alt = +r.spawnAlt || 18000;
    const sp = +r.assignedSpeed || (r.speedType === "mach" ? 0.78 : 280);
    return r.speedType === "mach" ? Math.round(machToTas(sp, alt)) : Math.round(iasToTas(sp, alt));
  }, [r.gsMode, r.speedType, r.assignedSpeed, r.spawnAlt]);

  const acceptableEntrySet = useMemo(() => {
    const acceptable = new Set<string>();
    if (!r.spawnWaypoint) return acceptable;
    const spwn = r.spawnWaypoint.toUpperCase();
    acceptable.add(spwn);
    for (const tok of parseTokenList(r.routeContains)) acceptable.add(tok);
    const rwy = (r.rwyInUse || r.runway || "").toUpperCase();
    const apt = (r.poolArr || r.destPool || "").split(",")[0].trim().toUpperCase();
    for (const s of stars || []) {
      if ((s.iaf || "").toUpperCase() !== spwn) continue;
      if (rwy && (s.runway || "").toUpperCase() !== rwy) continue;
      if (apt && (s.airport || "").toUpperCase() !== apt) continue;
      const wpts = (s.waypoints || []).map((w: string) => w.toUpperCase());
      const iafIdx = wpts.indexOf(spwn);
      if (iafIdx < 0) continue;
      for (let i = 0; i < iafIdx; i++) acceptable.add(wpts[i]);
    }
    return acceptable;
  }, [r.spawnWaypoint, r.rwyInUse, r.runway, r.poolArr, r.destPool, r.routeContains, stars]);

  const lb = "block text-xs text-slate-400 mb-1";
  const ip =
    "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 font-mono focus:border-sky-500 focus:outline-none";

  const RegionSelect = ({ regionsMap, onSelect }: any) =>
    Object.keys(regionsMap).length > 0 ? (
      <select
        onChange={(e) => {
          if (e.target.value) {
            onSelect(e.target.value);
            e.target.value = "";
          }
        }}
        className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 font-mono shrink-0"
      >
        <option value="">＋ pool</option>
        {Object.entries(regionsMap)
          .sort(([a]: any, [b]: any) => a.localeCompare(b))
          .map(([region, apts]: any) => (
            <optgroup key={region} label={region}>
              {apts.map((a: string) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
    ) : null;

  const rwyOptions = (scenarioIls || []).map((ils: any) => ils.name).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto border border-slate-700">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <Icon name="zap" className="text-sky-400" />
            {r.name || "New Rule"}
            <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded">{r.mode || "S3"}</span>
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">Identity & Direction</h4>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6">
                <label className={lb}>Rule Name</label>
                <input className={ip} value={r.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div className="col-span-3">
                <label className={lb}>Direction</label>
                <select
                  value={r.isDeparture ? "dep" : "arr"}
                  onChange={(e) => update("isDeparture", e.target.value === "dep")}
                  className={ip}
                >
                  <option value="arr">Arrival</option>
                  <option value="dep">Departure</option>
                </select>
              </div>
              <div className="col-span-3">
                <label className={lb}>Runway in use</label>
                {rwyOptions.length > 0 ? (
                  <select value={r.rwyInUse} onChange={(e) => update("rwyInUse", e.target.value)} className={ip}>
                    <option value="">— select —</option>
                    {rwyOptions.map((rw: string) => (
                      <option key={rw} value={rw}>
                        {rw}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={ip}
                    value={r.rwyInUse}
                    onChange={(e) => update("rwyInUse", e.target.value.toUpperCase())}
                    placeholder="27R"
                  />
                )}
              </div>
            </div>
          </section>

          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-3">Traffic Source</h4>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => update("poolSource", false)}
                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium ${!r.poolSource ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
              >
                <Icon name="zap" size={14} />
                Custom Pools
              </button>
              <button
                onClick={() => update("poolSource", true)}
                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium ${r.poolSource ? "bg-purple-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
              >
                <Icon name="layers" size={14} />
                From Aircraft Pool
              </button>
            </div>

            {r.poolSource ? (
              <div className="bg-slate-950/60 border border-purple-900/40 rounded p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lb}>Filter DEP</label>
                    <input className={ip} value={r.poolDep} onChange={(e) => update("poolDep", e.target.value.toUpperCase())} placeholder="e.g. EGLL" />
                  </div>
                  <div>
                    <label className={lb}>Filter ARR</label>
                    <input className={ip} value={r.poolArr} onChange={(e) => update("poolArr", e.target.value.toUpperCase())} placeholder="e.g. LFPG" />
                  </div>
                </div>
                <div>
                  <label className={lb}>Route must contain (CSV)</label>
                  <input className={ip} value={r.routeContains || ""} onChange={(e) => update("routeContains", e.target.value.toUpperCase())} placeholder="BATAG,PO302" />
                  <p className="text-xs text-slate-500 mt-1">
                    Comma-separated waypoint tokens. The pool aircraft's filed FP must contain at least
                    one of these. Use for departures (synthetic spawn fix won't be in any real FP) or to
                    narrow the routing direction beyond DEP/ARR.
                  </p>
                </div>
                {poolMatches.length === 0 ? (
                  <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/30 rounded p-2 flex items-center gap-1.5">
                    <Icon name="alert" size={12} />
                    No pool matches for current filters
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        {poolMatches.length} match{poolMatches.length !== 1 ? "es" : ""}
                      </span>
                      <div className="flex items-center gap-3">
                        {r.spawnWaypoint &&
                          (() => {
                            const missing = poolMatches.filter(
                              (p: any) =>
                                !(p.route || "").toUpperCase().split(/\s+/).some((t: string) => acceptableEntrySet.has(t.split("/")[0])),
                            );
                            if (!missing.length) return null;
                            const upstreams = [...acceptableEntrySet].filter((w) => w !== r.spawnWaypoint.toUpperCase());
                            const tip = upstreams.length
                              ? `Acceptable: ${r.spawnWaypoint} or any STAR entry / routeContains token — ${upstreams.join(", ")}`
                              : `Acceptable: ${r.spawnWaypoint} (no STAR entries or routeContains tokens — re-parse ESE or set routeContains if expected)`;
                            return (
                              <span className="text-xs text-amber-400 flex items-center gap-1" title={tip}>
                                <Icon name="alert" size={11} />
                                {missing.length} FP{missing.length !== 1 ? "s" : ""} not routing via{" "}
                                <span className="font-mono font-semibold">{r.spawnWaypoint}</span> or its STAR entries
                                / routeContains tokens
                                {r.excludeNonRouting !== false ? (
                                  <span className="text-rose-400 ml-1">→ excluded</span>
                                ) : (
                                  <span className="text-slate-500 ml-1">(included, forced)</span>
                                )}
                              </span>
                            );
                          })()}
                        {r.spawnWaypoint && (
                          <label
                            className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none"
                            title="When enabled, aircraft whose FP does not include the entry fix OR any of its STAR entry waypoints OR any routeContains token are excluded from generation. Disable if you have set a shared Sim Route override."
                          >
                            <input
                              type="checkbox"
                              checked={r.excludeNonRouting !== false}
                              onChange={(e) => update("excludeNonRouting", e.target.checked)}
                              className="accent-sky-500"
                            />
                            Exclude non-routing
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="max-h-44 overflow-auto bg-slate-950 rounded border border-slate-800 divide-y divide-slate-800">
                      {poolMatches.map((p: any) => {
                        const routeTokens = (p.route || "").toUpperCase().split(/\s+/).map((t: string) => t.split("/")[0]);
                        const hasEntry = !r.spawnWaypoint || routeTokens.some((t: string) => acceptableEntrySet.has(t));
                        const sl = SRC_LABELS[p.source] || { label: p.source, color: "text-slate-400 bg-slate-800" };
                        return (
                          <div key={p.id} className={`px-2.5 py-1.5 ${!hasEntry && r.spawnWaypoint ? "bg-amber-950/20" : ""}`}>
                            <div className="flex items-center gap-2 text-xs font-mono">
                              <span className="font-semibold text-slate-200 w-20 shrink-0">
                                {p.callsign || <span className="text-slate-600 italic">no cs</span>}
                              </span>
                              <span className="text-slate-500">
                                {p.origin}→{p.dest}
                              </span>
                              {p.cruiseFL && <span className="text-slate-600">FL{p.cruiseFL}</span>}
                              <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${sl.color}`}>{sl.label}</span>
                              {!hasEntry && r.spawnWaypoint && (
                                <span className="ml-auto text-amber-400 shrink-0" title={`FP route does not include ${r.spawnWaypoint} or any of its STAR entries / routeContains tokens`}>
                                  ⚠ no entry
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-600 font-mono truncate mt-0.5">
                              {(p.route || "").split(" ").slice(0, 14).join(" ")}
                              {(p.route || "").split(" ").length > 14 ? "…" : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <label className={lb}>
                    Sim Route{" "}
                    <span className="text-slate-600 font-normal">
                      (shared override — leave blank to auto-trim each aircraft's own FP from spawn)
                    </span>
                  </label>
                  <textarea
                    className={`${ip} min-h-[48px]`}
                    value={r.simRouteTemplate}
                    onChange={(e) => update("simRouteTemplate", e.target.value)}
                    placeholder={r.spawnWaypoint ? `e.g. ${r.spawnWaypoint} WAYPOINT ... DEST` : "Select a spawn waypoint above first"}
                  />
                  {r.simRouteTemplate && trimPrev && trimPrev !== r.simRouteTemplate && (
                    <div className="text-xs bg-sky-950/40 border border-sky-900 rounded p-2 font-mono text-sky-300 mt-1">
                      <span className="text-slate-400">After trim from {r.spawnWaypoint}: </span>
                      {trimPrev}
                    </div>
                  )}
                </div>
                <div>
                  <label className={lb}>Fallback Type Pool</label>
                  <input className={ip} value={r.typePool} onChange={(e) => update("typePool", e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-950/60 border border-slate-800 rounded p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={useRand} onChange={(e) => update("randomCallsign", e.target.checked)} className="accent-sky-500" />
                    Random ICAO callsign
                  </label>
                  <label className={`flex items-center gap-2 text-sm cursor-pointer ${!useRand ? "text-slate-600" : "text-slate-300"}`}>
                    <input type="checkbox" checked={!!r.heavy} onChange={(e) => update("heavy", e.target.checked)} disabled={!useRand} className="accent-rose-500" />
                    Heavy / long-haul
                  </label>
                  {useRand && previewCS.length > 0 && (
                    <div className="text-xs text-slate-500 font-mono">Preview: {previewCS.join(", ")}</div>
                  )}
                  {!useRand && (
                    <div>
                      <label className={lb}>Callsign Pattern</label>
                      <input className={ip} value={r.callsignPattern} onChange={(e) => update("callsignPattern", e.target.value)} placeholder="AFR###" />
                    </div>
                  )}
                </div>

                <div>
                  <label className={lb}>Squawk</label>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => update("squawkMode", "fixed")}
                      className={`px-3 py-1.5 rounded text-xs font-medium ${r.squawkMode !== "random" ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
                    >
                      Fixed
                    </button>
                    <button
                      onClick={() => update("squawkMode", "random")}
                      className={`px-3 py-1.5 rounded text-xs font-medium ${r.squawkMode === "random" ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
                    >
                      Random
                    </button>
                  </div>
                  {r.squawkMode !== "random" ? (
                    <input className={`${ip} w-32`} value={r.squawk} onChange={(e) => update("squawk", e.target.value)} />
                  ) : (
                    <div className="bg-slate-950/60 border border-slate-800 rounded p-3 space-y-2">
                      {[
                        { val: "1000", label: "1000 — Mode S / TCAS (EU standard)" },
                        { val: "2000", label: "2000 — Standard (no TCAS)" },
                        { val: "5600", label: "56XX — Random 5600-5677" },
                      ].map(({ val, label }) => (
                        <label key={val} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(r.squawkOptions || []).includes(val)}
                            onChange={(e) => {
                              const opts = (r.squawkOptions || []).filter((o: string) => o !== val);
                              if (e.target.checked) opts.push(val);
                              update("squawkOptions", opts);
                            }}
                            className="accent-sky-500"
                          />
                          <span className="font-mono text-sky-300 text-xs font-semibold">{val}</span>{" "}
                          <span className="text-slate-400 text-xs">{label}</span>
                        </label>
                      ))}
                      <p className="text-xs text-amber-400/80">
                        <Icon name="alert" size={11} className="inline mr-1" />H and J aircraft cannot receive 1000 —
                        will be assigned 2000 instead.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className={lb}>Aircraft Type — ICAO WTC or manual CSV</label>
                  <div className="flex gap-1.5 mb-2 flex-wrap">
                    {Object.entries(TYPE_CATS).map(([cat, { label, desc, color }]: any) => (
                      <button
                        key={cat}
                        onClick={() => toggleCat(cat)}
                        title={desc}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium border transition-colors ${activeCats.includes(cat) ? `${color} opacity-100` : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"}`}
                      >
                        <span className="font-bold text-sm leading-none">{cat}</span>
                        <span className="opacity-80">— {label}</span>
                      </button>
                    ))}
                    {activeCats.length > 0 && (
                      <button onClick={clearCats} className="px-2 py-2 text-xs text-rose-400 hover:text-rose-300 border border-rose-800/50 rounded">
                        ✕ clear all
                      </button>
                    )}
                  </div>
                  {activeCats.length > 0 && (
                    <div className="mb-2 text-xs text-slate-500 font-mono bg-slate-950/60 rounded p-2 space-y-0.5">
                      {activeCats.map((c: string) => (
                        <div key={c}>
                          <span className="text-sky-400 font-semibold">
                            {c} — {TYPE_CATS[c]?.label}
                          </span>
                          : {(TYPE_CATS[c]?.types || []).slice(0, 8).join(", ")}
                          {(TYPE_CATS[c]?.types || []).length > 8 ? ` +${(TYPE_CATS[c]?.types || []).length - 8}` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                  <input className={ip} value={r.typePool} onChange={(e) => update("typePool", e.target.value)} placeholder="A320,B738 — or use category buttons above" />
                </div>

                <div>
                  <label className={lb}>{r.isDeparture ? "Destination" : "Origin"} Pool</label>
                  <div className="flex gap-2">
                    <input
                      className={`${ip} flex-1`}
                      value={r.isDeparture ? r.destPool : r.originPool}
                      onChange={(e) => update(r.isDeparture ? "destPool" : "originPool", e.target.value)}
                    />
                    <RegionSelect
                      regionsMap={r.isDeparture ? destsByRegion : originsByRegion}
                      onSelect={(icao: string) => appendApt(r.isDeparture ? "destPool" : "originPool", icao)}
                    />
                  </div>
                  {(r.isDeparture ? r.destPool : r.originPool) && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {(r.isDeparture ? r.destPool : r.originPool)
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean)
                        .map((a: string) => (
                          <span key={a} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 rounded text-xs font-mono text-slate-300">
                            {a}
                            <button onClick={() => removeApt(r.isDeparture ? "destPool" : "originPool", a)} className="text-slate-500 hover:text-rose-400 ml-0.5">
                              ✕
                            </button>
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {!r.isDeparture && (
            <section>
              <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2 flex items-center gap-2">
                <Icon name="star" size={12} />
                STAR & Entry Configuration{" "}
                <span className="text-slate-600 font-normal normal-case">(from ESE [SIDSSTARS] + [COPX])</span>
              </h4>
              {!(stars && stars.length) ? (
                <p className="text-xs text-slate-500">No STARs found — paste an ESE file containing [SIDSSTARS] in the Navdata tab.</p>
              ) : !r.rwyInUse ? (
                <p className="text-xs text-slate-500">Select a runway above to see available STARs.</p>
              ) : starsForRwy.length === 0 ? (
                <p className="text-xs text-amber-400">No STARs found for RWY {r.rwyInUse} in the ESE.</p>
              ) : (
                <div className="space-y-2">
                  {iafGroups.map(({ iaf, starList }: any) => {
                    const c = getCopx(iaf);
                    const isActive = r.spawnWaypoint === iaf;
                    const selStar = starList.find((s: any) => s.name === (selectedStarByIaf[iaf] || starList[0].name)) || starList[0];
                    return (
                      <div key={iaf} className={`border rounded p-3 ${isActive ? "bg-sky-950/30 border-sky-700" : "bg-slate-950/60 border-slate-800"}`}>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-semibold text-slate-200">Entry: {iaf}</span>
                            {c && <span className="text-xs text-emerald-400 bg-emerald-900/30 px-1.5 py-0.5 rounded">COPX FL{Math.round(c.level / 100)} at entry</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {starList.length > 1 && (
                              <select
                                value={selectedStarByIaf[iaf] || starList[0].name}
                                onChange={(e) => setSelectedStarByIaf((prev) => ({ ...prev, [iaf]: e.target.value }))}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                              >
                                {starList.map((s: any) => (
                                  <option key={s.name} value={s.name}>
                                    {s.name} ({s.waypoints.length} wpts)
                                  </option>
                                ))}
                              </select>
                            )}
                            {starList.length === 1 && <span className="text-xs font-mono text-slate-400">{starList[0].name}</span>}
                            <button
                              onClick={() => applyStarConfig(iaf, selStar, c)}
                              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${isActive ? "bg-emerald-700 text-white" : "bg-slate-700 hover:bg-sky-600 text-slate-200"}`}
                            >
                              {isActive ? "✓ Active" : "Use this entry"}
                            </button>
                          </div>
                        </div>
                        {isActive && r.simRouteTemplate && (
                          <div className="mt-1.5 text-xs font-mono text-slate-500 truncate">
                            Route: {r.simRouteTemplate.split(" ").slice(0, 10).join(" ")}
                            {r.simRouteTemplate.split(" ").length > 10 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {iafGroups.length > 1 && (
                    <div className="bg-amber-950/40 border border-amber-800/50 rounded p-3 text-xs text-amber-300 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <Icon name="alert" size={12} />
                        Multiple entry fixes for RWY {r.rwyInUse}: {iafGroups.map((g: any) => g.iaf).join(", ")}
                      </div>
                      <div>
                        Each entry fix requires a <strong>separate rule</strong>. This rule is using:{" "}
                        <span className="font-mono">{r.spawnWaypoint || "(none selected)"}</span>.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">
              Spawn Waypoint{" "}
              {r.spawnWaypoint && <span className="text-sky-400 font-mono normal-case text-xs">· {r.spawnWaypoint}</span>}
            </h4>
            <div className="relative">
              <input
                value={wptSearch}
                onChange={(e) => {
                  setWptSearch(e.target.value.toUpperCase());
                  update("spawnWaypoint", e.target.value.toUpperCase());
                }}
                placeholder="Type waypoint name..."
                className={ip}
              />
              {wptMatches.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-slate-800 border border-slate-700 rounded mt-1 z-10 max-h-48 overflow-auto">
                  {wptMatches.map((w: any) => (
                    <button key={`${w.type}-${w.name}`} onClick={() => pickWpt(w)} className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-xs font-mono flex justify-between">
                      <span className="text-slate-200">{w.name}</span>
                      <span className="text-slate-500">
                        {w.lat.toFixed(4)}, {w.lon.toFixed(4)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">Sim route auto-trimmed from this waypoint. Set via STAR section above or manually.</p>
          </section>

          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">Rate & Timing</h4>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => update("schedulingMode", "rate")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium ${r.schedulingMode !== "separation" ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
              >
                <Icon name="zap" size={12} />
                Rate (/hr)
              </button>
              <button
                onClick={() => r.gsMode === "fixed" && update("schedulingMode", "separation")}
                disabled={r.gsMode !== "fixed"}
                title={r.gsMode !== "fixed" ? "Requires ATC-assigned speed — set speed mode above first" : ""}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-opacity ${r.schedulingMode === "separation" ? "bg-sky-700 text-white" : r.gsMode !== "fixed" ? "bg-slate-800 text-slate-600 opacity-40 cursor-not-allowed" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
              >
                <Icon name="plane" size={12} />
                NM Separation
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {r.schedulingMode === "separation" ? (
                <div className="col-span-2">
                  <label className={lb}>
                    Separation: <span className="text-sky-300 font-mono">{r.nmSeparation || 10} NM</span>
                    <span className="text-slate-500 ml-2">≈ {(intMin * 60).toFixed(0)}s at {repGs} kt GS</span>
                  </label>
                  <input type="range" min="5" max="15" step="1" className="w-full mt-1" value={r.nmSeparation || 10} onChange={(e) => update("nmSeparation", +e.target.value)} />
                  <div className="text-xs text-slate-600 mt-1 font-mono">
                    5 NM = {((5 / Math.max(repGs, 1)) * 3600).toFixed(0)}s · 10 NM = {((10 / Math.max(repGs, 1)) * 3600).toFixed(0)}s · 15 NM ={" "}
                    {((15 / Math.max(repGs, 1)) * 3600).toFixed(0)}s
                  </div>
                </div>
              ) : (
                <div>
                  <label className={lb}>Rate (/hr)</label>
                  <input type="number" className={ip} value={r.rate} onChange={(e) => update("rate", +e.target.value)} min="1" max="60" />
                </div>
              )}
              <div>
                <label className={lb}>Duration (min)</label>
                <input type="number" className={ip} value={r.duration} onChange={(e) => update("duration", +e.target.value)} min="1" />
              </div>
              <div>
                <label className={lb}>Start Offset (min)</label>
                <input type="number" step="0.1" className={ip} value={r.startOffset} onChange={(e) => update("startOffset", +e.target.value)} />
              </div>
              <div>
                <label className={lb}>Seq start</label>
                <input type="number" className={ip} value={r.seq} onChange={(e) => update("seq", +e.target.value)} min="1" />
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-400 bg-slate-950/60 rounded p-2 font-mono">
              ≈{r.poolSource ? Math.min(count, poolMatches.length || count) : count} aircraft · {(intMin * 60).toFixed(0)}s apart · T+:{" "}
              {sampleTimes.join(", ")}
              {count > sampleTimes.length ? "…" : ""}
            </div>
          </section>

          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">Flight Parameters</h4>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className={lb}>Cruise Alt (ft)</label>
                <input type="number" className={ip} value={r.cruiseAlt} onChange={(e) => update("cruiseAlt", +e.target.value)} />
              </div>
              <div>
                <label className={lb}>Spawn Alt (ft)</label>
                <input type="number" className={ip} value={r.spawnAlt} onChange={(e) => update("spawnAlt", +e.target.value)} />
              </div>
              <div>
                <label className={lb}>
                  Pre-entry offset: <span className="text-sky-300 font-mono">{r.preEntryNm || 0} NM</span>
                </label>
                <input type="range" min="0" max="50" step="1" className="w-full mt-1" value={r.preEntryNm || 0} onChange={(e) => update("preEntryNm", +e.target.value)} />
              </div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded p-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-semibold uppercase text-slate-400">Spawn Speed</label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      update("gsMode", "wtc");
                      if (r.schedulingMode === "separation") update("schedulingMode", "rate");
                    }}
                    className={`px-3 py-1.5 rounded text-xs font-medium ${r.gsMode !== "fixed" && r.gsMode !== "natural" ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
                  >
                    By WTC category
                  </button>
                  <button
                    onClick={() => update("gsMode", "fixed")}
                    className={`px-3 py-1.5 rounded text-xs font-medium ${r.gsMode === "fixed" ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
                  >
                    ATC-assigned
                  </button>
                  <button
                    onClick={() => {
                      update("gsMode", "natural");
                      if (r.schedulingMode === "separation") update("schedulingMode", "rate");
                    }}
                    className={`px-3 py-1.5 rounded text-xs font-medium ${r.gsMode === "natural" ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
                  >
                    Natural (accel from rest)
                  </button>
                </div>
              </div>
              {r.gsMode === "natural" ? (
                <div className="text-xs text-amber-300 bg-amber-950/30 border border-amber-900/40 rounded p-2 font-mono">
                  Aircraft spawns at 0 kt; SIMDATA accelerates from rest at 0.010 unit/s. Best for departures spawning at low altitude.
                </div>
              ) : r.gsMode !== "fixed" ? (
                <div className="text-xs text-slate-400 font-mono bg-slate-950 rounded p-2">
                  <div className="text-slate-500 mb-1">Per-aircraft GS based on ICAO WTC of the assigned type:</div>
                  <div>
                    Light: <span className="text-sky-300">{GS_BY_WTC.L} kt</span> · Medium: <span className="text-sky-300">{GS_BY_WTC.M} kt</span> · Heavy:{" "}
                    <span className="text-sky-300">{GS_BY_WTC.H} kt</span> · Super: <span className="text-sky-300">{GS_BY_WTC.J} kt</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div>
                      <label className={lb}>Speed type</label>
                      <select
                        value={r.speedType || "ias"}
                        onChange={(e) => {
                          const t = e.target.value;
                          update("speedType", t);
                          if (t === "mach" && r.assignedSpeed > 10) update("assignedSpeed", 0.78);
                          if (t === "ias" && r.assignedSpeed < 10) update("assignedSpeed", 280);
                        }}
                        className={ip}
                      >
                        <option value="ias">IAS (kt)</option>
                        <option value="mach">Mach</option>
                      </select>
                    </div>
                    <div>
                      <label className={lb}>{r.speedType === "mach" ? "Mach" : "IAS (kt)"}</label>
                      <input type="number" step={r.speedType === "mach" ? "0.01" : "5"} className={ip} value={r.assignedSpeed} onChange={(e) => update("assignedSpeed", +e.target.value)} />
                    </div>
                    <div className="text-xs text-sky-300 bg-sky-950/40 border border-sky-900 rounded p-2 font-mono">
                      <div className="text-slate-400">TAS @ {r.spawnAlt}ft:</div>
                      <div className="text-sm">≈ {speedPreview} kt</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">Simulates an en-route controller having assigned a speed — converted to TAS at the spawn altitude using ISA.</p>
                </div>
              )}
            </div>
          </section>

          {!r.poolSource && (
            <section>
              <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">Route Templates</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={lb}>
                      FP Route Template <span className="text-slate-600">(full filed route)</span>
                    </label>
                    {pool.length > 0 && (
                      <button
                        onClick={() => setShowRoutePicker((p) => !p)}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${showRoutePicker ? "bg-sky-700 border-sky-600 text-white" : "bg-slate-800 border-slate-700 text-slate-300 hover:text-slate-100"}`}
                      >
                        <Icon name="layers" size={12} />
                        Pick from Pool {showRoutePicker ? "▲" : "▼"}
                      </button>
                    )}
                  </div>

                  {multiRoutes.length > 0 && (
                    <div className="mb-2 bg-purple-950/40 border border-purple-900/30 rounded p-2 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-purple-300 font-medium">{multiRoutes.length} routes — randomly assigned per aircraft</span>
                        <button onClick={() => update("fpRouteTemplates", [])} className="text-xs text-rose-400 hover:text-rose-300">
                          ✕ clear
                        </button>
                      </div>
                      {multiRoutes.slice(0, 3).map((rt: string, i: number) => (
                        <div key={i} className="text-xs text-slate-500 font-mono truncate">
                          {rt.split(" ").slice(0, 8).join(" ")}
                          {rt.split(" ").length > 8 ? "…" : ""}
                        </div>
                      ))}
                      {multiRoutes.length > 3 && <div className="text-xs text-slate-600">+{multiRoutes.length - 3} more…</div>}
                    </div>
                  )}

                  {showRoutePicker && (
                    <div className="mb-2 bg-slate-950 border border-slate-700 rounded overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                        <span className="text-xs text-slate-400">
                          {routePickerSel.size} selected · will be <strong className="text-slate-200">randomly assigned</strong>
                        </span>
                        <button onClick={applyRouteSelection} disabled={!routePickerSel.size} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 rounded text-xs text-white font-medium">
                          Apply ({routePickerSel.size})
                        </button>
                      </div>
                      {routeCandidates.length > 0 ? (
                        <div className="max-h-52 overflow-auto divide-y divide-slate-800">
                          {routeCandidates.map((p: any) => {
                            const hasSpawn = r.spawnWaypoint && (p.route || "").toUpperCase().includes(r.spawnWaypoint.toUpperCase());
                            return (
                              <div
                                key={p.id}
                                onClick={() => toggleRoutePicker(p.id)}
                                className={`px-3 py-2.5 cursor-pointer hover:bg-slate-800 transition-colors group ${routePickerSel.has(p.id) ? "bg-sky-950/30" : ""}`}
                              >
                                <div className="flex items-center gap-2 mb-0.5">
                                  <input type="checkbox" readOnly checked={routePickerSel.has(p.id)} className="accent-sky-500 shrink-0" />
                                  <span className="text-xs font-mono font-semibold text-slate-200 group-hover:text-sky-300">
                                    {p.callsign || <span className="italic text-slate-500 font-normal">no callsign</span>}{" "}
                                    <span className="text-slate-400 font-normal">
                                      {p.origin}→{p.dest}
                                    </span>
                                    {p.cruiseFL && <span className="text-slate-500 ml-2">FL{p.cruiseFL}</span>}
                                  </span>
                                  <span className={`ml-auto text-xs px-1.5 py-0.5 rounded font-medium ${SRC_LABELS[p.source]?.color || "text-slate-400 bg-slate-800"}`}>
                                    {SRC_LABELS[p.source]?.label || p.source}
                                  </span>
                                  {r.spawnWaypoint && !hasSpawn && (
                                    <span className="text-xs text-amber-400" title={`Route doesn't include ${r.spawnWaypoint}`}>
                                      ⚠
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 font-mono truncate pl-5">
                                  {(p.route || "").split(" ").slice(0, 12).join(" ")}
                                  {(p.route || "").split(" ").length > 12 ? "…" : ""}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="p-3 text-xs text-slate-500">No pool entries match the current {r.isDeparture ? "destination" : "origin"} pool.</p>
                      )}
                    </div>
                  )}

                  <textarea
                    className={`${ip} min-h-[50px]`}
                    value={r.fpRouteTemplate}
                    onChange={(e) => {
                      update("fpRouteTemplate", e.target.value);
                      if (multiRoutes.length === 0) update("fpRouteTemplates", []);
                    }}
                    placeholder="Waypoint string — or use Pick from Pool above"
                  />
                </div>
                <div>
                  <label className={lb}>
                    Sim Route Template <span className="text-slate-500">(auto-trimmed from spawn waypoint)</span>
                  </label>
                  <textarea className={`${ip} min-h-[50px]`} value={r.simRouteTemplate} onChange={(e) => update("simRouteTemplate", e.target.value)} placeholder="Populated automatically when you select a STAR above" />
                </div>
                {trimPrev !== r.simRouteTemplate && (
                  <div className="text-xs bg-sky-950/40 border border-sky-900 rounded p-2 font-mono text-sky-300">
                    <div className="text-slate-400 mb-1">After trim from {r.spawnWaypoint}:</div>
                    {trimPrev || "(empty)"}
                  </div>
                )}
              </div>
            </section>
          )}

          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">
              Altitude Request <span className="text-slate-600 font-normal normal-case">(pre-populated from COPX when STAR is applied)</span>
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lb}>At waypoint</label>
                <input className={ip} value={r.reqAltWpt} onChange={(e) => update("reqAltWpt", e.target.value.toUpperCase())} />
              </div>
              <div>
                <label className={lb}>Request altitude (ft)</label>
                <input type="number" className={ip} value={r.reqAltVal} onChange={(e) => update("reqAltVal", e.target.value === "" ? "" : +e.target.value)} />
              </div>
            </div>
          </section>
        </div>
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200">
            Cancel
          </button>
          <button onClick={() => onSave(r)} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded text-sm text-white font-medium">
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
}

// The reusable per-mode rule list panel. Renders only rules whose .mode matches
// the `mode` prop. Exposed for the C1 module to reuse.
export function RulePanel({ mode, scenario, onChange, waypoints, pool, stars, copx }: any) {
  const [editing, setEditing] = useState<any>(null);
  const allRules = scenario.rules || [];
  const rules = allRules.filter((r: any) => r.mode === mode);

  const save = (r: any) => {
    const rWithMode = { ...r, mode: r.mode || mode };
    const arr = allRules.filter((x: any) => x.id !== rWithMode.id).concat(rWithMode);
    onChange({ ...scenario, rules: arr });
    setEditing(null);
  };
  const remove = (id: string) => {
    if (!confirm("Remove rule and its generated aircraft?")) return;
    onChange({
      ...scenario,
      rules: allRules.filter((r: any) => r.id !== id),
      aircraft: scenario.aircraft.filter((a: any) => a.ruleId !== id),
    });
  };
  const applyRule = (r: any) => {
    const others = scenario.aircraft.filter((a: any) => a.ruleId !== r.id);
    const used = new Set<string>(others.map((a: any) => a.callsign).filter(Boolean));
    const { aircraft, error } = generateFromRule(r, waypoints, used, pool);
    if (error) {
      alert(error);
      return;
    }
    onChange({ ...scenario, aircraft: [...others, ...aircraft].sort((a: any, b: any) => (+a.start || 0) - (+b.start || 0)) });
  };
  const applyAll = () => {
    const myIds = new Set(rules.map((r: any) => r.id));
    let ac = scenario.aircraft.filter((a: any) => !a.ruleId || !myIds.has(a.ruleId));
    const used = new Set<string>(ac.map((a: any) => a.callsign).filter(Boolean));
    for (const r of rules) {
      const { aircraft: gen, error } = generateFromRule(r, waypoints, used, pool);
      if (error) {
        alert(`${r.name}: ${error}`);
        continue;
      }
      ac = [...ac, ...gen];
    }
    onChange({ ...scenario, aircraft: ac.sort((a: any, b: any) => (+a.start || 0) - (+b.start || 0)) });
  };
  const newRule = () => setEditing({ ...emptyRule(), mode });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">
          {mode} Rules <span className="text-slate-500 text-sm font-normal">({rules.length} of {allRules.length} total)</span>
        </h2>
        <div className="flex gap-2">
          {rules.length > 0 && (
            <button onClick={applyAll} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm text-white font-medium flex items-center gap-1">
              <Icon name="zap" size={14} />
              Apply All ({mode})
            </button>
          )}
          <button onClick={newRule} className="flex items-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-500 rounded text-sm text-white">
            <Icon name="plus" />
            New {mode} Rule
          </button>
        </div>
      </div>
      <RateCalc />
      <div className="space-y-3">
        {rules.map((r: any) => {
          const intMin = 60 / Math.max(r.rate, 0.1);
          const count = Math.max(1, Math.floor(r.duration / intMin) + 1);
          const poolMatches = r.poolSource
            ? pool.filter((p: any) => {
                const d = (r.poolDep || "").trim().toUpperCase();
                const a = (r.poolArr || "").trim().toUpperCase();
                const dList = d.split(",").map((s: string) => s.trim()).filter(Boolean);
                const aList = a.split(",").map((s: string) => s.trim()).filter(Boolean);
                const rcList = parseTokenList(r.routeContains);
                if (dList.length && !dList.includes(p.origin)) return false;
                if (aList.length && !aList.includes(p.dest)) return false;
                if (!routeMatchesTokens(p.route, rcList)) return false;
                return true;
              }).length
            : null;
          const multiRoute = (r.fpRouteTemplates || []).length > 1;
          const activeCats = (r.typeCategories || []).join("+");
          const speedLabel =
            r.gsMode === "fixed"
              ? r.speedType === "mach"
                ? `M${(r.assignedSpeed || 0.78).toFixed(2)}`
                : `${r.assignedSpeed || 280}kt IAS`
              : r.gsMode === "natural"
                ? "natural"
                : "by WTC";
          const rcTokens = parseTokenList(r.routeContains);
          return (
            <div key={r.id} className="bg-slate-900 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-semibold text-slate-200">{r.name}</span>
                    {r.isDeparture ? (
                      <span className="px-2 py-0.5 bg-amber-900/40 text-amber-300 rounded text-xs">DEP</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-emerald-900/40 text-emerald-300 rounded text-xs">ARR</span>
                    )}
                    {r.poolSource && <span className="px-2 py-0.5 bg-purple-900/40 text-purple-300 rounded text-xs">POOL</span>}
                    {rcTokens.length > 0 && (
                      <span className="px-2 py-0.5 bg-orange-900/40 text-orange-300 rounded text-xs" title={`FP route must include: ${rcTokens.join(", ")}`}>
                        RT {rcTokens[0]}
                        {rcTokens.length > 1 ? ` +${rcTokens.length - 1}` : ""}
                      </span>
                    )}
                    {activeCats && !r.poolSource && <span className="px-2 py-0.5 bg-sky-900/40 text-sky-300 rounded text-xs">WTC {activeCats}</span>}
                    {r.heavy && !r.poolSource && !activeCats && <span className="px-2 py-0.5 bg-rose-900/40 text-rose-300 rounded text-xs">HEAVY</span>}
                    {multiRoute && <span className="px-2 py-0.5 bg-purple-900/30 text-purple-300 rounded text-xs">{r.fpRouteTemplates.length} routes</span>}
                    {(r.rwyInUse || r.runway) && <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">RWY {r.rwyInUse || r.runway}</span>}
                    {r.squawkMode === "random" && <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">SQK rnd</span>}
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">{speedLabel}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono space-x-3">
                    <span>{r.spawnWaypoint || "(no wpt)"}</span>
                    <span>·</span>
                    <span>{r.rate}/hr</span>
                    <span>·</span>
                    <span>{r.duration}min</span>
                    <span>·</span>
                    <span>T+{r.startOffset}</span>
                    {(r.preEntryNm || 0) > 0 && (
                      <>
                        <span>·</span>
                        <span>-{r.preEntryNm}NM</span>
                      </>
                    )}
                  </div>
                  {r.poolSource ? (
                    <div className="text-xs text-slate-500 mt-1">{poolMatches !== null ? `${poolMatches} pool matches` : ""}</div>
                  ) : (
                    <div className="text-xs text-slate-500 mt-1">
                      ≈{count} aircraft · {Math.round(intMin * 60)}s interval
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => applyRule(r)} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-xs text-white font-medium">
                    Apply
                  </button>
                  <button onClick={() => setEditing(r)} className="text-sky-400 hover:text-sky-300 p-1.5">
                    <Icon name="edit" size={14} />
                  </button>
                  <button onClick={() => remove(r.id)} className="text-rose-400 hover:text-rose-300 p-1.5">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {!rules.length && (
          <div className="bg-slate-900 rounded-lg p-8 text-center text-slate-500 text-sm">
            No {mode} rules yet. Click "New {mode} Rule" to get started.
          </div>
        )}
      </div>
      {editing && (
        <RuleEditor
          rule={editing}
          waypoints={waypoints}
          pool={pool}
          stars={stars}
          copx={copx}
          scenarioIls={scenario.ils}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

registerGenerator({
  id: "S3",
  label: "S3 Approach",
  render: (props: any) => <RulePanel mode="S3" {...props} />,
});
