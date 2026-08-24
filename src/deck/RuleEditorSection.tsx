// RuleEditorSection.tsx — the deck-native "edit all fields" rule editor.
// Replaces the legacy slate-styled RuleEditor exported from
// src/generators/s3.tsx inside FLIGHTDECK: every one of its ~30 fields, every
// helper (region picker, WTC category buttons, computed cadence preview,
// pre-entry slider with its 1 NM minimum, STAR/COPX suggestions, pick-routes-
// from-pool) and the exact same derived maths — only the surface changed.
//
// Layout: a header row that carries the rule identity and the CANCEL / SAVE
// keys, then a scrollable body of six labelled sections in a two-column grid
// (IDENTITY · ENTRY · SCHEDULE · CALLSIGN & SQUAWK · FLIGHT · STAR/ENTRY), so
// thirty fields read as six groups instead of a wall of inputs.
//
// Semantic colour: the direction switch is the editor's most important
// control, so it is a red ARRIVAL latch and a blue DEPARTURE latch; discarding
// unsaved edits is hold-to-confirm; SAVE is the section's primary lever. Every
// other control merely switches a mode, so it stays neutral.
//
// Field visibility follows generateFromRule, not the legacy branches: fields
// the legacy editor hid in AIRCRAFT POOL mode (squawk, callsign fallback, FP
// route fallback) are kept reachable with a note saying exactly when they
// apply, since generateFromRule does read them there.
import { useState, useEffect, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { DeckKey, HoldKey, Latch } from "./ui";
import { genCS, poolIcaosByRegion } from "../core/callsign";
import { trimRoute } from "../core/route";
import { computeSpawnGs, machToTas, iasToTas } from "../core/speed";
import { GS_BY_WTC, TYPE_CATS } from "../core/tables";

const INPUT =
  "h-8 bg-inset border border-bd3 rounded-md px-2.5 font-mono text-[12px] text-tx1 outline-none focus:border-cy-fg";
const AREA =
  "w-full bg-inset border border-bd3 rounded-md px-2.5 py-2 font-mono text-[11.5px] leading-snug text-tx1 outline-none focus:border-cy-fg";
const LABEL = "block text-[9.5px] font-bold tracking-[0.1em] text-tx8 mb-1";
const HEAD = "text-[10px] font-extrabold tracking-[0.16em] text-tx6";
const SUBHEAD = "text-[9.5px] font-extrabold tracking-[0.14em] text-tx7";
const CARD = "bg-panel border border-bd1 rounded-xl p-3.5 flex flex-col gap-3";
const SUB = "bg-inset border border-bd1 rounded-lg p-3 flex flex-col gap-2.5";
const HINT = "text-[10px] font-mono text-tx7 mt-1";
const CHIP = "text-[9px] font-bold px-1.5 py-0.5 rounded border";
const EMPTY: any[] = [];

// Deck-token pool-source chips (core's SRC_LABELS carries legacy palette classes).
const SRC: Record<string, { label: string; cls: string }> = {
  vatsim: { label: "VATSIM", cls: "text-gn-fg bg-gn-bg border-gn-bd" },
  simbrief: { label: "SIMBRIEF", cls: "text-cy-fg bg-cy-soft border-cy-bd" },
  manual: { label: "MANUAL", cls: "text-tx5 bg-inset border-bd3" },
};
const srcOf = (s: string) =>
  SRC[s] || { label: (s || "?").toUpperCase(), cls: "text-tx5 bg-inset border-bd3" };

// WTC categories: only Heavy/Super carry a tone — amber, for their wingspan /
// wake caveats (an amber meaning in TONES.md). Light and Medium stay neutral:
// red is reserved for arrivals/destructive, and green means live/verified
// data, not "small aircraft" — the legacy severity ramp was decoration.
const CAT_TONE: Record<string, string | undefined> = {
  L: undefined,
  M: undefined,
  H: "amber",
  J: "amber",
};

// Comma-separated, whitespace-tolerant token list (same helper as s3.tsx).
const parseTokenList = (val: string) =>
  (val || "")
    .toUpperCase()
    .trim()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const csv = (val: string) =>
  (val || "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

const routeMatchesTokens = (route: string, tokens: string[]) => {
  if (!tokens.length) return true;
  const rTokens = (route || "")
    .toUpperCase()
    .split(/\s+/)
    .map((t) => t.split("/")[0]);
  return tokens.some((tok) => rTokens.includes(tok));
};

const preview = (route: string, n: number) => {
  const toks = (route || "").split(" ").filter(Boolean);
  return toks.slice(0, n).join(" ") + (toks.length > n ? " …" : "");
};

function Section({ title, icon, hint, children, className = "" }: any) {
  return (
    <section className={`${CARD} ${className}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        {icon && (
          <span className="text-tx7 self-center">
            <Icon name={icon} size={12} />
          </span>
        )}
        <span className={HEAD}>{title}</span>
        {hint && <span className="text-[10px] text-tx8">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Note({ tone = "am", icon = "alert", children }: any) {
  const cls =
    tone === "rd"
      ? "text-rd-fg bg-rd-bg border-rd-bd"
      : tone === "gn"
        ? "text-gn-fg bg-gn-bg border-gn-bd"
        : tone === "cy"
          ? "text-cy-fg bg-cy-soft border-cy-bd"
          : "text-am-fg bg-am-bg border-am-bd";
  return (
    <div
      className={`flex items-start gap-2 text-[11px] leading-snug rounded-lg border px-3 py-2 ${cls}`}
    >
      {icon && (
        <span className="mt-px flex-none">
          <Icon name={icon} size={12} />
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** "＋ from pool" picker, grouped by region — same helper as the legacy editor. */
function RegionSelect({ regionsMap, onSelect, title }: any) {
  const entries = Object.entries(regionsMap || {});
  if (!entries.length) return null;
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onSelect(e.target.value)}
      className={`${INPUT} w-[132px] flex-none text-tx3`}
      title={title}
    >
      <option value="">＋ from pool</option>
      {entries
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
  );
}

/** One staged flight plan, as a row in the pool-match list / route picker. */
function PlanRow({ p, zebra, warn, selectable, selected, onClick, right, tokens }: any) {
  const s = srcOf(p.source);
  return (
    <div
      onClick={onClick}
      className={`px-2.5 py-1.5 border-t border-rowdiv first:border-t-0 ${
        selected ? "bg-cy-row" : warn ? "bg-am-bg/40" : zebra ? "bg-panel/50" : ""
      } ${onClick ? "cursor-pointer hover:bg-cy-fg/5" : ""}`}
    >
      <div className="flex items-center gap-2 font-mono text-[11px]">
        {selectable && (
          <input type="checkbox" readOnly checked={!!selected} className="accent-cy-fg flex-none" />
        )}
        <span className="font-semibold text-tx1 w-[74px] shrink-0 truncate">
          {p.callsign || <span className="text-tx8 italic font-normal">no cs</span>}
        </span>
        <span className="text-tx5">
          {p.origin || "—"}→{p.dest || "—"}
        </span>
        {p.cruiseFL && <span className="text-tx7">FL{p.cruiseFL}</span>}
        <span className={`${CHIP} ${s.cls}`}>{s.label}</span>
        {right}
      </div>
      <div className="mt-0.5 pl-0.5 font-mono text-[10.5px] text-tx7 truncate">
        {preview(p.route, tokens || 14)}
      </div>
    </div>
  );
}

export function RuleEditorSection({
  rule,
  waypoints,
  stars,
  copx,
  pool,
  runways,
  onSave,
  onCancel,
}: any) {
  const [d, setD] = useState<any>(rule || {});
  const [wptSearch, setWptSearch] = useState(rule?.spawnWaypoint || "");
  const [wptOpen, setWptOpen] = useState(false);
  const [showRoutePicker, setShowRoutePicker] = useState(false);
  const [routeSel, setRouteSel] = useState<Set<string>>(new Set());
  const [starByIaf, setStarByIaf] = useState<Record<string, string>>({});

  // A different rule mounted into the same component starts a fresh draft.
  useEffect(() => {
    setD(rule || {});
    setWptSearch(rule?.spawnWaypoint || "");
    setWptOpen(false);
    setShowRoutePicker(false);
    setRouteSel(new Set());
    setStarByIaf({});
  }, [rule?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable empty fallbacks — a fresh `[]` per render would re-run every memo
  // below whenever a navdata prop is missing.
  const allWpts = useMemo(() => waypoints || EMPTY, [waypoints]);
  const allStars = useMemo(() => stars || EMPTY, [stars]);
  const allCopx = useMemo(() => copx || EMPTY, [copx]);
  const allPool = useMemo(() => pool || EMPTY, [pool]);
  const allRwys = useMemo(() => runways || EMPTY, [runways]);

  const up = (f: string, v: any) => setD((prev: any) => ({ ...prev, [f]: v }));
  const dirty = useMemo(() => JSON.stringify(d) !== JSON.stringify(rule || {}), [d, rule]);

  const pickWpt = (w: any) => {
    setD((prev: any) => ({ ...prev, spawnWaypoint: w.name }));
    setWptSearch(w.name);
    setWptOpen(false);
  };

  // ---------- aircraft type categories ----------
  const activeCats: string[] = d.typeCategories || [];
  const toggleCat = (cat: string) => {
    const next = activeCats.includes(cat)
      ? activeCats.filter((c) => c !== cat)
      : [...activeCats, cat];
    const tp = next.length
      ? [...new Set(next.flatMap((c) => TYPE_CATS[c]?.types || []))].join(",")
      : d.typePool;
    setD((prev: any) => ({
      ...prev,
      typeCategories: next,
      ...(next.length ? { typePool: tp } : {}),
    }));
  };
  const clearCats = () => setD((prev: any) => ({ ...prev, typeCategories: [], typePool: "" }));

  // ---------- origin / destination pools ----------
  const appendApt = (field: string, icao: string) => {
    const cur = csv(d[field]);
    if (!cur.includes(icao)) up(field, [...cur, icao].join(","));
  };
  const removeApt = (field: string, icao: string) =>
    up(
      field,
      csv(d[field])
        .filter((s: string) => s !== icao)
        .join(","),
    );

  const originsByRegion = useMemo(() => poolIcaosByRegion(allPool, "origin"), [allPool]);
  const destsByRegion = useMemo(() => poolIcaosByRegion(allPool, "dest"), [allPool]);
  const poolField = d.isDeparture ? "destPool" : "originPool";

  // ---------- runway options from the parsed navdata ----------
  const focusApt = (
    (d.homeIcao || "").trim() || (d.poolArr || d.destPool || "").split(",")[0].trim()
  ).toUpperCase();
  const rwyGroups = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (apt: string, id: string) => {
      const ident = String(id || "")
        .toUpperCase()
        .trim();
      if (!ident) return;
      const key =
        String(apt || "")
          .toUpperCase()
          .trim() || "OTHER";
      if (!m.has(key)) m.set(key, new Set());
      m.get(key)!.add(ident);
    };
    for (const rw of allRwys) {
      add(rw.airport, rw.ident1);
      add(rw.airport, rw.ident2);
    }
    for (const s of allStars) add(s.airport, s.runway); // ESE runways too, so STARs are reachable without a .sct
    return [...m.entries()]
      .map(([apt, set]) => ({ apt, list: [...set].sort() }))
      .sort((a, b) =>
        a.apt === focusApt ? -1 : b.apt === focusApt ? 1 : a.apt.localeCompare(b.apt),
      );
  }, [allRwys, allStars, focusApt]);

  // ---------- pool-sourced traffic ----------
  const poolMatches = useMemo(() => {
    if (!d.poolSource) return [];
    const dList = parseTokenList(d.poolDep);
    const aList = parseTokenList(d.poolArr);
    const rcList = parseTokenList(d.routeContains);
    return allPool.filter((p: any) => {
      if (dList.length && !dList.includes(p.origin)) return false;
      if (aList.length && !aList.includes(p.dest)) return false;
      if (!routeMatchesTokens(p.route, rcList)) return false;
      return true;
    });
  }, [d.poolSource, d.poolDep, d.poolArr, d.routeContains, allPool]);

  // Entry fixes a filed route may legally pass through: the spawn fix, every
  // routeContains token, and every STAR waypoint upstream of the spawn fix.
  const acceptableEntrySet = useMemo(() => {
    const acceptable = new Set<string>();
    if (!d.spawnWaypoint) return acceptable;
    const spwn = String(d.spawnWaypoint).toUpperCase();
    acceptable.add(spwn);
    for (const tok of parseTokenList(d.routeContains)) acceptable.add(tok);
    const rwy = (d.rwyInUse || d.runway || "").toUpperCase();
    const apt = (d.poolArr || d.destPool || "").split(",")[0].trim().toUpperCase();
    for (const s of allStars) {
      if ((s.iaf || "").toUpperCase() !== spwn) continue;
      if (rwy && (s.runway || "").toUpperCase() !== rwy) continue;
      if (apt && (s.airport || "").toUpperCase() !== apt) continue;
      const wpts = (s.waypoints || []).map((w: string) => w.toUpperCase());
      const iafIdx = wpts.indexOf(spwn);
      if (iafIdx < 0) continue;
      for (let i = 0; i < iafIdx; i++) acceptable.add(wpts[i]);
    }
    return acceptable;
  }, [d.spawnWaypoint, d.rwyInUse, d.runway, d.poolArr, d.destPool, d.routeContains, allStars]);

  const hasEntry = (p: any) =>
    !d.spawnWaypoint ||
    (p.route || "")
      .toUpperCase()
      .split(/\s+/)
      .some((t: string) => acceptableEntrySet.has(t.split("/")[0]));
  const missingEntry = useMemo(
    () => (d.spawnWaypoint ? poolMatches.filter((p: any) => !hasEntry(p)) : []),
    [poolMatches, acceptableEntrySet, d.spawnWaypoint], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const upstreams = [...acceptableEntrySet].filter(
    (w) => w !== String(d.spawnWaypoint || "").toUpperCase(),
  );

  // ---------- route templates from the pool ----------
  const routeCandidates = useMemo(() => {
    const entries = allPool.filter((p: any) => p.route);
    const filterIcaos = parseTokenList(d.isDeparture ? d.destPool : d.originPool);
    if (!filterIcaos.length) return entries;
    return entries.filter((p: any) => filterIcaos.includes(d.isDeparture ? p.dest : p.origin));
  }, [allPool, d.isDeparture, d.originPool, d.destPool]);
  const toggleRouteSel = (id: string) =>
    setRouteSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const applyRouteSelection = () => {
    const sel = routeCandidates.filter((p: any) => routeSel.has(p.id));
    if (!sel.length) return;
    setD((prev: any) => ({
      ...prev,
      fpRouteTemplates: sel.map((p: any) => p.route),
      ...(sel.length === 1 ? { fpRouteTemplate: sel[0].route } : {}),
    }));
    setShowRoutePicker(false);
  };
  const multiRoutes = (d.fpRouteTemplates || []).filter(Boolean);

  // ---------- STARs (arrivals) ----------
  const starsForRwy = useMemo(
    () =>
      allStars.filter((s: any) => {
        if (!d.rwyInUse || s.runway !== String(d.rwyInUse).toUpperCase()) return false;
        if (!d.isDeparture) {
          const apt = (d.poolArr || d.destPool || "").split(",")[0].trim().toUpperCase();
          if (apt && s.airport !== apt) return false;
        }
        return true;
      }),
    [allStars, d.rwyInUse, d.isDeparture, d.poolArr, d.destPool],
  );
  // The airport the STAR list is filtered by — same expression the filter uses,
  // so the empty state names the airport that actually narrowed the list.
  const starApt = (d.poolArr || d.destPool || "").split(",")[0].trim().toUpperCase();
  const iafGroups = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const s of starsForRwy) {
      if (!g[s.iaf]) g[s.iaf] = [];
      g[s.iaf].push(s);
    }
    return Object.entries(g).map(([iaf, starList]) => ({ iaf, starList }));
  }, [starsForRwy]);
  const getCopx = (iaf: string) => allCopx.find((c: any) => c.fix === iaf);
  const applyStarConfig = (iaf: string, star: any, c: any) => {
    setWptSearch(iaf);
    setWptOpen(false);
    setD((prev: any) => ({
      ...prev,
      spawnWaypoint: iaf,
      simRouteTemplate: (star.waypoints || []).join(" "),
      reqAltWpt: iaf,
      ...(c ? { reqAltVal: c.level } : {}),
    }));
  };

  // ---------- spawn waypoint search ----------
  const wptMatches = useMemo(() => {
    const f = wptSearch.trim().toUpperCase();
    if (!f) return [];
    const hits = allWpts.filter((w: any) => w.name.startsWith(f)).slice(0, 10);
    return hits.length === 1 && hits[0].name === f ? [] : hits;
  }, [wptSearch, allWpts]);
  const wptKnown = useMemo(
    () => !d.spawnWaypoint || allWpts.some((w: any) => w.name === d.spawnWaypoint),
    [allWpts, d.spawnWaypoint],
  );

  // ---------- cadence (identical maths to generateFromRule) ----------
  const repGs = (() => {
    if (d.gsMode === "fixed") return computeSpawnGs(d, "");
    const ft = (d.typePool || "").split(",")[0].trim().toUpperCase();
    return computeSpawnGs(d, ft) || GS_BY_WTC.M;
  })();
  const intMin =
    d.schedulingMode === "separation"
      ? (d.nmSeparation / Math.max(repGs, 1)) * 60
      : 60 / Math.max(d.rate, 0.1);
  const count = Math.max(1, Math.floor(d.duration / intMin) + 1);
  const sampleTimes: string[] = [];
  for (let i = 0; i < Math.min(count, 6); i++)
    sampleTimes.push(((+d.startOffset || 0) + i * intMin).toFixed(1));
  const shownCount = Number.isFinite(count)
    ? d.poolSource
      ? Math.min(count, poolMatches.length || count)
      : count
    : 0;
  const gapSec = Number.isFinite(intMin) ? (intMin * 60).toFixed(0) : "—";

  // ---------- callsign / speed previews ----------
  const useRand = d.randomCallsign !== false;
  const previewCS = useMemo(() => {
    if (!useRand || d.poolSource) return [];
    const reg = d.isDeparture
      ? (d.destPool || "").split(",")[0].trim()
      : (d.originPool || "").split(",")[0].trim();
    const used = new Set<string>();
    return Array.from({ length: 4 }, () => genCS(reg, used, { heavy: !!d.heavy }));
    // d.id keeps the legacy behaviour: a different rule re-rolls the sample.
  }, [useRand, d.poolSource, d.heavy, d.isDeparture, d.originPool, d.destPool, d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const trimPrev = useMemo(
    () =>
      d.spawnWaypoint
        ? trimRoute(d.simRouteTemplate || "", d.spawnWaypoint)
        : d.simRouteTemplate || "",
    [d.simRouteTemplate, d.spawnWaypoint],
  );
  const speedPreview = useMemo(() => {
    if (d.gsMode !== "fixed") return null;
    const alt = +d.spawnAlt || 18000;
    const sp = +d.assignedSpeed || (d.speedType === "mach" ? 0.78 : 280);
    return d.speedType === "mach" ? Math.round(machToTas(sp, alt)) : Math.round(iasToTas(sp, alt));
  }, [d.gsMode, d.speedType, d.assignedSpeed, d.spawnAlt]);

  // Explicitly blank home ICAO (not merely absent) on a template-mode rule =
  // overflight/transit: both ends come from the pools, so both pool inputs show.
  const homeBlank = !(d.homeIcao ?? "").trim() && d.homeIcao !== undefined && !d.poolSource;
  const poolCruise = !!d.poolSource && d.spawnAltMode === "poolCruise";
  const cadence =
    d.schedulingMode === "separation" ? `${d.nmSeparation || 10} NM` : `${d.rate ?? "—"}/hr`;

  return (
    <div className="flex flex-col h-full min-h-0 bg-panel">
      {/* ================= header — identity + commit ================= */}
      <div className="sticky top-0 z-30 flex-none flex items-center gap-2.5 px-4 py-2.5 border-b border-bd1 bg-inset">
        <span className={d.isDeparture ? "text-dep" : "text-arr"}>
          <Icon name="zap" size={15} />
        </span>
        <span className="text-[13px] font-semibold text-tx1 truncate max-w-[280px]">
          {d.name || "New rule"}
        </span>
        <span
          className={`${CHIP} tracking-[0.1em] ${
            d.isDeparture ? "text-dep bg-dep/10 border-dep/40" : "text-arr bg-arr/10 border-arr/40"
          }`}
        >
          {d.isDeparture ? "DEP" : "ARR"}
        </span>
        {d.mode && (
          <span className={`${CHIP} tracking-[0.1em] text-tx6 bg-inset border-bd3`}>{d.mode}</span>
        )}
        <span className="font-mono text-[10.5px] text-tx7 truncate hidden md:inline">
          {d.rwyInUse || d.runway || "no rwy"} · {d.spawnWaypoint || "no entry fix"} · {cadence} ·{" "}
          {d.duration ?? 0}m
        </span>
        <span className="flex-1" />
        {dirty && (
          <span className="text-[9.5px] font-bold tracking-[0.1em] text-am-fg">UNSAVED</span>
        )}
        {dirty ? (
          <HoldKey onHold={onCancel} title="Hold to discard every change made in this editor">
            <Icon name="x" size={12} />
            DISCARD
          </HoldKey>
        ) : (
          <DeckKey size="sm" onClick={onCancel} title="Close the editor">
            <Icon name="x" size={12} />
            CANCEL
          </DeckKey>
        )}
        <DeckKey
          size="lever"
          variant="primary"
          onClick={() => onSave(d)}
          title="Save every field and close the editor"
        >
          <Icon name="save" size={14} />
          SAVE RULE
        </DeckKey>
      </div>

      {/* ================= body ================= */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 items-start">
          {/* ============ IDENTITY ============ */}
          <Section title="IDENTITY" icon="file" hint="what the rule is and which way it flies">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <label className={LABEL}>RULE NAME</label>
                <input
                  className={`${INPUT} w-full`}
                  value={d.name || ""}
                  onChange={(e) => up("name", e.target.value)}
                  placeholder="Arrivals via MOPIL"
                />
              </div>
              <div>
                <label className={LABEL}>DIRECTION</label>
                <div className="flex gap-1">
                  <Latch
                    size="md"
                    tone="arr"
                    on={!d.isDeparture}
                    onClick={() => up("isDeparture", false)}
                    title="Inbound — every generated aircraft lands at the home ICAO"
                  >
                    ARRIVAL
                  </Latch>
                  <Latch
                    size="md"
                    tone="dep"
                    on={!!d.isDeparture}
                    onClick={() => up("isDeparture", true)}
                    title="Outbound — every generated aircraft departs from the home ICAO"
                  >
                    DEPARTURE
                  </Latch>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-3">
              {/* C1 enroute rules never use a runway — approach-only field */}
              {d.mode !== "C1" && (
                <div>
                  <label className={LABEL}>RUNWAY IN USE</label>
                  <div className="flex gap-1.5">
                    <input
                      className={`${INPUT} w-[86px]`}
                      value={d.rwyInUse || ""}
                      onChange={(e) => up("rwyInUse", e.target.value.toUpperCase())}
                      placeholder="27R"
                    />
                    <RwySelect groups={rwyGroups} onSelect={(rw: string) => up("rwyInUse", rw)} />
                  </div>
                  <p className={HINT}>
                    {rwyGroups.length ? "drives the STAR list" : "no navdata runways — type it"}
                  </p>
                </div>
              )}
              <div>
                <label className={LABEL}>HOME ICAO</label>
                <input
                  className={`${INPUT} w-[92px]`}
                  maxLength={4}
                  value={d.homeIcao ?? ""}
                  onChange={(e) => up("homeIcao", e.target.value.toUpperCase())}
                  placeholder={d.isDeparture ? "departs" : "lands"}
                />
                <p className={HINT}>
                  {d.poolSource
                    ? "unused — pool entries carry their own"
                    : homeBlank
                      ? "blank = overflight"
                      : d.isDeparture
                        ? "origin of every aircraft"
                        : "destination of every aircraft"}
                </p>
              </div>
              {homeBlank && (
                <div className="flex-1 min-w-[180px] pt-[18px]">
                  <Note tone="cy" icon="plane">
                    Blank home = overflight/transit — origin AND destination are both drawn from the
                    pools in FLIGHT (set both there).
                  </Note>
                </div>
              )}
            </div>
          </Section>

          {/* ============ ENTRY ============ */}
          <Section
            title="ENTRY"
            icon="radio"
            hint="where the traffic comes from and where it appears"
          >
            <div>
              <label className={LABEL}>TRAFFIC SOURCE</label>
              <div className="flex gap-1 flex-wrap">
                <Latch
                  size="md"
                  on={!d.poolSource}
                  onClick={() => up("poolSource", false)}
                  title="Synthesise callsigns, types and endpoints from the pools in FLIGHT"
                >
                  CUSTOM POOLS
                </Latch>
                <Latch
                  size="md"
                  on={!!d.poolSource}
                  onClick={() => up("poolSource", true)}
                  title="Use the real flight plans staged in FPLN POOL"
                >
                  AIRCRAFT POOL <b className="font-mono">{allPool.length}</b>
                </Latch>
              </div>
            </div>

            {d.poolSource && (
              <div className={SUB}>
                <span className={SUBHEAD}>POOL FILTERS</span>
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className={LABEL}>FILTER DEP</label>
                    <input
                      className={`${INPUT} w-[112px]`}
                      value={d.poolDep || ""}
                      onChange={(e) => up("poolDep", e.target.value.toUpperCase())}
                      placeholder="EGLL"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>FILTER ARR</label>
                    <input
                      className={`${INPUT} w-[112px]`}
                      value={d.poolArr || ""}
                      onChange={(e) => up("poolArr", e.target.value.toUpperCase())}
                      placeholder="LFPG"
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className={LABEL}>ROUTE MUST CONTAIN (CSV)</label>
                    <input
                      className={`${INPUT} w-full`}
                      value={d.routeContains || ""}
                      onChange={(e) => up("routeContains", e.target.value.toUpperCase())}
                      placeholder="BATAG,PO302"
                    />
                  </div>
                </div>
                <p className="text-[10.5px] text-tx7 leading-snug">
                  Comma-separated waypoint tokens — a pool aircraft's filed FP must contain at least
                  one. Use it for departures (the synthetic spawn fix appears in no real FP) or to
                  narrow the routing beyond DEP/ARR.
                </p>

                {poolMatches.length === 0 ? (
                  <Note>No pool aircraft match these filters — nothing would be generated.</Note>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-tx4">
                        {poolMatches.length} match{poolMatches.length !== 1 ? "es" : ""}
                      </span>
                      {d.spawnWaypoint && (
                        <Latch
                          size="md"
                          on={d.excludeNonRouting !== false}
                          onClick={() => up("excludeNonRouting", d.excludeNonRouting === false)}
                          title="When on, aircraft whose FP includes neither the entry fix, nor any of its STAR entry waypoints, nor any routeContains token are dropped. Turn it off when you have set a shared sim-route override."
                        >
                          EXCLUDE NON-ROUTING
                        </Latch>
                      )}
                      {d.spawnWaypoint && missingEntry.length > 0 && (
                        <span
                          className="flex items-center gap-1 text-[10.5px] text-am-fg"
                          title={
                            upstreams.length
                              ? `Acceptable: ${d.spawnWaypoint} or any STAR entry / routeContains token — ${upstreams.join(", ")}`
                              : `Acceptable: ${d.spawnWaypoint} (no STAR entries or routeContains tokens — re-parse the ESE, or set routeContains if you expected some)`
                          }
                        >
                          <Icon name="alert" size={11} />
                          {missingEntry.length} FP{missingEntry.length !== 1 ? "s" : ""} not routing
                          via <b className="font-mono">{d.spawnWaypoint}</b>
                          {d.excludeNonRouting !== false ? (
                            <b className="text-rd-fg">→ excluded</b>
                          ) : (
                            <span className="text-tx7">(included, forced)</span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="max-h-[180px] overflow-auto bg-panel border border-bd1 rounded-lg">
                      {poolMatches.map((p: any, i: number) => {
                        const ok = hasEntry(p);
                        return (
                          <PlanRow
                            key={p.id}
                            p={p}
                            zebra={i % 2 === 1}
                            warn={!ok}
                            right={
                              !ok ? (
                                <span
                                  className="ml-auto flex items-center gap-1 text-am-fg shrink-0 text-[10px]"
                                  title={`This FP includes neither ${d.spawnWaypoint} nor any of its STAR entries / routeContains tokens`}
                                >
                                  <Icon name="alert" size={11} />
                                  NO ENTRY
                                </span>
                              ) : null
                            }
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* spawn waypoint */}
            <div className="relative">
              <label className={LABEL}>
                SPAWN / ENTRY WAYPOINT
                {d.spawnWaypoint && (
                  <span className="ml-2 font-mono text-cy-fg normal-case">{d.spawnWaypoint}</span>
                )}
              </label>
              <input
                className={`${INPUT} w-full`}
                value={wptSearch}
                onFocus={() => setWptOpen(true)}
                onBlur={() => setWptOpen(false)}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setWptSearch(v);
                  setWptOpen(true);
                  up("spawnWaypoint", v);
                }}
                placeholder="Type a fix name…"
              />
              {wptOpen && wptMatches.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-[190px] overflow-auto bg-panel border border-bd3 rounded-lg shadow-lg">
                  {wptMatches.map((w: any) => (
                    <button
                      key={`${w.type}-${w.name}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickWpt(w);
                      }}
                      className="w-full flex items-center justify-between gap-3 px-3 py-1.5 font-mono text-[11.5px] text-left border-t border-rowdiv first:border-t-0 hover:bg-cy-fg/10"
                    >
                      <span className="text-tx1">{w.name}</span>
                      <span className="text-tx7 text-[10.5px]">
                        {w.type} · {w.lat.toFixed(4)}, {w.lon.toFixed(4)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className={HINT}>
                the sim route is auto-trimmed from this fix — set it here or from a STAR below
              </p>
              {!wptKnown && (
                <div className="mt-2">
                  <Note>
                    <b className="font-mono">{d.spawnWaypoint}</b> is not in the parsed navdata —
                    this rule will produce no aircraft until the fix exists (load the .sct in SETUP
                    → NAVDATA).
                  </Note>
                </div>
              )}
            </div>

            {/* pre-entry offset */}
            <div>
              <label className={LABEL}>
                PRE-ENTRY OFFSET{" "}
                <span className="ml-1 font-mono text-cy-fg">{d.preEntryNm || 0} NM</span>
              </label>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={d.preEntryNm || 1}
                onChange={(e) => up("preEntryNm", +e.target.value)}
                className="w-full accent-cy-fg"
              />
              <p className={HINT}>
                aircraft is placed this far before the entry fix, on the inbound track (min 1 NM)
              </p>
            </div>

            {/* altitude request */}
            <div className={SUB}>
              <span className={SUBHEAD}>ALTITUDE REQUEST</span>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className={LABEL}>AT WAYPOINT</label>
                  <input
                    className={`${INPUT} w-[112px]`}
                    value={d.reqAltWpt || ""}
                    onChange={(e) => up("reqAltWpt", e.target.value.toUpperCase())}
                    placeholder={d.spawnWaypoint || "fix"}
                  />
                </div>
                <div>
                  <label className={LABEL}>REQUEST ALTITUDE (FT)</label>
                  <input
                    type="number"
                    className={`${INPUT} w-[120px]`}
                    value={d.reqAltVal ?? ""}
                    onChange={(e) => up("reqAltVal", e.target.value === "" ? "" : +e.target.value)}
                  />
                </div>
                <p className="text-[10.5px] text-tx7 pb-1.5">
                  pre-filled from the ESE [COPX] level when a STAR is applied
                </p>
              </div>
            </div>
          </Section>

          {/* ============ SCHEDULE ============ */}
          <Section title="SCHEDULE" icon="refresh" hint="how many, how often, and when">
            <div>
              <label className={LABEL}>SPACING MODE</label>
              <div className="flex gap-1 flex-wrap">
                <Latch
                  size="md"
                  on={d.schedulingMode !== "separation"}
                  onClick={() => up("schedulingMode", "rate")}
                  title="Aircraft per hour"
                >
                  RATE /HR
                </Latch>
                <Latch
                  size="md"
                  on={d.schedulingMode === "separation"}
                  disabled={d.gsMode !== "fixed"}
                  onClick={() => d.gsMode === "fixed" && up("schedulingMode", "separation")}
                  title={
                    d.gsMode !== "fixed"
                      ? "Requires an ATC-assigned speed — set SPAWN SPEED to ATC-ASSIGNED in FLIGHT first"
                      : "Space aircraft by distance at the assigned speed"
                  }
                >
                  NM SEPARATION
                </Latch>
              </div>
              {d.gsMode !== "fixed" && (
                <p className={HINT}>NM separation needs an ATC-assigned spawn speed</p>
              )}
            </div>

            {d.schedulingMode === "separation" ? (
              <div>
                <label className={LABEL}>
                  SEPARATION{" "}
                  <span className="ml-1 font-mono text-cy-fg">{d.nmSeparation || 10} NM</span>
                  <span className="ml-2 font-mono text-tx7 normal-case">
                    ≈ {gapSec}s at {repGs} kt GS
                  </span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="15"
                  step="1"
                  value={d.nmSeparation || 10}
                  onChange={(e) => up("nmSeparation", +e.target.value)}
                  className="w-full accent-cy-fg"
                />
                <p className={HINT}>
                  5 NM = {((5 / Math.max(repGs, 1)) * 3600).toFixed(0)}s · 10 NM ={" "}
                  {((10 / Math.max(repGs, 1)) * 3600).toFixed(0)}s · 15 NM ={" "}
                  {((15 / Math.max(repGs, 1)) * 3600).toFixed(0)}s
                </p>
              </div>
            ) : (
              <div>
                <label className={LABEL}>RATE (/HR)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  className={`${INPUT} w-[92px]`}
                  value={d.rate ?? ""}
                  onChange={(e) => up("rate", +e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <div>
                <label className={LABEL}>DURATION (MIN)</label>
                <input
                  type="number"
                  min="1"
                  className={`${INPUT} w-[92px]`}
                  value={d.duration ?? ""}
                  onChange={(e) => up("duration", +e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>START OFFSET (MIN)</label>
                <input
                  type="number"
                  step="0.1"
                  className={`${INPUT} w-[110px]`}
                  value={d.startOffset ?? ""}
                  onChange={(e) => up("startOffset", +e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>SEQ START</label>
                <input
                  type="number"
                  min="1"
                  className={`${INPUT} w-[92px]`}
                  value={d.seq ?? ""}
                  onChange={(e) => up("seq", +e.target.value)}
                />
                <p className={HINT}>first number of a callsign pattern</p>
              </div>
            </div>

            <div>
              <label className={LABEL}>SPAWN TIMING</label>
              <div className="flex gap-1 flex-wrap">
                <Latch
                  size="md"
                  on={d.timingMode !== "random"}
                  onClick={() => up("timingMode", "regular")}
                  title="Evenly spaced across the window"
                >
                  REGULAR
                </Latch>
                <Latch
                  size="md"
                  on={d.timingMode === "random"}
                  onClick={() => up("timingMode", "random")}
                  title="Same aircraft count, random spawn times — never under 2 min apart"
                >
                  RANDOM ≥2′
                </Latch>
              </div>
            </div>

            <div className="bg-inset border border-bd1 rounded-lg px-3 py-2 font-mono text-[11px] text-tx4 leading-relaxed">
              ≈<b className="text-cy-fg">{shownCount}</b> aircraft ·{" "}
              {d.timingMode === "random"
                ? "random spawn times across the window, min 2 min apart (re-rolled every generation)"
                : `${gapSec}s apart · T+: ${sampleTimes.join(", ")}${count > sampleTimes.length ? " …" : ""}`}
            </div>
          </Section>

          {/* ============ CALLSIGN & SQUAWK ============ */}
          <Section title="CALLSIGN & SQUAWK" icon="radio" hint="who they are on the strip">
            <div className={SUB}>
              <span className={SUBHEAD}>CALLSIGN</span>
              <div className="flex gap-1 flex-wrap">
                <Latch
                  size="md"
                  on={useRand}
                  onClick={() => up("randomCallsign", true)}
                  title="Random real-world ICAO airline callsigns, picked by the region of the other endpoint"
                >
                  RANDOM ICAO
                </Latch>
                <Latch
                  size="md"
                  on={!useRand}
                  onClick={() => up("randomCallsign", false)}
                  title="Expand a pattern — # becomes the sequence number"
                >
                  PATTERN
                </Latch>
                <Latch
                  size="md"
                  on={!!d.heavy}
                  disabled={!useRand}
                  onClick={() => up("heavy", !d.heavy)}
                  title="Draw from the long-haul operator list instead of the regional one"
                >
                  HEAVY / LONG-HAUL
                </Latch>
              </div>
              {useRand ? (
                previewCS.length > 0 && (
                  <p className="font-mono text-[11px] text-tx6">Preview: {previewCS.join(", ")}</p>
                )
              ) : (
                <div>
                  <label className={LABEL}>CALLSIGN PATTERN</label>
                  <input
                    className={`${INPUT} w-[140px]`}
                    value={d.callsignPattern || ""}
                    onChange={(e) => up("callsignPattern", e.target.value)}
                    placeholder="AFR###"
                  />
                  <p className={HINT}>### = SEQ START, incrementing per aircraft</p>
                </div>
              )}
              {d.poolSource && (
                <p className="text-[10.5px] text-tx7 leading-snug">
                  Pool entries bring their own callsign — this is the fallback for entries without
                  one, and only the random generator (with HEAVY) is used there.
                </p>
              )}
            </div>

            <div className={SUB}>
              <span className={SUBHEAD}>SQUAWK</span>
              <div className="flex gap-1 flex-wrap">
                <Latch
                  size="md"
                  on={d.squawkMode !== "random"}
                  onClick={() => up("squawkMode", "fixed")}
                >
                  FIXED
                </Latch>
                <Latch
                  size="md"
                  on={d.squawkMode === "random"}
                  onClick={() => up("squawkMode", "random")}
                >
                  RANDOM
                </Latch>
              </div>
              {d.squawkMode !== "random" ? (
                <div>
                  <label className={LABEL}>SQUAWK CODE</label>
                  <input
                    className={`${INPUT} w-[110px]`}
                    value={d.squawk || ""}
                    onChange={(e) => up("squawk", e.target.value)}
                    placeholder="1000"
                  />
                  {d.poolSource && (
                    <p className={HINT}>used when a pool entry has no squawk (or files 0000)</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {[
                    { val: "1000", label: "Mode S / TCAS (EU standard)" },
                    { val: "2000", label: "Standard (no TCAS)" },
                    { val: "5600", label: "56XX — random 5600-5677" },
                  ].map(({ val, label }) => (
                    <div key={val} className="flex items-center gap-2">
                      <Latch
                        size="md"
                        on={(d.squawkOptions || []).includes(val)}
                        onClick={() => {
                          const opts = (d.squawkOptions || []).filter((o: string) => o !== val);
                          if (!(d.squawkOptions || []).includes(val)) opts.push(val);
                          up("squawkOptions", opts);
                        }}
                      >
                        <span className="font-mono">{val}</span>
                      </Latch>
                      <span className="text-[10.5px] text-tx6">{label}</span>
                    </div>
                  ))}
                  <Note>
                    H and J aircraft cannot receive <span className="font-mono">1000</span> — they
                    are assigned <span className="font-mono">2000</span> instead.
                  </Note>
                </div>
              )}
            </div>
          </Section>

          {/* ============ FLIGHT ============ */}
          <Section
            title="FLIGHT"
            icon="plane"
            hint="the flight plan every generated aircraft files"
            className="xl:col-span-2"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* altitudes */}
              <div className={SUB}>
                <span className={SUBHEAD}>ALTITUDES</span>
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className={LABEL}>CRUISE ALT (FT)</label>
                    <input
                      type="number"
                      className={`${INPUT} w-[110px]`}
                      value={d.cruiseAlt ?? ""}
                      onChange={(e) => up("cruiseAlt", +e.target.value)}
                    />
                    {d.poolSource && <p className={HINT}>pool entries use their own filed level</p>}
                  </div>
                  <div>
                    <label className={LABEL}>SPAWN ALT (FT)</label>
                    <input
                      type="number"
                      className={`${INPUT} w-[110px] ${poolCruise ? "opacity-40" : ""}`}
                      value={d.spawnAlt ?? ""}
                      onChange={(e) => up("spawnAlt", +e.target.value)}
                      disabled={poolCruise}
                    />
                    <p className={HINT}>
                      {poolCruise
                        ? "each aircraft spawns at its filed cruise FL"
                        : "altitude at the entry fix"}
                    </p>
                  </div>
                  {d.poolSource && (
                    <div>
                      <label className={LABEL}>PER-AIRCRAFT</label>
                      <Latch
                        size="md"
                        on={poolCruise}
                        onClick={() => up("spawnAltMode", poolCruise ? "fixed" : "poolCruise")}
                        title="Spawn each pool aircraft at its own filed cruise level instead of the rule-level spawn alt — one overflight rule yields a realistic FL band"
                      >
                        FILED CRUISE
                      </Latch>
                    </div>
                  )}
                </div>
              </div>

              {/* spawn speed */}
              <div className={SUB}>
                <span className={SUBHEAD}>SPAWN SPEED</span>
                <div className="flex gap-1 flex-wrap">
                  <Latch
                    size="md"
                    on={d.gsMode !== "fixed" && d.gsMode !== "natural"}
                    onClick={() => {
                      setD((prev: any) => ({
                        ...prev,
                        gsMode: "wtc",
                        ...(prev.schedulingMode === "separation" ? { schedulingMode: "rate" } : {}),
                      }));
                    }}
                    title="Ground speed from the ICAO wake category of the assigned type"
                  >
                    BY WTC
                  </Latch>
                  <Latch
                    size="md"
                    on={d.gsMode === "fixed"}
                    onClick={() => up("gsMode", "fixed")}
                    title="Simulates an en-route controller having assigned a speed"
                  >
                    ATC-ASSIGNED
                  </Latch>
                  <Latch
                    size="md"
                    on={d.gsMode === "natural"}
                    onClick={() => {
                      setD((prev: any) => ({
                        ...prev,
                        gsMode: "natural",
                        ...(prev.schedulingMode === "separation" ? { schedulingMode: "rate" } : {}),
                      }));
                    }}
                    title="Spawns at 0 kt and accelerates from rest"
                  >
                    NATURAL
                  </Latch>
                </div>
                {d.gsMode === "natural" ? (
                  <Note icon="zap">
                    Aircraft spawns at 0 kt; SIMDATA accelerates from rest at 0.010 unit/s. Best for
                    departures spawning at low altitude.
                  </Note>
                ) : d.gsMode !== "fixed" ? (
                  <div className="bg-panel border border-bd1 rounded-lg px-3 py-2 font-mono text-[11px] text-tx5">
                    <div className="text-tx7 mb-1">
                      per-aircraft GS from the ICAO WTC of the assigned type:
                    </div>
                    <div>
                      L <b className="text-cy-fg">{GS_BY_WTC.L}</b> · M{" "}
                      <b className="text-cy-fg">{GS_BY_WTC.M}</b> · H{" "}
                      <b className="text-cy-fg">{GS_BY_WTC.H}</b> · J{" "}
                      <b className="text-cy-fg">{GS_BY_WTC.J}</b> kt
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className={LABEL}>SPEED TYPE</label>
                        <select
                          value={d.speedType || "ias"}
                          onChange={(e) => {
                            const t = e.target.value;
                            setD((prev: any) => {
                              const next = { ...prev, speedType: t };
                              if (t === "mach" && prev.assignedSpeed > 10)
                                next.assignedSpeed = 0.78;
                              if (t === "ias" && prev.assignedSpeed < 10) next.assignedSpeed = 280;
                              return next;
                            });
                          }}
                          className={`${INPUT} w-[110px]`}
                        >
                          <option value="ias">IAS (kt)</option>
                          <option value="mach">Mach</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>
                          {d.speedType === "mach" ? "MACH" : "IAS (KT)"}
                        </label>
                        <input
                          type="number"
                          step={d.speedType === "mach" ? "0.01" : "5"}
                          className={`${INPUT} w-[100px]`}
                          value={d.assignedSpeed ?? ""}
                          onChange={(e) => up("assignedSpeed", +e.target.value)}
                        />
                      </div>
                      <div className="bg-panel border border-cy-bd rounded-lg px-3 py-1.5">
                        {poolCruise ? (
                          <>
                            <div className="text-[9px] font-bold tracking-[0.1em] text-tx8">
                              TAS
                            </div>
                            <div className="font-mono text-[13px] text-cy-fg">
                              per-aircraft (filed FL)
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[9px] font-bold tracking-[0.1em] text-tx8">
                              TAS @ {d.spawnAlt ?? 0} FT
                            </div>
                            <div className="font-mono text-[13px] text-cy-fg">
                              ≈ {speedPreview} kt
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-[10.5px] text-tx7 leading-snug">
                      Converted to TAS at the spawn altitude using ISA — this is also what NM
                      separation is computed against.
                    </p>
                  </>
                )}
              </div>

              {/* aircraft types */}
              <div className={SUB}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={SUBHEAD}>AIRCRAFT TYPES</span>
                  <span className="text-[10px] text-tx8">ICAO WTC categories or a manual CSV</span>
                  <span className="flex-1" />
                  {activeCats.length > 0 && (
                    <HoldKey
                      onHold={clearCats}
                      title="Hold to clear the categories and empty the type list"
                    >
                      <Icon name="x" size={11} />
                      CLEAR
                    </HoldKey>
                  )}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(TYPE_CATS).map(([cat, meta]: any) => (
                    <Latch
                      key={cat}
                      size="md"
                      tone={CAT_TONE[cat]}
                      on={activeCats.includes(cat)}
                      onClick={() => toggleCat(cat)}
                      title={meta.desc}
                    >
                      <b className="font-mono">{cat}</b>
                      <span className="opacity-80">{meta.label}</span>
                    </Latch>
                  ))}
                </div>
                {activeCats.length > 0 && (
                  <div className="bg-panel border border-bd1 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                    {activeCats.map((c) => {
                      const types = TYPE_CATS[c]?.types || [];
                      return (
                        <div key={c} className="font-mono text-[10.5px] text-tx6 leading-snug">
                          <b className="text-cy-fg">
                            {c} — {TYPE_CATS[c]?.label}
                          </b>
                          : {types.slice(0, 8).join(", ")}
                          {types.length > 8 ? ` +${types.length - 8}` : ""}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div>
                  <label className={LABEL}>TYPE POOL (CSV)</label>
                  <input
                    className={`${INPUT} w-full`}
                    value={d.typePool || ""}
                    onChange={(e) => up("typePool", e.target.value)}
                    placeholder="A320,B738 — or use the category latches above"
                  />
                  <p className={HINT}>
                    {d.poolSource
                      ? "fallback — used only when a pool entry has no type"
                      : "types are picked in order, cycling through the list"}
                  </p>
                </div>
              </div>

              {/* origin / destination pool — both shown for a blank-home overflight rule */}
              {(homeBlank ? ["originPool", "destPool"] : [poolField]).map((pf: string) => (
                <div className={SUB} key={pf}>
                  <span className={SUBHEAD}>
                    {pf === "destPool" ? "DESTINATION POOL" : "ORIGIN POOL"}
                  </span>
                  <div className="flex gap-1.5">
                    <input
                      className={`${INPUT} flex-1 min-w-0`}
                      value={d[pf] || ""}
                      onChange={(e) => up(pf, e.target.value.toUpperCase())}
                      placeholder="EHAM,EGLL,EDDF"
                    />
                    <RegionSelect
                      regionsMap={pf === "destPool" ? destsByRegion : originsByRegion}
                      onSelect={(icao: string) => appendApt(pf, icao)}
                      title="Add an airport seen in the FPLN pool, grouped by region"
                    />
                  </div>
                  {csv(d[pf]).length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {csv(d[pf]).map((a: string) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-chip border border-bd3 font-mono text-[11px] text-tx2"
                        >
                          {a}
                          <button
                            onClick={() => removeApt(pf, a)}
                            title={`Remove ${a}`}
                            className="text-tx8 hover:text-rd-fg"
                          >
                            <Icon name="x" size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10.5px] text-tx7 leading-snug">
                    {d.poolSource
                      ? "Unused in AIRCRAFT POOL mode — each pool entry brings its own origin and destination."
                      : homeBlank
                        ? `Overflight ${pf === "destPool" ? "destinations" : "origins"} — picked in order, cycling through the list.`
                        : `The ${d.isDeparture ? "destination" : "origin"} is picked from this list; its first entry also picks the callsign region.`}
                  </p>
                </div>
              ))}

              {/* route templates */}
              <div className={`${SUB} lg:col-span-2`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={SUBHEAD}>ROUTE TEMPLATES</span>
                  <span className="flex-1" />
                  {multiRoutes.length > 0 && (
                    <HoldKey
                      onHold={() => up("fpRouteTemplates", [])}
                      title="Hold to drop the multi-route list"
                    >
                      <Icon name="x" size={11} />
                      CLEAR {multiRoutes.length} ROUTES
                    </HoldKey>
                  )}
                  {allPool.length > 0 && (
                    <Latch
                      size="md"
                      on={showRoutePicker}
                      onClick={() => setShowRoutePicker((v) => !v)}
                      title="Pick one or more real filed routes from the FPLN pool"
                    >
                      <Icon name="layers" size={12} />
                      PICK FROM POOL
                    </Latch>
                  )}
                </div>

                {multiRoutes.length > 0 && (
                  <div className="bg-panel border border-bd1 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                    <span className="text-[10.5px] text-cy-fg font-semibold">
                      {multiRoutes.length} routes — randomly assigned per aircraft
                    </span>
                    {multiRoutes.slice(0, 3).map((rt: string, i: number) => (
                      <div key={i} className="font-mono text-[10.5px] text-tx6 truncate">
                        {preview(rt, 8)}
                      </div>
                    ))}
                    {multiRoutes.length > 3 && (
                      <div className="font-mono text-[10.5px] text-tx8">
                        +{multiRoutes.length - 3} more…
                      </div>
                    )}
                  </div>
                )}

                {showRoutePicker && (
                  <div className="bg-panel border border-bd3 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-bd1 bg-inset">
                      <span className="text-[10.5px] text-tx6">
                        <b className="font-mono text-tx3">{routeSel.size}</b> selected · randomly
                        assigned per aircraft
                      </span>
                      <span className="flex-1" />
                      <DeckKey
                        size="sm"
                        variant={routeSel.size ? "primary" : "default"}
                        disabled={!routeSel.size}
                        onClick={applyRouteSelection}
                      >
                        <Icon name="check" size={12} />
                        APPLY {routeSel.size || ""}
                      </DeckKey>
                    </div>
                    {routeCandidates.length > 0 ? (
                      <div className="max-h-[210px] overflow-auto">
                        {routeCandidates.map((p: any, i: number) => {
                          const hasSpawn =
                            d.spawnWaypoint &&
                            (p.route || "")
                              .toUpperCase()
                              .includes(String(d.spawnWaypoint).toUpperCase());
                          return (
                            <PlanRow
                              key={p.id}
                              p={p}
                              zebra={i % 2 === 1}
                              selectable
                              selected={routeSel.has(p.id)}
                              onClick={() => toggleRouteSel(p.id)}
                              tokens={12}
                              right={
                                d.spawnWaypoint && !hasSpawn ? (
                                  <span
                                    className="ml-auto text-am-fg shrink-0"
                                    title={`This route does not include ${d.spawnWaypoint}`}
                                  >
                                    <Icon name="alert" size={11} />
                                  </span>
                                ) : null
                              }
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <p className="px-3 py-3 text-[11px] text-tx7">
                        No pool entries match the current {d.isDeparture ? "destination" : "origin"}{" "}
                        pool.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>FP ROUTE TEMPLATE</label>
                    <textarea
                      className={`${AREA} min-h-[54px]`}
                      value={d.fpRouteTemplate || ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setD((prev: any) => ({
                          ...prev,
                          fpRouteTemplate: v,
                          ...((prev.fpRouteTemplates || []).filter(Boolean).length === 0
                            ? { fpRouteTemplates: [] }
                            : {}),
                        }));
                      }}
                      placeholder="Full filed route — or use PICK FROM POOL above"
                    />
                    <p className={HINT}>
                      {d.poolSource
                        ? "fallback — used only when a pool entry has no filed route"
                        : "the route filed in the flight plan"}
                    </p>
                  </div>
                  <div>
                    <label className={LABEL}>SIM ROUTE TEMPLATE</label>
                    <textarea
                      className={`${AREA} min-h-[54px]`}
                      value={d.simRouteTemplate || ""}
                      onChange={(e) => up("simRouteTemplate", e.target.value)}
                      placeholder={
                        d.spawnWaypoint
                          ? `e.g. ${d.spawnWaypoint} WAYPOINT … DEST`
                          : "populated when you apply a STAR"
                      }
                    />
                    <p className={HINT}>
                      {d.poolSource
                        ? "shared override — leave blank to auto-trim each aircraft's own FP from the spawn fix"
                        : "auto-trimmed from the spawn fix"}
                    </p>
                  </div>
                </div>
                {d.simRouteTemplate && trimPrev !== d.simRouteTemplate && (
                  <div className="bg-panel border border-cy-bd rounded-lg px-3 py-2 font-mono text-[11px] text-cy-fg leading-snug">
                    <span className="text-tx7">after trim from {d.spawnWaypoint || "—"}: </span>
                    {trimPrev || "(empty)"}
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* ============ STAR / ENTRY ============ */}
          {/* approach machinery — hidden for C1 enroute rules */}
          {!d.isDeparture && d.mode !== "C1" && (
            <Section
              title="STAR / ENTRY"
              icon="layers"
              hint="from the ESE [SIDSSTARS] + [COPX]"
              className="xl:col-span-2"
            >
              {!allStars.length ? (
                <p className="text-[11.5px] text-tx7">
                  No STARs parsed — load an ESE containing{" "}
                  <span className="font-mono">[SIDSSTARS]</span> in SETUP → NAVDATA.
                </p>
              ) : !d.rwyInUse ? (
                <p className="text-[11.5px] text-tx7">
                  Set a runway in IDENTITY to list the STARs that serve it.
                </p>
              ) : starsForRwy.length === 0 ? (
                <Note>
                  No STARs found for RWY <b className="font-mono">{d.rwyInUse}</b>
                  {starApt ? (
                    <>
                      {" "}
                      at <b className="font-mono">{starApt}</b>
                    </>
                  ) : null}{" "}
                  in the parsed ESE.
                </Note>
              ) : (
                <>
                  <p className="text-[10.5px] text-tx7">
                    {starApt ? (
                      <>
                        STARs serving RWY <b className="font-mono text-tx4">{d.rwyInUse}</b> at{" "}
                        <b className="font-mono text-tx4">{starApt}</b>
                      </>
                    ) : (
                      <>
                        every STAR serving a RWY <b className="font-mono text-tx4">{d.rwyInUse}</b>{" "}
                        — set FILTER ARR (or the destination pool) to narrow it to one airport
                      </>
                    )}{" "}
                    · applying one sets the spawn fix, the sim route and the altitude request in one
                    press.
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {iafGroups.map(({ iaf, starList }: any) => {
                      const c = getCopx(iaf);
                      const isActive = d.spawnWaypoint === iaf;
                      const selStar =
                        starList.find(
                          (s: any) => s.name === (starByIaf[iaf] || starList[0].name),
                        ) || starList[0];
                      return (
                        <div
                          key={iaf}
                          className={`rounded-lg border p-3 flex flex-col gap-2 ${
                            isActive ? "border-cy-bd bg-cy-soft" : "border-bd1 bg-inset"
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[12.5px] font-semibold text-tx1">
                              ENTRY {iaf}
                            </span>
                            {c && (
                              <span
                                className={`${CHIP} text-gn-fg bg-gn-bg border-gn-bd font-mono`}
                              >
                                COPX FL{Math.round(c.level / 100)}
                              </span>
                            )}
                            <span className="flex-1" />
                            {starList.length > 1 ? (
                              <select
                                value={starByIaf[iaf] || starList[0].name}
                                onChange={(e) =>
                                  setStarByIaf((prev) => ({ ...prev, [iaf]: e.target.value }))
                                }
                                className={`${INPUT} max-w-[190px]`}
                              >
                                {starList.map((s: any) => (
                                  <option key={s.name} value={s.name}>
                                    {s.name} ({(s.waypoints || []).length} wpts)
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="font-mono text-[11px] text-tx5">
                                {starList[0].name}
                              </span>
                            )}
                            {isActive ? (
                              <DeckKey
                                size="sm"
                                tone="gn"
                                onClick={() => applyStarConfig(iaf, selStar, c)}
                                title="Re-apply this STAR — refreshes the sim route and the altitude request"
                              >
                                <Icon name="check" size={12} />
                                ACTIVE
                              </DeckKey>
                            ) : (
                              <DeckKey
                                size="sm"
                                onClick={() => applyStarConfig(iaf, selStar, c)}
                                title="Set the spawn fix, sim route and altitude request from this STAR"
                              >
                                USE THIS ENTRY
                              </DeckKey>
                            )}
                          </div>
                          {isActive && d.simRouteTemplate && (
                            <div className="font-mono text-[10.5px] text-tx6 truncate">
                              route: {preview(d.simRouteTemplate, 10)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {iafGroups.length > 1 && (
                    <Note>
                      <b className="font-semibold">
                        Multiple entry fixes for RWY {d.rwyInUse}:{" "}
                        {iafGroups.map((g: any) => g.iaf).join(", ")}
                      </b>
                      <div className="mt-0.5">
                        Each entry fix needs its own rule. This one is using{" "}
                        <b className="font-mono">{d.spawnWaypoint || "(none selected)"}</b>.
                      </div>
                    </Note>
                  )}
                </>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Runway picker built from the parsed .sct RUNWAY block + ESE STAR runways. */
function RwySelect({ groups, onSelect }: any) {
  if (!groups.length) return null;
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onSelect(e.target.value)}
      className={`${INPUT} w-[132px] text-tx3`}
      title="Runways found in the parsed navdata"
    >
      <option value="">＋ from navdata</option>
      {groups.map((g: any) => (
        <optgroup key={g.apt} label={g.apt}>
          {g.list.map((rw: string) => (
            <option key={rw} value={rw}>
              {rw}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
