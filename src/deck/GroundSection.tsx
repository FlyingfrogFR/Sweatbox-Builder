// GroundSection.tsx — deck-native GROUND traffic (BUILD TFC → GROUND).
// Replaces the legacy slate-styled GroundPanel from generators/s1.tsx inside
// FLIGHTDECK: same airports, runways, counts, stand-source resolution and the
// exact same buildGroundAircraft call — only the surface changed.
//
// Ground is the deck's AMBER concept (it sits behind an amber latch and an
// amber banner), so its identity chrome is amber while the direction controls
// stay semantic: departures blue, arrivals red. Generation is the section's own
// 52px primary lever; clearing ground is a hold-to-confirm key. No alert() and
// no confirm(): errors become a deck error note, warnings a toast summary plus
// a persistent notes card.
import { useState, useEffect, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { DeckKey, HoldKey, Latch } from "./ui";
import { AIRPORTS, resolveStandSource, defaultGroundConfig, buildGroundAircraft } from "../core/ground";
import { sortByStart } from "../state/aircraft";

const INPUT =
  "h-8 bg-inset border border-bd3 rounded-md px-2.5 font-mono text-[12px] text-tx1 outline-none focus:border-cy-fg";
const LABEL = "block text-[9.5px] font-bold tracking-[0.1em] text-tx8 mb-1";
const HEAD = "text-[10px] font-extrabold tracking-[0.16em] text-tx6";
const CARD = "bg-panel border border-bd1 rounded-xl p-3.5 flex flex-col gap-3";
const HINT = "text-[10px] font-mono text-tx7 mt-1";

function ErrorNote({ title, items }: any) {
  return (
    <div className="flex items-start gap-2 text-[11.5px] text-rd-fg bg-rd-bg border border-rd-bd rounded-lg px-3 py-2">
      <span className="mt-px flex-none">
        <Icon name="alert" size={13} />
      </span>
      <span>
        <b className="font-semibold">{title}</b>
        <ul className="mt-1 flex flex-col gap-0.5">
          {items.map((e: string, i: number) => (
            <li key={i} className="font-mono text-[11px] leading-snug">
              · {e}
            </li>
          ))}
        </ul>
      </span>
    </div>
  );
}

/** One line of the WILL GENERATE manifest — the figure carries the meaning's colour. */
function Line({ n, tone, children }: any) {
  const c = tone === "dep" ? "text-dep" : tone === "arr" ? "text-arr" : tone === "am" ? "text-am-fg" : "text-tx3";
  return (
    <div className="flex items-baseline gap-1.5 leading-relaxed">
      <span className="text-tx8">·</span>
      <b className={`font-mono text-[12.5px] font-semibold ${c}`}>{n}</b>
      <span className="text-[11.5px] text-tx6">{children}</span>
    </div>
  );
}

/** Pool readiness figure: how many matching plans exist vs how many are wanted. */
function PoolCell({ label, have, want, tone }: any) {
  const ok = want > 0 && have >= want;
  const colour = want === 0 ? "text-tx8" : ok ? "text-gn-fg" : have > 0 ? (tone === "dep" ? "text-dep" : "text-arr") : "text-am-fg";
  return (
    <div className="bg-inset border border-bd1 rounded-lg px-3 py-2">
      <div className="text-[9px] font-bold tracking-[0.1em] text-tx8 mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-mono text-[17px] leading-none font-semibold ${colour}`}>{have}</span>
        {/* glyph so met/short reads without colour (colour-blind safety) */}
        {ok && <span className="font-mono text-[11px] text-gn-fg">✓</span>}
        <span className="text-[10.5px] text-tx7">in pool ·</span>
        <span className="font-mono text-[11.5px] text-tx3">{want} requested</span>
      </div>
    </div>
  );
}

export function GroundSection({ scenario, onChange, gates, pool, rampAgent, rampConfig, toast, onGenerated }: any) {
  const cfg = scenario.groundConfig || defaultGroundConfig();
  const setCfg = (patch: any) => onChange({ ...scenario, groundConfig: { ...cfg, ...patch } });

  // Airport switch resets the runway pickers when the current pair doesn't
  // exist at the new field (same rule as the legacy panel).
  useEffect(() => {
    const a = AIRPORTS[cfg.airport];
    if (!a) return;
    if (!a.runways.includes(cfg.depRwy) || !a.runways.includes(cfg.arrRwy)) {
      setCfg({ depRwy: a.defaultDepRwy, arrRwy: a.defaultArrRwy });
    }
  }, [cfg.airport]); // eslint-disable-line react-hooks/exhaustive-deps

  const [errors, setErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<{ count: number; warnings: string[] } | null>(null);

  const apt = AIRPORTS[cfg.airport] || AIRPORTS.LFLL;
  const standCtx = resolveStandSource(apt, gates, rampAgent);

  const aircraft = scenario.aircraft || [];
  const groundCount = aircraft.filter((a: any) => a.groundMeta).length;

  const poolDeps = (pool || []).filter((p: any) => p.origin === apt.icao && p.route).length;
  const poolArrs = (pool || []).filter((p: any) => p.dest === apt.icao && p.route).length;

  // ---------- plan preview (mirrors buildGroundAircraft's own arithmetic) ----------
  const total = Math.max(0, +cfg.total || 0);
  const vfrCount = Math.max(0, +cfg.vfrCount || 0);
  const sessionLen = Math.max(1, +cfg.sessionLen || 30);
  const depRatio = Math.max(0, Math.min(1, +cfg.depRatio || 0.8));
  const minSpacing = Math.max(0, +cfg.minArrSpacing || 0);
  const ifrTotal = Math.max(0, total - vfrCount);
  const numDep = Math.round(ifrTotal * depRatio);
  const numArr = ifrTotal - numDep;
  const initialDepCount = Math.min(Math.max(0, +cfg.initialPopulated || 0), numDep);
  const sessionDepCount = numDep - initialDepCount;
  const vfrCircuit = Math.ceil(vfrCount / 2);
  const vfrLocal = Math.floor(vfrCount / 2);
  const planned = numDep + numArr + vfrCount;
  const arrOverflow = numArr > 0 && minSpacing > 0 && numArr * minSpacing > sessionLen;

  // ---------- stand source status ----------
  const source = useMemo(() => {
    if (standCtx.source === "rampagent") {
      const ra = rampAgent[apt.icao];
      return {
        name: "RAMPAGENT",
        icon: "check",
        cls: "bg-gn-bg border-gn-bd text-gn-fg",
        detail: `${ra.stands.length} stands · ${ra.stands.filter((s: any) => s.code).length} coded · ${
          ra.stands.filter((s: any) => s.wingspan !== null).length
        } wingspan-limited`,
        note: "Stand assignment is wingspan- and code-letter-aware.",
      };
    }
    if (standCtx.source === "ese")
      return {
        name: "ESE GATES",
        icon: "check",
        cls: "bg-cy-soft border-cy-bd text-cy-fg",
        detail: `${standCtx.stands.length} stands · no wingspan or code data`,
        note: `Load a RampAgent ${apt.icao}.json in SETUP → NAVDATA for fitness-aware assignment.`,
      };
    return {
      name: "FALLBACK",
      icon: "alert",
      cls: "bg-am-bg border-am-bd text-am-fg",
      detail: `${standCtx.stands.length} hardcoded stands for ${apt.icao}`,
      note: `No ESE gates and no RampAgent file for ${apt.icao} — load one for realistic stands.`,
    };
  }, [standCtx, rampAgent, apt]);

  // ---------- generate / clear ----------
  function generate() {
    const { aircraft: built, warnings, errors: errs } = buildGroundAircraft(cfg, gates, pool, rampAgent);
    if (errs.length) {
      setErrors(errs);
      setNotes(null);
      toast("Ground generation failed — see the errors above", "err");
      return;
    }
    setErrors([]);
    const others = aircraft.filter((a: any) => !a.groundMeta);
    const merged = sortByStart([...others, ...built]);
    onChange({ ...scenario, aircraft: merged });
    setNotes({ count: built.length, warnings });
    toast(
      `<b class="font-mono">${built.length}</b> ground aircraft at <b class="font-mono">${apt.icao}</b>` +
        (warnings.length ? ` · ${warnings.length} note${warnings.length !== 1 ? "s" : ""} below` : ""),
      warnings.length ? "warn" : "ok",
    );
    onGenerated(built.length);
  }

  function clearGround() {
    if (!groundCount) return;
    onChange({ ...scenario, aircraft: aircraft.filter((a: any) => !a.groundMeta) });
    setNotes(null);
    toast(`Removed <b class="font-mono">${groundCount}</b> ground aircraft`, "ok");
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 flex flex-col gap-3.5">
        {/* ============ FIELD — mode, airport, runways ============ */}
        <div className={CARD}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={HEAD}>FIELD</span>
            <span className="w-px self-stretch bg-bd1" />
            <Latch size="md" tone="amber" on={cfg.mode !== "S2"} onClick={() => setCfg({ mode: "S1" })} title="S1 — parked and taxiing ramp traffic only">
              S1 · GROUND ONLY
            </Latch>
            <Latch size="md" on={cfg.mode === "S2"} onClick={() => setCfg({ mode: "S2" })} title="S2 — tower flow (not implemented yet)">
              S2 · TOWER FLOW
            </Latch>
            {cfg.mode === "S2" && (
              <span className="flex items-center gap-1.5 text-[10.5px] text-am-fg">
                <Icon name="alert" size={12} />
                not implemented — generation falls back to S1 ground only
              </span>
            )}
          </div>

          <div className="flex items-start gap-5 flex-wrap">
            <div>
              <label className={LABEL}>AIRPORT</label>
              <select value={cfg.airport} onChange={(e) => setCfg({ airport: e.target.value })} className={`${INPUT} w-[250px]`}>
                {Object.values(AIRPORTS).map((a: any) => (
                  <option key={a.icao} value={a.icao}>
                    {a.icao} — {a.name}
                  </option>
                ))}
              </select>
              <p className={HINT}>elev {apt.elevation} ft</p>
            </div>
            <div>
              <label className={LABEL}>DEPARTURE RUNWAY</label>
              <div className="flex gap-1 flex-wrap">
                {apt.runways.map((rw: string) => (
                  <Latch key={rw} size="md" tone="dep" on={cfg.depRwy === rw} onClick={() => setCfg({ depRwy: rw })}>
                    <span className="font-mono">{rw}</span>
                  </Latch>
                ))}
              </div>
              <p className={HINT}>default {apt.defaultDepRwy}</p>
            </div>
            <div>
              <label className={LABEL}>ARRIVAL RUNWAY</label>
              <div className="flex gap-1 flex-wrap">
                {apt.runways.map((rw: string) => (
                  <Latch key={rw} size="md" tone="arr" on={cfg.arrRwy === rw} onClick={() => setCfg({ arrRwy: rw })}>
                    <span className="font-mono">{rw}</span>
                  </Latch>
                ))}
              </div>
              <p className={HINT}>default {apt.defaultArrRwy}</p>
            </div>
          </div>
        </div>

        {/* ============ STAND SOURCE ============ */}
        <div className={CARD}>
          <span className={HEAD}>STAND SOURCE</span>
          <div className="flex items-start gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-2 px-3 h-8 rounded-lg border ${source.cls}`}>
              <Icon name={source.icon} size={13} />
              <b className="text-[10.5px] font-extrabold tracking-[0.1em]">{source.name}</b>
              <span className="font-mono text-[11px] opacity-80">{source.detail}</span>
            </span>
            <span className="text-[10.5px] text-tx7 leading-8">{source.note}</span>
          </div>

          {!rampConfig && (
            <div className="flex items-start gap-2 text-[11px] text-am-fg bg-am-bg border border-am-bd rounded-lg px-3 py-2">
              <span className="mt-px flex-none">
                <Icon name="alert" size={13} />
              </span>
              <span>
                No RampAgent <span className="font-mono">config.json</span> loaded — wingspan checks fall back to WTC
                values.
              </span>
            </div>
          )}
          {rampConfig && standCtx.source !== "rampagent" && (
            <div className="text-[10.5px] text-tx7">
              RampAgent config loaded but no airport file for <span className="font-mono text-tx4">{apt.icao}</span> —
              load <span className="font-mono text-tx4">{apt.icao}.json</span> in SETUP → NAVDATA for fitness-aware
              assignment.
            </div>
          )}

          <div className="flex items-center gap-2.5 flex-wrap">
            <Latch
              size="md"
              on={!!cfg.twoGateSpacing}
              disabled={!standCtx.supportsFitness}
              onClick={() => setCfg({ twoGateSpacing: !cfg.twoGateSpacing })}
              title={
                standCtx.supportsFitness
                  ? "When enabled, aircraft are assigned at least one empty stand apart, using RampAgent Block topology. A spawned stand X excludes X.Block and (X.Block).Block from the next assignments."
                  : "Requires RampAgent data — Block topology not available with ESE or fallback stands."
              }
            >
              2 GATES APART
            </Latch>
            <span className="text-[10.5px] text-tx7">
              uses RampAgent Block adjacency
              {!standCtx.supportsFitness && <span className="text-tx8"> — RampAgent required</span>}
            </span>
          </div>
        </div>

        {/* ============ TRAFFIC COUNTS ============ */}
        <div className={CARD}>
          <span className={HEAD}>TRAFFIC COUNTS</span>
          <div className="flex items-start gap-4 flex-wrap">
            <div>
              <label className={LABEL}>TOTAL AIRCRAFT</label>
              <input
                type="number"
                min="0"
                max="100"
                value={cfg.total}
                onChange={(e) => setCfg({ total: +e.target.value })}
                className={`${INPUT} w-[92px]`}
              />
            </div>
            <div>
              <label className={LABEL}>ON FIELD AT T0</label>
              <input
                type="number"
                min="0"
                value={cfg.initialPopulated}
                onChange={(e) => setCfg({ initialPopulated: +e.target.value })}
                className={`${INPUT} w-[92px]`}
              />
              <p className={HINT}>
                <span className="text-dep">departures</span> only
              </p>
            </div>
            <div>
              <label className={LABEL}>SESSION LENGTH</label>
              <input
                type="number"
                min="1"
                max="240"
                value={cfg.sessionLen}
                onChange={(e) => setCfg({ sessionLen: +e.target.value })}
                className={`${INPUT} w-[92px]`}
              />
              <p className={HINT}>minutes</p>
            </div>
            <div>
              <label className={LABEL}>VFR COUNT</label>
              <input
                type="number"
                min="0"
                max="20"
                value={cfg.vfrCount}
                onChange={(e) => setCfg({ vfrCount: +e.target.value })}
                className={`${INPUT} w-[92px]`}
              />
              <p className={HINT}>½ circuit · ½ local hop</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <label className={LABEL}>DEPARTURE / ARRIVAL SPLIT</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={depRatio}
                  onChange={(e) => setCfg({ depRatio: +e.target.value })}
                  className="flex-1 min-w-[140px]"
                />
                <span className="font-mono text-[12px] whitespace-nowrap">
                  <b className="text-dep">{Math.round(depRatio * 100)}</b>
                  <span className="text-tx8">/</span>
                  <b className="text-arr">{100 - Math.round(depRatio * 100)}</b>
                </span>
              </div>
              <p className={HINT}>
                <span className="text-dep">{numDep} dep</span>
                <span className="text-tx8"> · </span>
                <span className="text-arr">{numArr} arr</span>
                <span className="text-tx7"> of {ifrTotal} IFR</span>
              </p>
            </div>
            <div>
              <label className={LABEL}>MIN ARRIVAL SPACING</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={minSpacing}
                  onChange={(e) => setCfg({ minArrSpacing: +e.target.value })}
                  className="flex-1 min-w-[140px]"
                />
                <span className="font-mono text-[12px] text-arr whitespace-nowrap">{minSpacing.toFixed(1)} min</span>
              </div>
              <p className={`${HINT} ${arrOverflow ? "text-am-fg" : ""}`}>
                {numArr > 0
                  ? `${numArr} arr × ${minSpacing.toFixed(1)} min = ${(numArr * minSpacing).toFixed(1)} min${
                      arrOverflow ? ` — exceeds the ${sessionLen} min session` : ""
                    }`
                  : "no arrivals"}
              </p>
            </div>
          </div>
        </div>

        {/* ============ POOL READINESS ============ */}
        <div className={CARD}>
          <span className={`${HEAD} flex items-center gap-1.5`}>
            <Icon name="layers" size={12} />
            POOL READINESS
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <PoolCell label={`DEPARTURES FROM ${apt.icao}`} have={poolDeps} want={numDep} tone="dep" />
            <PoolCell label={`ARRIVALS TO ${apt.icao}`} have={poolArrs} want={numArr} tone="arr" />
          </div>
          <p className="text-[10.5px] text-tx7 leading-snug">
            Pool routes are pulled when origin/dest matches; the rest fall back to placeholder routes (
            <span className="font-mono text-tx4">DCT &lt;dest&gt;</span> for dep,{" "}
            <span className="font-mono text-tx4">&lt;origin&gt; DCT</span> for arr). Fetch flights in FPLN POOL to
            upgrade those.
          </p>
        </div>

        {/* ============ WILL GENERATE ============ */}
        <div className="bg-inset border border-bd1 rounded-xl p-3.5 flex flex-col gap-1">
          <span className={`${HEAD} mb-1`}>WILL GENERATE</span>
          <Line n={initialDepCount} tone="dep">
            initial departures at gates (T+0, staggered 0.3 min)
          </Line>
          <Line n={sessionDepCount} tone="dep">
            session departures at gates (uniform across {sessionLen} min)
          </Line>
          <Line n={numArr} tone="arr">
            session arrivals at RWY {cfg.arrRwy} exit (≥{minSpacing.toFixed(1)} min spacing, GS 30 kt)
          </Line>
          <Line n={vfrCount} tone="am">
            VFR ({vfrCircuit} circuit · {vfrLocal} local to {apt.vfrNearby.slice(0, 2).join("/")})
          </Line>
          {standCtx.source === "rampagent" && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gn-fg">
              <Icon name="check" size={12} />
              RampAgent fitness check active (wingspan + code letter)
            </div>
          )}
          {cfg.twoGateSpacing && standCtx.supportsFitness && (
            <div className="flex items-center gap-1.5 text-[11px] text-gn-fg">
              <Icon name="check" size={12} />
              2-gate spacing enforced (Block adjacency)
            </div>
          )}
        </div>

        {/* ============ result of the last generate ============ */}
        {errors.length > 0 && <ErrorNote title="Generation failed — nothing was added to the board" items={errors} />}
        {notes && notes.warnings.length > 0 && (
          <div className="bg-panel border border-am-bd rounded-xl p-3.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-am-fg">
                <Icon name="alert" size={13} />
              </span>
              <span className={HEAD}>GENERATION NOTES</span>
              <span className="font-mono text-[10.5px] text-tx7">
                {notes.count} aircraft · {notes.warnings.length} note{notes.warnings.length !== 1 ? "s" : ""}
              </span>
              <span className="flex-1" />
              <DeckKey size="sm" onClick={() => setNotes(null)} title="Dismiss these notes">
                <Icon name="x" size={12} />
                DISMISS
              </DeckKey>
            </div>
            <ul className="flex flex-col gap-1">
              {notes.warnings.map((w, i) => (
                <li key={i} className="text-[11px] text-tx4 leading-snug font-mono">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ============ commit bar ============ */}
      <div className="sticky bottom-0 z-10 flex-none flex items-center gap-2.5 px-4 py-3 bg-panel border-t border-bd1">
        <span className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-am-bd bg-am-bg text-am-fg">
          <Icon name="plane" size={12} />
          <span className="font-mono text-[11.5px] font-semibold">{groundCount}</span>
          <span className="text-[9.5px] font-bold tracking-[0.1em]">ON BOARD</span>
        </span>
        {groundCount > 0 && (
          <HoldKey onHold={clearGround} title={`Hold to remove all ${groundCount} ground-generated aircraft`}>
            <Icon name="trash" size={12} />
            CLEAR GROUND {groundCount}
          </HoldKey>
        )}
        <span className="flex-1" />
        <span className="text-[10.5px] text-tx7">
          {planned > 0 ? "replaces any existing ground traffic" : "set a total above to generate"}
        </span>
        <DeckKey
          size="lever"
          variant={planned > 0 ? "primary" : "default"}
          disabled={planned === 0}
          onClick={generate}
          title="Generate ground traffic for this airport (replaces previously generated ground aircraft)"
        >
          <Icon name="zap" size={14} />
          GENERATE {planned || ""}
        </DeckKey>
      </div>
    </div>
  );
}
