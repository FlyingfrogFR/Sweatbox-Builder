// AircraftDrawer.tsx — the per-aircraft editor, a drawer sliding over the
// output pane (the shell mounts it only while an aircraft is being edited).
// Field set and behavior are ported 1:1 from the classic AircraftEditor in
// src/panels/ScenarioPanel.tsx — including the waypoint autocomplete and the
// memoized waypoint-Map pre-entry offset preview — restyled to deck physics.
// "new" starts from emptyAc(false); the ARR/DEP latch pair flips isDeparture.
import { useEffect, useMemo, useRef, useState } from "react";
import { emptyAc } from "../core/model";
import { trimRoute } from "../core/route";
import { preEntryOffset } from "../core/geo";
import { DeckKey, Latch, HoldKey } from "./ui";

const LB = "block text-[9.5px] tracking-wide text-tx7 uppercase font-bold mb-1 select-none";
const IP =
  "w-full bg-inset border border-bd3 rounded-md px-2 py-[5px] font-mono text-[12.5px] text-tx1 focus:border-cy-fg focus:outline-none";

function SectionLabel({ children }: any) {
  return <div className="text-[9.5px] font-extrabold tracking-[0.12em] text-tx6 uppercase select-none">{children}</div>;
}

export function AircraftDrawer({ aircraft, waypoints, onSave, onCancel, onDelete }: any) {
  const isNew = aircraft === "new";
  const [a, setA] = useState<any>(() => (isNew ? emptyAc(false) : { ...aircraft }));
  const [wptSearch, setWptSearch] = useState("");
  const [open, setOpen] = useState(false);
  const csRef = useRef<HTMLInputElement>(null);

  // Slide in after mount, then land focus on the callsign field.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    const t = setTimeout(() => csRef.current?.focus(), 180);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);

  // The shell keeps one drawer mounted — reload state when the target changes.
  useEffect(() => {
    setA(aircraft === "new" ? emptyAc(false) : { ...aircraft });
    setWptSearch("");
  }, [aircraft]);

  const update = (f: string, v: any) => setA((prev: any) => ({ ...prev, [f]: v }));
  const pickSpawn = (w: any) => {
    setA((prev: any) => ({ ...prev, lat: w.lat, lon: w.lon, spawnWaypoint: w.name }));
    setWptSearch("");
  };
  const wptMatches = useMemo(() => {
    if (!wptSearch.trim()) return [];
    const f = wptSearch.trim().toUpperCase();
    return waypoints.filter((w: any) => w.name.startsWith(f)).slice(0, 10);
  }, [wptSearch, waypoints]);
  // name -> waypoint map for the offset PREVIEW only (first occurrence wins,
  // matching Array.find); what gets saved into the aircraft is untouched.
  const wptByName = useMemo(() => {
    const m = new Map<string, any>();
    for (const w of waypoints) if (!m.has(w.name)) m.set(w.name, w);
    return m;
  }, [waypoints]);
  const off = useMemo(() => {
    if (!((+a.preEntryNm || 0) > 0 && a.spawnWaypoint)) return null;
    // Resolve just the names the offset math can touch (spawn + route tokens,
    // tokenized like preEntryOffset) so slider ticks skip full-list scans.
    const names = new Set<string>([a.spawnWaypoint]);
    for (const route of [a.simRoute, a.fpRoute])
      for (const t of String(route || "").trim().split(/\s+/))
        if (t) names.add(t.split("/")[0].toUpperCase());
    const subset: any[] = [];
    for (const n of names) {
      const w = wptByName.get(n);
      if (w && !subset.includes(w)) subset.push(w);
    }
    return preEntryOffset(a.spawnWaypoint, a.simRoute, +a.preEntryNm, subset, a.fpRoute);
  }, [a.preEntryNm, a.spawnWaypoint, a.simRoute, a.fpRoute, wptByName]);

  const doSave = () => {
    if (!String(a.callsign || "").trim()) {
      const el = csRef.current;
      if (el) {
        el.focus();
        el.style.borderColor = "rgb(var(--rd-fg))";
        setTimeout(() => {
          el.style.borderColor = "";
        }, 800);
      }
      return;
    }
    onSave(a);
  };

  const title = !isNew && aircraft.callsign ? `EDIT ${aircraft.callsign}` : "NEW AIRCRAFT";

  return (
    <div
      className={`dk-drawer ${open ? "dk-open" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          doSave();
        }
      }}
    >
      {/* ===== header ===== */}
      <div className="flex-none flex items-center gap-2.5 px-4 py-2.5 border-b border-bd1 bg-inset">
        <span className="text-[11px] font-extrabold tracking-[0.12em] text-tx6 truncate">{title}</span>
        <span className="flex-1" />
        <DeckKey size="sm" onClick={onCancel}>
          CANCEL
        </DeckKey>
      </div>

      {/* ===== body ===== */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3.5 py-3 flex flex-col gap-3.5">
        {/* --- identity --- */}
        <SectionLabel>Identity</SectionLabel>
        <div className="flex gap-2.5 items-end">
          <div className="flex-1">
            <label className={LB}>Callsign</label>
            <input
              ref={csRef}
              className={IP}
              value={a.callsign}
              onChange={(e) => update("callsign", e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className={LB}>Role</label>
            <div className="flex gap-1.5 items-center h-[30px]">
              <Latch
                on={!a.isDeparture}
                onClick={() => update("isDeparture", false)}
                className={!a.isDeparture ? "!text-arr" : ""}
                title="Arrival"
              >
                ARR
              </Latch>
              <Latch
                on={!!a.isDeparture}
                onClick={() => update("isDeparture", true)}
                className={a.isDeparture ? "!text-dep" : ""}
                title="Departure"
              >
                DEP
              </Latch>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className={LB}>Type</label>
            <input className={IP} value={a.type} onChange={(e) => update("type", e.target.value.toUpperCase())} placeholder="A320" />
          </div>
          <div>
            <label className={LB}>Squawk</label>
            <input className={IP} value={a.squawk} onChange={(e) => update("squawk", e.target.value)} />
          </div>
          <div>
            <label className={LB}>Runway</label>
            <input className={IP} value={a.runway} onChange={(e) => update("runway", e.target.value.toUpperCase())} />
          </div>
        </div>

        {/* --- flight plan --- */}
        <SectionLabel>Flight Plan</SectionLabel>
        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className={LB}>Origin</label>
            <input className={IP} value={a.origin} onChange={(e) => update("origin", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className={LB}>Destination</label>
            <input className={IP} value={a.dest} onChange={(e) => update("dest", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className={LB}>Cruise Alt (ft)</label>
            <input type="number" className={IP} value={a.cruiseAlt} onChange={(e) => update("cruiseAlt", +e.target.value)} />
          </div>
        </div>
        <div>
          <label className={LB}>FP Route</label>
          <textarea className={`${IP} min-h-[56px]`} value={a.fpRoute} onChange={(e) => update("fpRoute", e.target.value)} />
        </div>

        {/* --- spawn position --- */}
        <SectionLabel>Spawn Position</SectionLabel>
        <div>
          <label className={LB}>
            Waypoint {a.spawnWaypoint && <span className="text-cy-fg">· {a.spawnWaypoint}</span>}
          </label>
          <div className="relative">
            <input
              value={wptSearch}
              onChange={(e) => setWptSearch(e.target.value.toUpperCase())}
              placeholder="Type waypoint name..."
              className={IP}
            />
            {wptMatches.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-btn2 border border-bd4 rounded-md mt-1 z-10 max-h-48 overflow-auto shadow-[0_10px_26px_rgb(0_0_0_/_0.35)]">
                {wptMatches.map((w: any) => (
                  <button
                    key={`${w.type}-${w.name}`}
                    onClick={() => pickSpawn(w)}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-cy-fg/10 text-[11px] font-mono flex justify-between gap-2"
                  >
                    <span className="text-tx1">{w.name}</span>
                    <span className="text-tx7">
                      {w.lat.toFixed(4)}, {w.lon.toFixed(4)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={LB}>Lat</label>
            <input type="number" step="0.0000001" className={IP} value={a.lat} onChange={(e) => update("lat", +e.target.value)} />
          </div>
          <div>
            <label className={LB}>Lon</label>
            <input type="number" step="0.0000001" className={IP} value={a.lon} onChange={(e) => update("lon", +e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className={LB}>Alt (ft)</label>
            <input type="number" className={IP} value={a.alt} onChange={(e) => update("alt", +e.target.value)} />
          </div>
          <div>
            <label className={LB}>GS</label>
            <input type="number" className={IP} value={a.gs} onChange={(e) => update("gs", +e.target.value)} />
          </div>
          <div>
            <label className={LB}>Start (min)</label>
            <input
              type="number"
              step="0.1"
              className={IP}
              value={a.start}
              onChange={(e) => update("start", e.target.value === "" ? "" : +e.target.value)}
              placeholder="blank=T+0"
            />
          </div>
        </div>

        {/* --- sim route --- */}
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Sim Route</SectionLabel>
          {a.spawnWaypoint && (
            <DeckKey
              size="sm"
              title={`Drop everything before ${a.spawnWaypoint}`}
              onClick={() => setA((prev: any) => ({ ...prev, simRoute: trimRoute(a.simRoute, a.spawnWaypoint) }))}
            >
              TRIM FROM {a.spawnWaypoint}
            </DeckKey>
          )}
        </div>
        <textarea className={`${IP} min-h-[56px]`} value={a.simRoute} onChange={(e) => update("simRoute", e.target.value)} />

        {/* --- pre-entry offset --- */}
        <SectionLabel>Pre-entry Offset</SectionLabel>
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            className="flex-1"
            value={a.preEntryNm || 1}
            onChange={(e) => update("preEntryNm", +e.target.value)}
          />
          <span className="w-14 text-right font-mono text-[12.5px] text-cy-fg">{a.preEntryNm || 1} NM</span>
        </div>
        {off ? (
          <div className="font-mono text-[11px] text-cy-fg bg-inset border border-cy-bd/50 rounded-md px-2.5 py-1.5">
            <div className="text-[9.5px] tracking-wide text-tx7 uppercase mb-0.5">
              Computed ({a.preEntryNm} NM before {a.spawnWaypoint})
            </div>
            {off.lat.toFixed(5)}, {off.lon.toFixed(5)}
          </div>
        ) : (
          (+a.preEntryNm || 0) > 0 && (
            <div className="text-[10.5px] text-am-fg">⚠ Cannot compute — need upstream waypoint in FP/sim route</div>
          )
        )}

        {/* --- altitude request --- */}
        <SectionLabel>Altitude Request</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={LB}>At waypoint</label>
            <input className={IP} value={a.reqAltWpt} onChange={(e) => update("reqAltWpt", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className={LB}>Request altitude</label>
            <input
              type="number"
              className={IP}
              value={a.reqAltVal}
              onChange={(e) => update("reqAltVal", e.target.value === "" ? "" : +e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ===== footer ===== */}
      <div className="flex-none flex items-center gap-2.5 px-4 py-2.5 border-t border-bd1 bg-inset">
        {!isNew && (
          <HoldKey onHold={() => onDelete(a.id)} className="!text-rd-fg" title="Hold to delete this aircraft">
            DELETE
          </HoldKey>
        )}
        <span className="flex-1" />
        <DeckKey variant="primary" onClick={doSave}>
          SAVE
        </DeckKey>
      </div>
    </div>
  );
}
