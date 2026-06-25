// App.tsx — top-level shell, redesigned to the handoff: titlebar (window dots,
// centered filename, theme toggle) + left navigation rail + per-view context
// strip + dot-grid content. All state, the localStorage keys, AIRAC handling,
// tab routing and the navdata/pool auto-load are preserved from the rc3 port.
// stars/rampConfig are mirrored into the core accessors generateFromRule/
// aircraftFootprint read.
import { useState, useEffect } from "react";
import { Icon } from "./ui/Icon";
import { ThemeToggle } from "./ui/ThemeToggle";
import { useTheme } from "./state/theme";
import { storage, KEYS, usePersist } from "./state/storage";
import { defaultScenario, migrateRules } from "./core/model";
import { addToPool, poolToAc } from "./core/pool";
import { setStars } from "./core/stars";
import { setRampConfig } from "./core/ramp";

import { Sidebar } from "./panels/Sidebar";
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

function Stat({ label, value, last }: { label: string; value: number; last?: boolean }) {
  return (
    <div className={`text-center ${last ? "pl-4 pr-[18px]" : "px-4 border-r border-bd1"}`}>
      <div className="text-[9px] tracking-[0.14em] text-tx7">{label}</div>
      <div className="font-mono text-[15px] text-tx1 mt-0.5">{value}</div>
    </div>
  );
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState("scenario");
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

  const titleName = `${(scenario.name || "scenario").replace(/[^a-z0-9]+/gi, "_")}.scn`;
  const metaLine = `${scenario.ils.length} ILS · ${(scenario.controllers || []).length} ctrl · ${(scenario.holdings || []).length} hold`;

  return (
    <div className="h-screen flex flex-col bg-bg text-tx1 font-sans overflow-hidden">
      {/* titlebar */}
      <div className="h-[34px] flex-none flex items-center px-3.5 bg-panel border-b border-bd1 relative">
        <div className="flex gap-[7px]">
          <span className="w-[9px] h-[9px] rounded-full bg-dotbtn" />
          <span className="w-[9px] h-[9px] rounded-full bg-dotbtn" />
          <span className="w-[9px] h-[9px] rounded-full bg-dotbtn" />
        </div>
        <div className="absolute inset-x-0 text-center font-mono text-[11px] text-tx7 tracking-[0.04em] pointer-events-none">
          {titleName} — Sweatbox Builder
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <Sidebar
          active={tab}
          onChange={setTab}
          poolCount={pool.length}
          scenarioCount={scenario.aircraft.length}
          rulesCount={(scenario.rules || []).length}
          navdataLoaded={waypoints.length > 0}
          airac={navAirac}
        />

        <div className="flex-1 flex flex-col min-w-0">
          {/* context strip */}
          <div className="flex-none flex items-center justify-between px-[22px] py-[14px] border-b border-bd1 bg-panel">
            <div className="min-w-0">
              <div className="text-[16px] font-semibold text-tx1 tracking-[-0.01em] truncate">
                {scenario.name || "Untitled scenario"}
              </div>
              <div className="font-mono text-[11px] text-tx7 mt-[3px]">{metaLine}</div>
            </div>
            <div className="flex items-center">
              <Stat label="AC" value={scenario.aircraft.length} />
              <Stat label="POOL" value={pool.length} />
              <Stat label="RULES" value={(scenario.rules || []).length} />
              <Stat label="GATES" value={gates.length} last />
              <button
                onClick={() => {
                  if (confirm("Discard scenario?")) setScenario(defaultScenario());
                }}
                className="text-[12px] text-tx3 bg-transparent border border-bd4 hover:border-bdh hover:text-tx1 rounded-[7px] px-[13px] py-2"
              >
                New
              </button>
              <button
                onClick={() => setTab("export")}
                className="flex items-center gap-[7px] text-[12.5px] font-semibold text-on-cyan bg-[#5ccfe0] hover:bg-[#74d8e6] rounded-[7px] px-[15px] py-[9px] ml-2.5"
              >
                <Icon name="download" size={14} />
                Generate .scn
              </button>
            </div>
          </div>

          {autoBundleStatus && (
            <div className="bg-gn-bg border-b border-gn-bd px-[22px] py-2 text-[11px] text-gn-fg flex items-center gap-2">
              <Icon name="check" size={12} />
              {autoBundleStatus}
            </div>
          )}

          {/* content */}
          <main className="flex-1 overflow-auto dotgrid">
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
      </div>
    </div>
  );
}
