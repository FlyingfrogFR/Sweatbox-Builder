// s1.tsx — S1 Ground generator UI. Ported from scenario-s1-ground.js (the
// GroundPanel component); the generation logic lives in src/core/ground.ts.
import { useEffect } from "react";
import { Icon } from "../ui/Icon";
import { AIRPORTS, resolveStandSource, defaultGroundConfig, buildGroundAircraft } from "../core/ground";
import { registerGenerator } from "./registry";

function GroundPanel({ scenario, onChange, gates, pool, rampAgent, rampConfig }: any) {
  const cfg = scenario.groundConfig || defaultGroundConfig();
  const setCfg = (patch: any) => onChange({ ...scenario, groundConfig: { ...cfg, ...patch } });

  useEffect(() => {
    const apt = AIRPORTS[cfg.airport];
    if (!apt) return;
    if (!apt.runways.includes(cfg.depRwy) || !apt.runways.includes(cfg.arrRwy)) {
      setCfg({ depRwy: apt.defaultDepRwy, arrRwy: apt.defaultArrRwy });
    }
  }, [cfg.airport]);

  const apt = AIRPORTS[cfg.airport] || AIRPORTS.LFLL;
  const standCtx = resolveStandSource(apt, gates, rampAgent);

  const poolDeps = (pool || []).filter((p: any) => p.origin === apt.icao && p.route).length;
  const poolArrs = (pool || []).filter((p: any) => p.dest === apt.icao && p.route).length;

  const total = Math.max(0, +cfg.total || 0);
  const vfrCount = Math.max(0, +cfg.vfrCount || 0);
  const ifrTotal = Math.max(0, total - vfrCount);
  const numDep = Math.round(ifrTotal * (cfg.depRatio || 0.8));
  const numArr = ifrTotal - numDep;
  const initialDepCount = Math.min(+cfg.initialPopulated || 0, numDep);

  const groundCount = scenario.aircraft.filter((a: any) => a.groundMeta).length;

  function generate() {
    const { aircraft, warnings, errors } = buildGroundAircraft(cfg, gates, pool, rampAgent);
    if (errors.length) {
      alert("Errors:\n" + errors.join("\n"));
      return;
    }
    const others = scenario.aircraft.filter((a: any) => !a.groundMeta);
    const merged = [...others, ...aircraft].sort((a: any, b: any) => (+a.start || 0) - (+b.start || 0));
    onChange({ ...scenario, aircraft: merged });
    if (warnings.length) alert(`Generated ${aircraft.length} aircraft.\n\n` + warnings.join("\n"));
  }
  function clearGround() {
    if (!groundCount) return;
    if (!confirm(`Remove ${groundCount} ground-generated aircraft?`)) return;
    onChange({ ...scenario, aircraft: scenario.aircraft.filter((a: any) => !a.groundMeta) });
  }

  const lb = "block text-xs text-slate-400 mb-1";
  const ip = "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 font-mono focus:border-sky-500 focus:outline-none";

  let sourceBadge;
  if (standCtx.source === "rampagent") {
    const ra = rampAgent[apt.icao];
    const standsWithCode = ra.stands.filter((s: any) => s.code).length;
    const standsWithWs = ra.stands.filter((s: any) => s.wingspan !== null).length;
    sourceBadge = (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 rounded text-xs font-medium">
        <Icon name="check" size={12} />
        RampAgent · {ra.stands.length} stands ({standsWithCode} coded, {standsWithWs} wingspan-limited)
      </span>
    );
  } else if (standCtx.source === "ese") {
    sourceBadge = (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-900/40 border border-sky-700/50 text-sky-300 rounded text-xs font-medium">
        <Icon name="check" size={12} />
        ESE · {standCtx.stands.length} stands (no wingspan/code data)
      </span>
    );
  } else {
    sourceBadge = (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/40 border border-amber-700/50 text-amber-300 rounded text-xs font-medium">
        <Icon name="alert" size={12} />
        {standCtx.stands.length} hardcoded fallback stands
      </span>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-slate-200">S1 Ground · Single-airport scenario</h2>
        <div className="flex gap-2">
          {groundCount > 0 && (
            <button onClick={clearGround} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200">
              Clear ground ({groundCount})
            </button>
          )}
          <button onClick={generate} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm text-white font-medium">
            <Icon name="zap" size={14} />
            Generate
          </button>
        </div>
      </div>

      <section>
        <label className={lb}>Generation mode</label>
        <div className="flex gap-2">
          <button onClick={() => setCfg({ mode: "S1" })} className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium ${cfg.mode !== "S2" ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}>
            <Icon name="home" size={14} />S1 — Ground only
          </button>
          <button onClick={() => setCfg({ mode: "S2" })} className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium ${cfg.mode === "S2" ? "bg-amber-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}>
            <Icon name="radio" size={14} />S2 — Tower flow
          </button>
        </div>
        {cfg.mode === "S2" && (
          <p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
            <Icon name="alert" size={12} />S2 Tower mode is not yet implemented — generation will fall back to S1 ground only.
          </p>
        )}
      </section>

      <section className="grid grid-cols-3 gap-3">
        <div>
          <label className={lb}>Airport</label>
          <select value={cfg.airport} onChange={(e) => setCfg({ airport: e.target.value })} className={ip}>
            {Object.values(AIRPORTS).map((a: any) => (
              <option key={a.icao} value={a.icao}>
                {a.icao} — {a.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1 font-mono">Elev {apt.elevation} ft</p>
        </div>
        <div>
          <label className={lb}>Departure runway</label>
          <select value={cfg.depRwy} onChange={(e) => setCfg({ depRwy: e.target.value })} className={ip}>
            {apt.runways.map((rw: string) => (
              <option key={rw} value={rw}>
                {rw}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1 font-mono">Default {apt.defaultDepRwy}</p>
        </div>
        <div>
          <label className={lb}>Arrival runway</label>
          <select value={cfg.arrRwy} onChange={(e) => setCfg({ arrRwy: e.target.value })} className={ip}>
            {apt.runways.map((rw: string) => (
              <option key={rw} value={rw}>
                {rw}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1 font-mono">Default {apt.defaultArrRwy}</p>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          {sourceBadge}
          {!rampConfig && <span className="text-xs text-amber-400/80">⚠ No RampAgent <code>config.json</code> loaded — wingspan check uses WTC fallback values</span>}
          {rampConfig && standCtx.source !== "rampagent" && (
            <span className="text-xs text-slate-500">
              RampAgent config loaded but no airport file for {apt.icao} — upload <code className="text-slate-400">{apt.icao}.json</code> in Navdata for fitness-aware assignment
            </span>
          )}
        </div>
        <label
          className={`flex items-center gap-2 text-sm cursor-pointer select-none ${standCtx.supportsFitness ? "text-slate-300" : "text-slate-600 cursor-not-allowed"}`}
          title={standCtx.supportsFitness ? "When enabled, aircraft are assigned at least one empty stand apart, using RampAgent Block topology. A spawned stand X excludes X.Block and (X.Block).Block from the next assignments." : "Requires RampAgent data — Block topology not available with ESE or fallback stands."}
        >
          <input type="checkbox" checked={!!cfg.twoGateSpacing} onChange={(e) => setCfg({ twoGateSpacing: e.target.checked })} disabled={!standCtx.supportsFitness} className="accent-sky-500" />
          Always 2 gates apart (uses RampAgent Block adjacency)
          {!standCtx.supportsFitness && <span className="text-xs text-slate-600">— RampAgent required</span>}
        </label>
      </section>

      <section>
        <h3 className="text-xs uppercase text-slate-500 font-semibold mb-2">Traffic Counts</h3>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className={lb}>Total aircraft</label>
            <input type="number" min="0" max="100" className={ip} value={cfg.total} onChange={(e) => setCfg({ total: +e.target.value })} />
          </div>
          <div>
            <label className={lb}>Already on field at T0</label>
            <input type="number" min="0" className={ip} value={cfg.initialPopulated} onChange={(e) => setCfg({ initialPopulated: +e.target.value })} />
            <p className="text-xs text-slate-500 mt-1">Departures only</p>
          </div>
          <div>
            <label className={lb}>Session length (min)</label>
            <input type="number" min="1" max="240" className={ip} value={cfg.sessionLen} onChange={(e) => setCfg({ sessionLen: +e.target.value })} />
          </div>
          <div>
            <label className={lb}>VFR count</label>
            <input type="number" min="0" max="20" className={ip} value={cfg.vfrCount} onChange={(e) => setCfg({ vfrCount: +e.target.value })} />
            <p className="text-xs text-slate-500 mt-1">½ circuit, ½ local hop</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-6">
        <div>
          <label className={lb}>
            Departure / Arrival ratio: <span className="text-sky-300 font-mono">{Math.round(cfg.depRatio * 100)}/{100 - Math.round(cfg.depRatio * 100)}</span>
          </label>
          <input type="range" min="0" max="1" step="0.05" value={cfg.depRatio} onChange={(e) => setCfg({ depRatio: +e.target.value })} className="w-full" />
          <p className="text-xs text-slate-500 font-mono mt-1">{numDep} dep · {numArr} arr (of {ifrTotal} IFR)</p>
        </div>
        <div>
          <label className={lb}>
            Min arrival spacing: <span className="text-sky-300 font-mono">{cfg.minArrSpacing.toFixed(1)} min</span>
          </label>
          <input type="range" min="0" max="10" step="0.5" value={cfg.minArrSpacing} onChange={(e) => setCfg({ minArrSpacing: +e.target.value })} className="w-full" />
          <p className={`text-xs font-mono mt-1 ${numArr > 0 && numArr * cfg.minArrSpacing > cfg.sessionLen ? "text-amber-400" : "text-slate-500"}`}>
            {numArr > 0
              ? `${numArr} arr × ${cfg.minArrSpacing.toFixed(1)} min = ${(numArr * cfg.minArrSpacing).toFixed(1)} min ${numArr * cfg.minArrSpacing > cfg.sessionLen ? "⚠ exceeds session" : ""}`
              : "no arrivals"}
          </p>
        </div>
      </section>

      <section className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-2">
        <h3 className="text-xs uppercase text-slate-400 font-semibold flex items-center gap-1.5">
          <Icon name="layers" size={12} />
          Pool readiness
        </h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950/60 rounded p-2">
            <div className="text-slate-500 mb-0.5">Departures from {apt.icao}</div>
            <div className="font-mono">
              <span className={`text-base font-semibold ${poolDeps >= numDep && numDep > 0 ? "text-emerald-400" : poolDeps > 0 ? "text-sky-400" : "text-amber-400"}`}>{poolDeps}</span>
              <span className="text-slate-500"> in pool · </span>
              <span className="text-slate-300">{numDep} requested</span>
            </div>
          </div>
          <div className="bg-slate-950/60 rounded p-2">
            <div className="text-slate-500 mb-0.5">Arrivals to {apt.icao}</div>
            <div className="font-mono">
              <span className={`text-base font-semibold ${poolArrs >= numArr && numArr > 0 ? "text-emerald-400" : poolArrs > 0 ? "text-sky-400" : "text-amber-400"}`}>{poolArrs}</span>
              <span className="text-slate-500"> in pool · </span>
              <span className="text-slate-300">{numArr} requested</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Pool routes are pulled when origin/dest matches; the rest fall back to placeholder routes (<code className="text-slate-400">DCT &lt;dest&gt;</code> for dep,{" "}
          <code className="text-slate-400">&lt;origin&gt; DCT</code> for arr). Import flights from the Plans tab to upgrade those.
        </p>
      </section>

      <section className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-400 space-y-0.5">
        <div className="text-slate-300 font-semibold mb-1">Will generate:</div>
        <div>· {initialDepCount} initial departures at gates (T+0, staggered 0.3 min)</div>
        <div>· {numDep - initialDepCount} session departures at gates (uniform across {cfg.sessionLen} min)</div>
        <div>· {numArr} session arrivals at RWY {cfg.arrRwy} exit (≥{cfg.minArrSpacing.toFixed(1)} min spacing, GS 30 kt)</div>
        <div>· {vfrCount} VFR ({Math.ceil(vfrCount / 2)} circuit · {Math.floor(vfrCount / 2)} local to {apt.vfrNearby.slice(0, 2).join("/")})</div>
        {standCtx.source === "rampagent" && <div className="text-emerald-400/80 mt-1">→ RampAgent fitness check active (wingspan + code letter)</div>}
        {cfg.twoGateSpacing && standCtx.supportsFitness && <div className="text-emerald-400/80">→ 2-gate spacing enforced (Block adjacency)</div>}
      </section>
    </div>
  );
}

registerGenerator({
  id: "S1",
  label: "S1 Ground",
  render: (props: any) => <GroundPanel {...props} />,
});
