// App.tsx — top-level shell. Ported from the rc3 App component. State, the
// localStorage keys, AIRAC handling, the tab structure and the auto-load of
// navdata.json/pool.json are all preserved. The two window.SB mirrors the shell
// used (stars, rampConfig) become setStars()/setRampConfig() so the ported
// generateFromRule and aircraftFootprint see the same data.
import { useState, useEffect } from "react";
import { Icon } from "./ui/Icon";
import { storage, KEYS, usePersist } from "./state/storage";
import { defaultScenario, migrateRules } from "./core/model";
import { addToPool, poolToAc } from "./core/pool";
import { setStars } from "./core/stars";
import { setRampConfig } from "./core/ramp";

import { TabBar } from "./panels/TabBar";
import { NavdataPanel } from "./panels/NavdataPanel";
import { SetupPanel } from "./panels/SetupPanel";
import { FlightPlansPanel } from "./panels/FlightPlansPanel";
import { AircraftPoolPanel } from "./panels/AircraftPoolPanel";
import { ScenarioPanel } from "./panels/ScenarioPanel";
import { GeneratorsPanel } from "./panels/GeneratorsPanel";
import { ExportPanel } from "./panels/ExportPanel";
import { SavedPanel } from "./panels/SavedPanel";

// Registers S1/S2/S3/C1 (side-effect import of the static generator registry).
import "./generators";

export default function App() {
  const [tab, setTab] = useState("pool");
  const [scenario, setScenario] = useState<any>(defaultScenario());
  const [autoBundleStatus, setAutoBundleStatus] = useState<string | null>(null);

  const [waypoints, setWaypoints] = useState<any[]>([]);
  const [airports, setAirports] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [runways, setRunways] = useState<any[]>([]);
  const [stars, setStarsState] = useState<any[]>([]);
  const [copx, setCopx] = useState<any[]>([]);
  const [gates, setGates] = useState<any[]>([]);
  const [navMeta, setNavMeta] = useState<any>({});
  const [loaded, setLoaded] = useState(false);
  const [navAirac, setNavAirac] = useState("");
  const [poolAirac, setPoolAirac] = useState("");
  const [rampAgent, setRampAgent] = useState<any>({});
  const [rampConfig, setRampConfigState] = useState<any>(null);
  const [pendingAircraft, setPendingAircraft] = useState<any>(null);
  const [pool, setPool] = useState<any[]>([]);
  const [vatsimCache, setVatsimCache] = useState<any>({ pilots: [], icao: "", mode: "arr", fetchedAt: null });

  // Initial load from localStorage
  useEffect(() => {
    const wp = storage.get(KEYS.waypoints);
    if (wp) setWaypoints(wp);
    const ap = storage.get(KEYS.airports);
    if (ap) setAirports(ap);
    const po = storage.get(KEYS.positions);
    if (po) setPositions(po);
    const rw = storage.get(KEYS.runways);
    if (rw) setRunways(rw);
    const st = storage.get(KEYS.stars);
    if (st) setStarsState(st);
    const cx = storage.get(KEYS.copx);
    if (cx) setCopx(cx);
    const gt = storage.get(KEYS.gates);
    if (gt) setGates(gt);
    const meta = storage.get(KEYS.navMeta);
    if (meta) setNavMeta(meta);
    const cur = storage.get(KEYS.current);
    if (cur) setScenario({ ...defaultScenario(), ...cur, rules: migrateRules(cur.rules) });
    const pl = storage.get(KEYS.pool);
    if (pl) setPool(pl);
    const na = storage.get(KEYS.navAirac);
    if (na) setNavAirac(na);
    const pa = storage.get(KEYS.poolAirac);
    if (pa) setPoolAirac(pa);
    const ra = storage.get(KEYS.rampAgent);
    if (ra) setRampAgent(ra);
    const rc = storage.get(KEYS.rampConfig);
    if (rc) {
      setRampConfigState(rc);
      setRampConfig(rc);
    }
    setLoaded(true);
  }, []);

  // Debounced scenario save
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => storage.set(KEYS.current, scenario), 400);
    return () => clearTimeout(t);
  }, [scenario, loaded]);

  // Persistent state mirrors
  usePersist(pool, KEYS.pool, loaded);
  usePersist(navAirac, KEYS.navAirac, loaded);
  usePersist(poolAirac, KEYS.poolAirac, loaded);
  usePersist(rampAgent, KEYS.rampAgent, loaded);
  usePersist(rampConfig, KEYS.rampConfig, loaded, (v) => setRampConfig(v));
  useEffect(() => {
    if (!loaded) return;
    setStars(stars);
  }, [stars, loaded]);

  // One-time auto-load of navdata.json / pool.json from disk if available.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      const results: string[] = [];
      try {
        const r = await fetch("navdata.json", { cache: "no-cache" });
        if (r.ok) {
          const b = await r.json();
          if (b.kind === "sweatbox-navdata") {
            const existingTs = Math.max(navMeta?.sctAt || 0, navMeta?.eseAt || 0);
            const bundleTs = b.exportedAt ? new Date(b.exportedAt).getTime() : 0;
            if (!existingTs || bundleTs > existingTs) {
              applyNavBundle(b);
              results.push(`navdata${b.airac ? ` (AIRAC ${b.airac})` : ""}`);
            }
          }
        }
      } catch {}
      try {
        const r = await fetch("pool.json", { cache: "no-cache" });
        if (r.ok) {
          const b = await r.json();
          if (b.kind === "sweatbox-pool") {
            const existingCount = pool.length;
            const bundleCount = (b.pool || []).length;
            if (!existingCount || bundleCount > existingCount) {
              applyPoolBundle(b);
              results.push(`pool${b.airac ? ` (AIRAC ${b.airac})` : ""}: ${bundleCount} entries`);
            }
          }
        }
      } catch {}
      if (!cancelled && results.length) {
        setAutoBundleStatus("Loaded from disk: " + results.join(" · "));
        setTimeout(() => setAutoBundleStatus(null), 5000);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  function applyNavBundle(b: any) {
    const wp = b.waypoints || [];
    const ap = b.airports || [];
    const po = b.positions || [];
    const rw = b.runways || [];
    const st = b.stars || [];
    const cx = b.copx || [];
    const gt = b.gates || [];
    setWaypoints(wp);
    setAirports(ap);
    setPositions(po);
    setRunways(rw);
    setStarsState(st);
    setCopx(cx);
    setGates(gt);
    storage.set(KEYS.waypoints, wp);
    storage.set(KEYS.airports, ap);
    storage.set(KEYS.positions, po);
    storage.set(KEYS.runways, rw);
    storage.set(KEYS.stars, st);
    storage.set(KEYS.copx, cx);
    storage.set(KEYS.gates, gt);
    const meta = b.navMeta || { sctAt: Date.now(), eseAt: Date.now() };
    setNavMeta(meta);
    storage.set(KEYS.navMeta, meta);
    if (b.airac) {
      setNavAirac(b.airac);
      storage.set(KEYS.navAirac, b.airac);
    }
  }
  function applyPoolBundle(b: any) {
    const items = (b.pool || []).map((p: any) => ({ ...p, id: p.id || crypto.randomUUID?.() || String(Math.random()) }));
    setPool(items);
    storage.set(KEYS.pool, items);
    if (b.airac) {
      setPoolAirac(b.airac);
      storage.set(KEYS.poolAirac, b.airac);
    }
  }

  const handleParseSct = ({ waypoints: wp, airports: ap, runways: rw }: any) => {
    setWaypoints(wp);
    setAirports(ap);
    setRunways(rw);
    storage.set(KEYS.waypoints, wp);
    storage.set(KEYS.airports, ap);
    storage.set(KEYS.runways, rw);
    const meta = { ...navMeta, sctAt: Date.now() };
    setNavMeta(meta);
    storage.set(KEYS.navMeta, meta);
  };
  const handleParseEse = ({ positions: po, stars: st, copx: cx, gates: gt }: any) => {
    setPositions(po);
    setStarsState(st || []);
    setCopx(cx || []);
    setGates(gt || []);
    storage.set(KEYS.positions, po);
    storage.set(KEYS.stars, st || []);
    storage.set(KEYS.copx, cx || []);
    storage.set(KEYS.gates, gt || []);
    const meta = { ...navMeta, eseAt: Date.now() };
    setNavMeta(meta);
    storage.set(KEYS.navMeta, meta);
  };
  const resetSct = () => {
    if (!confirm("Clear sector data?")) return;
    setWaypoints([]);
    setAirports([]);
    setRunways([]);
    storage.del(KEYS.waypoints);
    storage.del(KEYS.airports);
    storage.del(KEYS.runways);
    const meta = { ...navMeta, sctAt: null };
    setNavMeta(meta);
    storage.set(KEYS.navMeta, meta);
  };
  const resetEse = () => {
    if (!confirm("Clear ESE data?")) return;
    setPositions([]);
    setStarsState([]);
    setCopx([]);
    setGates([]);
    storage.del(KEYS.positions);
    storage.del(KEYS.stars);
    storage.del(KEYS.copx);
    storage.del(KEYS.gates);
    const meta = { ...navMeta, eseAt: null };
    setNavMeta(meta);
    storage.set(KEYS.navMeta, meta);
  };
  const handleAddToPool = (items: any[], source: string) => setPool((prev) => addToPool(prev, items, source));
  const handleDeleteFromPool = (ids: string[]) => setPool((prev) => prev.filter((p) => !ids.includes(p.id)));
  const handleAddPoolToScenario = (entries: any[]) => {
    setPendingAircraft(entries.map((e) => poolToAc(e, false)));
    setTab("scenario");
  };
  const handleLoadRampAgent = (parsed: any) => setRampAgent((prev: any) => ({ ...prev, [parsed.icao]: parsed }));
  const handleLoadRampConfig = (parsed: any) => setRampConfigState(parsed);
  const handleResetRampAgent = () => {
    if (!confirm("Clear all RampAgent data?")) return;
    setRampAgent({});
    setRampConfigState(null);
    storage.del(KEYS.rampAgent);
    storage.del(KEYS.rampConfig);
  };

  const generatorProps = { scenario, onChange: setScenario, waypoints, airports, runways, positions, pool, stars, copx, gates, rampAgent, rampConfig };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-sky-400">
            <Icon name="plane" size={20} />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Sweatbox Builder v6</h1>
            <p className="text-xs text-slate-500">
              {scenario.name} · {scenario.aircraft.length} ac · {pool.length} pool · {(scenario.rules || []).length} rules ·{" "}
              {(scenario.holdings || []).length} hold · {gates.length} gates
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => { if (confirm("Discard scenario?")) setScenario(defaultScenario()); }} className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1 border border-slate-700 rounded">
            New
          </button>
        </div>
      </header>
      <TabBar active={tab} onChange={setTab} poolCount={pool.length} scenarioCount={scenario.aircraft.length} />
      {autoBundleStatus && (
        <div className="bg-emerald-950/40 border-b border-emerald-900/40 px-6 py-2 text-xs text-emerald-300 flex items-center gap-2">
          <Icon name="check" size={12} />
          {autoBundleStatus}
        </div>
      )}
      <main className="flex-1 overflow-auto">
        {tab === "navdata" && (
          <NavdataPanel
            waypoints={waypoints}
            airports={airports}
            positions={positions}
            runways={runways}
            stars={stars}
            copx={copx}
            gates={gates}
            navMeta={navMeta}
            airac={navAirac}
            onSetAirac={setNavAirac}
            onParseSct={handleParseSct}
            onParseEse={handleParseEse}
            onResetSct={resetSct}
            onResetEse={resetEse}
            onImportBundle={applyNavBundle}
            rampAgent={rampAgent}
            rampConfig={rampConfig}
            onLoadRampAgent={handleLoadRampAgent}
            onLoadRampConfig={handleLoadRampConfig}
            onResetRampAgent={handleResetRampAgent}
          />
        )}
        {tab === "setup" && <SetupPanel scenario={scenario} onChange={setScenario} positions={positions} runways={runways} waypoints={waypoints} />}
        {tab === "plans" && <FlightPlansPanel onAddToPool={handleAddToPool} vatsimCache={vatsimCache} setVatsimCache={setVatsimCache} />}
        {tab === "pool" && <AircraftPoolPanel pool={pool} onDelete={handleDeleteFromPool} onAddToScenario={handleAddPoolToScenario} airac={poolAirac} onSetAirac={setPoolAirac} onImportPool={applyPoolBundle} />}
        {tab === "generators" && <GeneratorsPanel {...generatorProps} />}
        {tab === "scenario" && <ScenarioPanel scenario={scenario} onChange={setScenario} waypoints={waypoints} pendingAircraft={pendingAircraft} onClearPending={() => setPendingAircraft(null)} />}
        {tab === "export" && <ExportPanel scenario={scenario} waypoints={waypoints} />}
        {tab === "saved" && <SavedPanel scenario={scenario} onChange={setScenario} />}
      </main>
    </div>
  );
}
