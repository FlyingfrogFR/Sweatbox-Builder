// DeckApp.tsx — the FLIGHTDECK shell. One screen, four fixed zones, zero
// navigation: Slot Rail (left) · Traffic Board (center) · Output Pane (right)
// · Command Dock (bottom). Heavier editors slide in as trays over the board;
// the per-aircraft editor is a drawer over the output pane; Esc always lands
// back on the deck. All data plumbing (navdata, pool, caches, persistence,
// disk auto-load) is carried over from the classic App shell unchanged — the
// generation core in src/core is consumed as-is.
import { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from "react";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useTheme } from "../state/theme";
import { storage, KEYS, usePersist } from "../state/storage";
import { defaultScenario } from "../core/model";
import { addToPool, poolToAc } from "../core/pool";
import { setStars } from "../core/stars";
import { setRampConfig } from "../core/ramp";
import { generateSweatbox } from "../core/generateSweatbox";
import { generateFromRule } from "../core/generateFromRule";
import { buildExportName, saveTextFile } from "../io/fileSave";
import { sortByStart } from "../state/aircraft";
import * as slots from "../state/slots";

import { SlotRail } from "./SlotRail";
import { TrafficBoard } from "./TrafficBoard";
import { OutputPane } from "./OutputPane";
import { CommandDock } from "./CommandDock";
import { AircraftDrawer } from "./AircraftDrawer";
import { RewindStrip } from "./RewindStrip";
import { Toasts, useToasts } from "./Toasts";
import { SetupTray } from "./trays/SetupTray";
import { FplnPoolTray } from "./trays/FplnPoolTray";
import { BuildTray } from "./trays/BuildTray";

// Registers S1/S2 into the plugin registry (side-effect import kept for the
// GROUND tray, which renders the registered S1 panel).
import "../generators";

export type TrayId = "setup" | "pool" | "build" | null;

export default function DeckApp() {
  const { theme, toggle } = useTheme();
  const { toasts, toast } = useToasts();

  // ---------- slot-bound scenario ----------
  const boot = useMemo(() => slots.ensureActiveSlot(), []);
  const [slotName, setSlotName] = useState(boot.name);
  const [scenario, setScenario] = useState<any>(boot.scenario);
  const [slotList, setSlotList] = useState<string[]>(slots.listSlots());

  // ---------- workshop equipment (global, exactly as the classic shell) ----------
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
  const [pool, setPool] = useState<any[]>([]);
  const [vatsimCache, setVatsimCache] = useState<any>({
    pilots: [],
    icao: "",
    mode: "arr",
    fetchedAt: null,
  });
  const [simbriefCache, setSimbriefCache] = useState<any>({ ofp: null });

  // ---------- deck UI state ----------
  const [tray, setTray] = useState<TrayId>(null);
  const [setupSection, setSetupSection] = useState<"scenario" | "navdata">("scenario");
  const [buildSection, setBuildSection] = useState<"rules" | "manual" | "ground">("rules");
  const [editingAc, setEditingAc] = useState<any>(null); // aircraft object open in the drawer
  const [rewindOpen, setRewindOpen] = useState(false);
  const [boardFilter, setBoardFilter] = useState<"all" | "arr" | "dep">("all");
  const [shipped, setShipped] = useState<{ t: string } | null>(null);
  const [lastExport, setLastExport] = useState<any>(slots.getDeckPrefs().lastExport || null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [rulesFocusId, setRulesFocusId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // ---------- initial load from localStorage ----------
  useEffect(() => {
    const g = (k: string, set: (v: any) => void) => {
      const v = storage.get(k);
      if (v) set(v);
    };
    g(KEYS.waypoints, setWaypoints);
    g(KEYS.airports, setAirports);
    g(KEYS.positions, setPositions);
    g(KEYS.runways, setRunways);
    g(KEYS.stars, setStarsState);
    g(KEYS.copx, setCopx);
    g(KEYS.gates, setGates);
    g(KEYS.navMeta, setNavMeta);
    g(KEYS.pool, setPool);
    g(KEYS.navAirac, setNavAirac);
    g(KEYS.poolAirac, setPoolAirac);
    g(KEYS.rampAgent, setRampAgent);
    const rc = storage.get(KEYS.rampConfig);
    if (rc) {
      setRampConfigState(rc);
      setRampConfig(rc);
    }
    setLoaded(true);
  }, []);

  // ---------- autosave: sb:cur (400ms) + active slot (2s), flush on hide ----------
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;
  const slotNameRef = useRef(slotName);
  slotNameRef.current = slotName;
  const loadedRef = useRef(false);
  loadedRef.current = loaded;
  const curTimer = useRef<any>(null);
  const slotTimer = useRef<any>(null);
  useEffect(() => {
    if (!loaded) return;
    curTimer.current = setTimeout(() => storage.set(KEYS.current, scenario), 400);
    slotTimer.current = setTimeout(() => {
      slots.writeSlot(slotNameRef.current, scenario);
      setSlotList(slots.listSlots());
    }, 2000);
    return () => {
      clearTimeout(curTimer.current);
      clearTimeout(slotTimer.current);
    };
  }, [scenario, loaded]);
  useEffect(() => {
    const flush = () => {
      if (!loadedRef.current) return;
      clearTimeout(curTimer.current);
      clearTimeout(slotTimer.current);
      storage.set(KEYS.current, scenarioRef.current);
      slots.writeSlot(slotNameRef.current, scenarioRef.current);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // ---------- persistent mirrors (identical to the classic shell) ----------
  usePersist(pool, KEYS.pool, loaded);
  usePersist(navAirac, KEYS.navAirac, loaded);
  usePersist(poolAirac, KEYS.poolAirac, loaded);
  usePersist(rampAgent, KEYS.rampAgent, loaded);
  usePersist(rampConfig, KEYS.rampConfig, loaded, (v) => setRampConfig(v));
  useEffect(() => {
    if (!loaded) return;
    setStars(stars);
  }, [stars, loaded]);

  // ---------- one-time auto-load of navdata.json / pool.json from disk ----------
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
            if (!pool.length || (b.pool || []).length > pool.length) {
              applyPoolBundle(b);
              results.push(
                `pool${b.airac ? ` (AIRAC ${b.airac})` : ""}: ${(b.pool || []).length} entries`,
              );
            }
          }
        }
      } catch {}
      if (!cancelled && results.length) toast(`Loaded from disk: ${results.join(" · ")}`, "ok");
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  function applyNavBundle(b: any) {
    const put = (k: string, v: any, set: (x: any) => void) => {
      set(v);
      storage.set(k, v);
    };
    put(KEYS.waypoints, b.waypoints || [], setWaypoints);
    put(KEYS.airports, b.airports || [], setAirports);
    put(KEYS.positions, b.positions || [], setPositions);
    put(KEYS.runways, b.runways || [], setRunways);
    put(KEYS.stars, b.stars || [], setStarsState);
    put(KEYS.copx, b.copx || [], setCopx);
    put(KEYS.gates, b.gates || [], setGates);
    const meta = b.navMeta || { sctAt: Date.now(), eseAt: Date.now() };
    put(KEYS.navMeta, meta, setNavMeta);
    if (b.airac) setNavAirac(b.airac);
  }
  function applyPoolBundle(b: any) {
    const items = (b.pool || []).map((p: any) => ({
      ...p,
      id: p.id || crypto.randomUUID?.() || String(Math.random()),
    }));
    setPool(items);
    if (b.airac) setPoolAirac(b.airac);
  }

  // ---------- slot actions ----------
  const flushActiveSlot = useCallback(() => {
    slots.writeSlot(slotNameRef.current, scenarioRef.current);
  }, []);
  const boardSweep = () => {
    const el = boardRef.current;
    if (!el) return;
    el.classList.remove("dk-board-sweep");
    void el.offsetWidth;
    el.classList.add("dk-board-sweep");
  };
  const switchSlot = (name: string) => {
    if (name === slotName) return;
    flushActiveSlot();
    const sc = slots.readSlot(name);
    if (!sc) return;
    slots.setActive(name);
    setSlotName(name);
    setScenario(sc);
    setBoardFilter("all");
    setEditingAc(null);
    setTray(null);
    setRewindOpen(false);
    boardSweep();
  };
  const newSlot = () => {
    flushActiveSlot();
    const name = slots.uniqueName("Untitled");
    const sc = { ...defaultScenario(), name };
    slots.writeSlot(name, sc);
    slots.setActive(name);
    setSlotName(name);
    setScenario(sc);
    setSlotList(slots.listSlots());
    boardSweep();
    toast(`New slot <b>${name}</b> — nothing was discarded`, "ok");
  };
  const renameSlot = (oldName: string, newName: string): string | null => {
    if (oldName === slotName) flushActiveSlot();
    const err = slots.renameSlot(oldName, newName);
    if (err) return err;
    if (oldName === slotName) {
      setSlotName(newName);
      setScenario((s: any) => ({ ...s, name: newName }));
    }
    setSlotList(slots.listSlots());
    return null;
  };
  const cloneSlot = (name: string) => {
    flushActiveSlot();
    const src = slots.readSlot(name);
    if (!src) return;
    const copy = slots.uniqueName(`${name} copy`);
    slots.writeSlot(copy, { ...src, name: copy });
    slots.setActive(copy);
    setSlotName(copy);
    setScenario({ ...src, name: copy });
    setSlotList(slots.listSlots());
    boardSweep();
    toast(`Cloned to <b>${copy}</b>`, "ok");
  };
  const removeSlot = (name: string) => {
    slots.deleteSlot(name);
    let list = slots.listSlots();
    if (name === slotName) {
      if (!list.length) {
        const nn = slots.uniqueName("Untitled");
        const sc = { ...defaultScenario(), name: nn };
        slots.writeSlot(nn, sc);
        list = slots.listSlots();
      }
      const next = list[0];
      slots.setActive(next);
      setSlotName(next);
      setScenario(slots.readSlot(next));
      boardSweep();
    }
    setSlotList(list);
    toast(`Deleted <b>${name}</b>`, "warn");
  };
  const importSlotBundle = (bundle: any) => {
    if (bundle?.kind !== "sweatbox-scenario" || !bundle.scenario) {
      toast("Not a scenario bundle", "err");
      return;
    }
    flushActiveSlot();
    const name = slots.uniqueName(bundle.scenario.name || "Imported");
    slots.writeSlot(name, { ...bundle.scenario, name });
    const sc = slots.readSlot(name);
    slots.setActive(name);
    setSlotName(name);
    setScenario(sc);
    setSlotList(slots.listSlots());
    boardSweep();
    toast(`Bundle imported as <b>${name}</b> — current slot untouched`, "ok");
  };

  // ---------- snapshots / REWIND ----------
  const snapshot = useCallback((label: string) => {
    slots.pushSnap(slotNameRef.current, label, scenarioRef.current.aircraft || []);
  }, []);
  const rewindTo = (snap: slots.Snap) => {
    snapshot("before REWIND");
    setScenario((s: any) => ({ ...s, aircraft: JSON.parse(JSON.stringify(snap.aircraft)) }));
    setRewindOpen(false);
    boardSweep();
    toast(`Rewound to <b>${new Date(snap.t).toTimeString().slice(0, 5)}</b>`, "ok");
  };

  // ---------- RUN RULES (whole-scenario generalization of Apply all) ----------
  const runRules = () => {
    // Read through the ref: the workbench live-commits edits on blur, and a
    // RUN RULES click can land before React re-renders this closure — the ref
    // always holds the freshest scenario.
    const sc = scenarioRef.current;
    const rules = sc.rules || [];
    if (!rules.length) {
      openTray("build", "rules");
      return;
    }
    snapshot("before RUN RULES");
    setTray(null);
    const ids = new Set(rules.map((r: any) => r.id));
    let ac = sc.aircraft.filter((a: any) => !a.ruleId || !ids.has(a.ruleId));
    const used = new Set<string>(ac.map((a: any) => a.callsign).filter(Boolean));
    const fresh: any[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const r of rules) {
      const {
        aircraft: gen,
        error,
        warning,
      }: any = generateFromRule(r, waypoints, used, pool, copx, sc.boundaryFir);
      if (error) {
        errors.push(`${r.name}: ${error}`);
        continue;
      }
      if (warning) warnings.push(`${r.name}: ${warning}`);
      fresh.push(...gen);
      ac = [...ac, ...gen];
    }
    if (warnings.length) toast(warnings.join("<br>"), "warn");
    setScenario({ ...sc, aircraft: sortByStart(ac) });
    setFlashIds(new Set(fresh.map((a) => a.id)));
    if (errors.length)
      toast(
        `${errors.length} rule${errors.length > 1 ? "s" : ""} failed:<br>${errors.join("<br>")}`,
        "err",
      );
    else
      toast(
        `${rules.length} rule${rules.length > 1 ? "s" : ""} → <b>${fresh.length} aircraft</b> regenerated`,
        "ok",
      );
    return fresh.length;
  };

  // ---------- live .scn output ----------
  const prefs = useMemo(() => storage.get(KEYS.exportPrefs) || {}, []);
  const [tokens, setTokens] = useState<any>({
    icao: prefs.icao || "",
    version: prefs.version || "",
    config: prefs.config || "",
    configNum: prefs.configNum || "",
  });
  const [autoPP, setAutoPP] = useState(!!prefs.autoAssign);
  const [ppMode, setPpMode] = useState(prefs.ppMode === "custom" ? "custom" : "list");
  const [ppList, setPpList] = useState(prefs.ppList || "");
  const [ppCustom, setPpCustom] = useState(prefs.ppCustom || "");
  useEffect(() => {
    storage.set(KEYS.exportPrefs, {
      autoAssign: autoPP,
      ppMode,
      ppList,
      ppCustom,
      icao: tokens.icao,
      version: tokens.version,
      config: tokens.config,
      configNum: tokens.configNum,
    });
  }, [autoPP, ppMode, ppList, ppCustom, tokens]);
  const initPP = ppMode === "list" ? ppList : ppCustom;

  const deferredScenario = useDeferredValue(scenario);
  const deferredPP = useDeferredValue(autoPP ? initPP : "");
  const output = useMemo(
    () => generateSweatbox(deferredScenario, waypoints, { initPseudoPilot: deferredPP }),
    [deferredScenario, waypoints, deferredPP],
  );

  const scnName = useMemo(
    () => buildExportName(tokens, "scenario"),
    [tokens.icao, tokens.version, tokens.config, tokens.configNum],
  );
  const tokensSet = !!(tokens.icao && tokens.version && tokens.config && tokens.configNum);

  const exportScn = async () => {
    try {
      const r = await saveTextFile(scnName, output, "scenario");
      if (r.saved) {
        const t = new Date().toTimeString().slice(0, 5);
        setShipped({ t });
        const le = { path: r.path || scnName, t };
        setLastExport(le);
        slots.setDeckPrefs({ lastExport: le });
        toast(`Shipped <b class="font-mono">${scnName}</b>`, "ok");
        return true;
      }
    } catch (e: any) {
      toast("Save failed: " + (e.message || e), "err");
    }
    return false;
  };

  // ---------- aircraft drawer ----------
  const saveAircraft = (ac: any) => {
    const list = scenario.aircraft.filter((a: any) => a.id !== ac.id);
    list.push(ac);
    setScenario({ ...scenario, aircraft: sortByStart(list) });
    setEditingAc(null);
    setFlashIds(new Set([ac.id]));
    toast(`Saved <b class="font-mono">${ac.callsign || "aircraft"}</b>`, "ok");
  };
  const deleteAircraft = (id: string) => {
    setScenario({ ...scenario, aircraft: scenario.aircraft.filter((a: any) => a.id !== id) });
    setEditingAc(null);
  };

  // ---------- deck derived state + guidance ----------
  const navLoaded = waypoints.length > 0;
  const acCount = scenario.aircraft.length;
  const ruleCount = (scenario.rules || []).length;
  const rating = scenario.rating || null;
  // One element breathes — a hint, never a gate.
  const breathe: string = !navLoaded
    ? "setup"
    : !acCount
      ? rating === "S1"
        ? "build"
        : "none" // ghost cards carry the guidance
      : !tokensSet
        ? "plate"
        : !shipped
          ? "export"
          : "none";

  const openTray = (id: TrayId, section?: string) => {
    setEditingAc(null);
    setRewindOpen(false);
    if (id === "setup") {
      // Navdata is the real prerequisite: SETUP lands there until it's loaded,
      // then skips straight to the scenario frame.
      if (section === "scenario" || section === "navdata") setSetupSection(section);
      else setSetupSection(navLoaded ? "scenario" : "navdata");
    }
    if (id === "build" && (section === "rules" || section === "manual" || section === "ground"))
      setBuildSection(section);
    setTray((cur) => (cur === id ? cur : id));
  };
  const openRuleFromBoard = (ruleId: string) => {
    setRulesFocusId(ruleId);
    openTray("build", "rules");
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editingAc) setEditingAc(null);
        else if (rewindOpen) setRewindOpen(false);
        else if (tray) setTray(null);
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        !(e.target as HTMLElement)?.closest?.("input,select,textarea")
      ) {
        if (e.key === "e") {
          e.preventDefault();
          document.getElementById("dk-export")?.click();
        }
        if (e.key === "r") {
          e.preventDefault();
          // The lever lives inside the TRAFFIC tray — run directly.
          runRules();
        }
        if (e.key === "n") {
          e.preventDefault();
          newSlot();
        }
        if (/^[1-9]$/.test(e.key)) {
          e.preventDefault();
          const list = slots.listSlots();
          const name = list[+e.key - 1];
          if (name) switchSlot(name);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- shared tray props ----------
  const trayProps = {
    scenario,
    onChange: setScenario,
    waypoints,
    airports,
    positions,
    runways,
    stars,
    copx,
    gates,
    pool,
    rampAgent,
    rampConfig,
    toast,
    snapshot,
    close: () => setTray(null),
  };

  const titleFile = tokensSet
    ? `${scnName}`
    : `${(scenario.name || "scenario").replace(/[^a-z0-9]+/gi, "_")}.txt`;

  return (
    <div className="h-screen flex flex-col bg-bg text-tx1 font-sans overflow-hidden">
      {/* ===== titlebar ===== */}
      <div className="h-[34px] flex-none flex items-center px-3.5 bg-panel border-b border-bd1 relative">
        <div className="flex gap-[7px]">
          <span className="w-[9px] h-[9px] rounded-full bg-dotbtn" />
          <span className="w-[9px] h-[9px] rounded-full bg-dotbtn" />
          <span className="w-[9px] h-[9px] rounded-full bg-dotbtn" />
        </div>
        <div className="absolute inset-x-0 text-center font-mono text-[11px] text-tx7 tracking-[0.04em] pointer-events-none flex items-center justify-center gap-2">
          <span>{titleFile} — Sweatbox Builder FLIGHTDECK</span>
          {rating && <span className="dk-rating pointer-events-none">{rating}</span>}
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </div>

      {/* ===== main grid ===== */}
      <div className="flex-1 grid grid-cols-[232px_minmax(0,1fr)_380px] min-h-0">
        <SlotRail
          slotList={slotList}
          active={slotName}
          activeScenario={scenario}
          airac={navAirac}
          onSwitch={switchSlot}
          onNew={newSlot}
          onRename={renameSlot}
          onClone={cloneSlot}
          onDelete={removeSlot}
          onImportBundle={importSlotBundle}
          trayOpen={!!tray}
          toast={toast}
        />

        {/* board zone hosts the trays + rewind strip */}
        <div className="relative flex flex-col min-w-0 min-h-0 bg-bg">
          <TrafficBoard
            ref={boardRef}
            scenario={scenario}
            onChange={setScenario}
            filter={boardFilter}
            setFilter={setBoardFilter}
            flashIds={flashIds}
            onEdit={setEditingAc}
            onOpenRule={openRuleFromBoard}
            onOpenTray={openTray}
            onSnapshot={snapshot}
            onRewind={() => {
              setTray(null);
              setRewindOpen((v) => !v);
            }}
            onAddAc={() => {
              setTray(null);
              setEditingAc("new");
            }}
            toast={toast}
          />
          {rewindOpen && <RewindStrip snaps={slots.listSnaps(slotName)} onRestore={rewindTo} />}
          <SetupTray
            open={tray === "setup"}
            section={setupSection}
            setSection={setSetupSection}
            {...trayProps}
            navMeta={navMeta}
            airac={navAirac}
            onSetAirac={setNavAirac}
            onApplyNavBundle={applyNavBundle}
            onParseSctData={(d: any) => {
              setWaypoints(d.waypoints);
              setAirports(d.airports);
              setRunways(d.runways);
              storage.set(KEYS.waypoints, d.waypoints);
              storage.set(KEYS.airports, d.airports);
              storage.set(KEYS.runways, d.runways);
              const m = { ...navMeta, sctAt: Date.now() };
              setNavMeta(m);
              storage.set(KEYS.navMeta, m);
            }}
            onParseEseData={(d: any) => {
              setPositions(d.positions);
              setStarsState(d.stars || []);
              setCopx(d.copx || []);
              setGates(d.gates || []);
              storage.set(KEYS.positions, d.positions);
              storage.set(KEYS.stars, d.stars || []);
              storage.set(KEYS.copx, d.copx || []);
              storage.set(KEYS.gates, d.gates || []);
              const m = { ...navMeta, eseAt: Date.now() };
              setNavMeta(m);
              storage.set(KEYS.navMeta, m);
            }}
            onResetSct={() => {
              setWaypoints([]);
              setAirports([]);
              setRunways([]);
              storage.del(KEYS.waypoints);
              storage.del(KEYS.airports);
              storage.del(KEYS.runways);
              const m = { ...navMeta, sctAt: null };
              setNavMeta(m);
              storage.set(KEYS.navMeta, m);
            }}
            onResetEse={() => {
              setPositions([]);
              setStarsState([]);
              setCopx([]);
              setGates([]);
              storage.del(KEYS.positions);
              storage.del(KEYS.stars);
              storage.del(KEYS.copx);
              storage.del(KEYS.gates);
              const m = { ...navMeta, eseAt: null };
              setNavMeta(m);
              storage.set(KEYS.navMeta, m);
            }}
            onLoadRampAgent={(p: any) => setRampAgent((prev: any) => ({ ...prev, [p.icao]: p }))}
            onLoadRampConfig={setRampConfigState}
            onResetRampAgent={() => {
              setRampAgent({});
              setRampConfigState(null);
            }}
          />
          <FplnPoolTray
            open={tray === "pool"}
            {...trayProps}
            simbriefCache={simbriefCache}
            setSimbriefCache={setSimbriefCache}
            vatsimCache={vatsimCache}
            setVatsimCache={setVatsimCache}
            onAddToPool={(items: any[], source: string) => {
              setPool((prev) => addToPool(prev, items, source));
            }}
            onDeleteFromPool={(ids: string[]) =>
              setPool((prev) => prev.filter((p) => !ids.includes(p.id)))
            }
            poolAirac={poolAirac}
            onSetPoolAirac={setPoolAirac}
            onImportPool={applyPoolBundle}
            onAddToBoard={(entries: any[]) => {
              const acs = entries.map((e) => poolToAc(e, false));
              const list = sortByStart([...scenario.aircraft, ...acs]);
              setScenario({ ...scenario, aircraft: list });
              setFlashIds(new Set(acs.map((a) => a.id)));
              setTray(null);
              toast(`${acs.length} aircraft → board`, "ok");
            }}
          />
          <BuildTray
            open={tray === "build"}
            section={buildSection}
            setSection={setBuildSection}
            {...trayProps}
            focusRuleId={rulesFocusId}
            clearFocus={() => setRulesFocusId(null)}
            rating={rating}
            onAddAc={() => {
              setTray(null);
              setEditingAc("new");
            }}
            onRunRules={runRules}
            estRuleAc={(scenario.rules || []).reduce(
              (s: number, r: any) =>
                s + (Math.floor((+r.duration || 0) / Math.max(1, 60 / (+r.rate || 1))) + 1 || 0),
              0,
            )}
            onGroundGenerated={(count: number) => {
              setTray(null);
              toast(`${count} ground aircraft spawned`, "ok");
            }}
          />
        </div>

        {/* output zone hosts the aircraft drawer */}
        <div className="relative flex flex-col min-h-0 bg-panel border-l border-bd1">
          <OutputPane output={output} navLoaded={navLoaded} shipped={shipped} />
          {editingAc && (
            <AircraftDrawer
              aircraft={editingAc}
              waypoints={waypoints}
              onSave={saveAircraft}
              onCancel={() => setEditingAc(null)}
              onDelete={deleteAircraft}
            />
          )}
        </div>
      </div>

      {/* ===== command dock ===== */}
      <CommandDock
        navLoaded={navLoaded}
        acCount={acCount}
        poolCount={pool.length}
        tokens={tokens}
        setTokens={setTokens}
        tokensSet={tokensSet}
        scnName={scnName}
        controllers={(scenario.controllers || []).filter((c: any) => c.callsign)}
        autoPP={autoPP}
        setAutoPP={setAutoPP}
        ppMode={ppMode}
        setPpMode={setPpMode}
        ppList={ppList}
        setPpList={setPpList}
        ppCustom={ppCustom}
        setPpCustom={setPpCustom}
        lastExport={lastExport}
        breathe={breathe}
        onOpenTray={openTray}
        onExport={exportScn}
        toast={toast}
      />

      <Toasts toasts={toasts} />
    </div>
  );
}
