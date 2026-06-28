// ScenarioPanel.tsx — scenario aircraft list (restyled to the design handoff:
// filter pills, column grid, role badges, zebra rows) + the per-aircraft editor.
// All behavior is unchanged from the rc3 port.
import { useState, useEffect, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { uid } from "../core/uid";
import { emptyAc } from "../core/model";
import { trimRoute } from "../core/route";
import { preEntryOffset } from "../core/geo";

const COLS = "grid grid-cols-[150px_80px_70px_1fr_130px_70px_70px] items-center";

function RoleBadge({ dep }: { dep: boolean }) {
  return dep ? (
    <span className="text-[10px] font-semibold text-dep bg-[rgb(111_158_239_/_0.12)] border border-[rgb(111_158_239_/_0.24)] rounded-[5px] px-[7px] py-0.5">
      DEP
    </span>
  ) : (
    <span className="text-[10px] font-semibold text-arr bg-[rgb(232_116_110_/_0.12)] border border-[rgb(232_116_110_/_0.24)] rounded-[5px] px-[7px] py-0.5">
      ARR
    </span>
  );
}

export function ScenarioPanel({ scenario, onChange, waypoints, pendingAircraft, onClearPending }: any) {
  const [editing, setEditing] = useState<any>(null);
  const [filter, setFilter] = useState<"all" | "arr" | "dep">("all");
  useEffect(() => {
    if (!pendingAircraft) return;
    if (Array.isArray(pendingAircraft)) {
      const list = [...scenario.aircraft, ...pendingAircraft].sort((a: any, b: any) => (+a.start || 0) - (+b.start || 0));
      onChange({ ...scenario, aircraft: list });
      onClearPending();
    } else {
      setEditing(pendingAircraft);
      onClearPending();
    }
  }, [pendingAircraft]);
  const save = (ac: any) => {
    const list = scenario.aircraft.filter((a: any) => a.id !== ac.id);
    list.push(ac);
    list.sort((a: any, b: any) => (+a.start || 0) - (+b.start || 0));
    onChange({ ...scenario, aircraft: list });
    setEditing(null);
  };
  const remove = (id: string) => onChange({ ...scenario, aircraft: scenario.aircraft.filter((a: any) => a.id !== id) });
  const dup = (a: any) => {
    const c = { ...a, id: uid(), callsign: a.callsign + "_2", ruleId: null, groundMeta: null };
    onChange({ ...scenario, aircraft: [...scenario.aircraft, c] });
  };
  const clearGen = () => {
    if (!confirm("Remove rule-generated aircraft?")) return;
    onChange({ ...scenario, aircraft: scenario.aircraft.filter((a: any) => !a.ruleId) });
  };
  const clearGround = () => {
    if (!confirm("Remove ground-generated aircraft?")) return;
    onChange({ ...scenario, aircraft: scenario.aircraft.filter((a: any) => !a.groundMeta) });
  };
  const genCount = scenario.aircraft.filter((a: any) => a.ruleId).length;
  const groundCount = scenario.aircraft.filter((a: any) => a.groundMeta).length;
  const arrCount = scenario.aircraft.filter((a: any) => !a.isDeparture).length;
  const depCount = scenario.aircraft.filter((a: any) => a.isDeparture).length;
  const rows = scenario.aircraft.filter((a: any) =>
    filter === "all" ? true : filter === "arr" ? !a.isDeparture : a.isDeparture,
  );

  const pill = (key: "all" | "arr" | "dep", label: string) => (
    <button
      onClick={() => setFilter(key)}
      className={`text-[11px] px-[11px] py-1 rounded-[14px] border ${
        filter === key
          ? "bg-cy-soft border-cy-bd text-cy-fg font-medium"
          : "bg-inset border-bd2 text-tx5 hover:text-tx3"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between px-[22px] pt-[18px] pb-[14px] flex-wrap gap-3">
        <div className="flex items-center gap-3.5">
          <span className="text-[14px] font-semibold text-tx1">Scenario Aircraft</span>
          <div className="flex gap-1.5">
            {pill("all", `All ${scenario.aircraft.length}`)}
            {pill("arr", `Arr ${arrCount}`)}
            {pill("dep", `Dep ${depCount}`)}
          </div>
          <span className="text-[11px] text-tx7">
            {genCount} rule · {groundCount} ground
          </span>
        </div>
        <div className="flex gap-2.5">
          {groundCount > 0 && (
            <button onClick={clearGround} className="text-[12px] text-tx3 bg-btn2 border border-bd4 hover:border-bdh rounded-[7px] px-3 py-2">
              Clear ground
            </button>
          )}
          {genCount > 0 && (
            <button onClick={clearGen} className="text-[12px] text-tx3 bg-btn2 border border-bd4 hover:border-bdh rounded-[7px] px-3 py-2">
              Clear rule-gen
            </button>
          )}
          <button
            onClick={() => setEditing(emptyAc(false))}
            className="flex items-center gap-[7px] text-[12px] font-medium text-arr bg-[rgb(232_116_110_/_0.1)] border border-[rgb(232_116_110_/_0.28)] hover:border-[rgb(232_116_110_/_0.45)] rounded-[7px] px-[13px] py-2"
          >
            <Icon name="plus" size={13} />
            Arrival
          </button>
          <button
            onClick={() => setEditing(emptyAc(true))}
            className="flex items-center gap-[7px] text-[12px] font-medium text-dep bg-[rgb(111_158_239_/_0.1)] border border-[rgb(111_158_239_/_0.28)] hover:border-[rgb(111_158_239_/_0.45)] rounded-[7px] px-[13px] py-2"
          >
            <Icon name="plus" size={13} />
            Departure
          </button>
        </div>
      </div>

      {/* header */}
      <div className={`${COLS} px-[22px] py-[11px] text-[9.5px] tracking-[0.1em] text-tx7 font-semibold border-y border-bd2`}>
        <span>CALLSIGN</span>
        <span>TYPE</span>
        <span>ROLE</span>
        <span>ROUTE</span>
        <span>SPAWN</span>
        <span className="text-right">START</span>
        <span />
      </div>

      {/* rows */}
      {rows.map((a: any, i: number) => (
        <div
          key={a.id}
          className={`${COLS} px-[22px] py-[11px] border-b border-rowdiv font-mono text-[12.5px] ${i % 2 === 1 ? "bg-inset" : ""}`}
        >
          <span className="text-tx1 font-semibold truncate">
            {a.callsign || "—"}
            {a.ruleId && <span className="text-cy-fg text-[9px] ml-1" title="rule-generated">●</span>}
            {a.groundMeta && <span className="text-am-fg text-[9px] ml-1" title="ground-generated">◆</span>}
          </span>
          <span className="text-tx3">{a.type || "—"}</span>
          <span>
            <RoleBadge dep={a.isDeparture} />
          </span>
          <span className="text-tx5 text-[11.5px] truncate">
            {a.origin || "?"} → {a.dest || "?"}
          </span>
          <span className="text-tx3 text-[11.5px] truncate">
            {a.spawnWaypoint || `${(+a.lat).toFixed(2)},${(+a.lon).toFixed(2)}`}
            {(+a.preEntryNm || 0) > 0 ? ` -${a.preEntryNm}` : ""}
          </span>
          <span className="text-right text-tx3">{a.start !== "" ? `T+${a.start}` : "—"}</span>
          <span className="flex gap-3 justify-end text-tx8">
            <button onClick={() => setEditing(a)} className="hover:text-cy-fg" title="Edit">
              <Icon name="edit" size={13} />
            </button>
            <button onClick={() => dup(a)} className="hover:text-tx2" title="Duplicate">
              <Icon name="copy" size={13} />
            </button>
            <button onClick={() => remove(a.id)} className="hover:text-rd-fg" title="Delete">
              <Icon name="trash" size={13} />
            </button>
          </span>
        </div>
      ))}
      {!rows.length && (
        <div className="px-[22px] py-12 text-center text-tx7 text-[13px]">
          {scenario.aircraft.length ? "No aircraft match this filter" : "No aircraft — use Generators or add manually"}
        </div>
      )}

      {editing && <AircraftEditor aircraft={editing} waypoints={waypoints} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function AircraftEditor({ aircraft, waypoints, onSave, onCancel }: any) {
  const [a, setA] = useState(aircraft);
  const [wptSearch, setWptSearch] = useState("");
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
  const off = useMemo(
    () => ((+a.preEntryNm || 0) > 0 && a.spawnWaypoint ? preEntryOffset(a.spawnWaypoint, a.simRoute, +a.preEntryNm, waypoints, a.fpRoute) : null),
    [a.preEntryNm, a.spawnWaypoint, a.simRoute, a.fpRoute, waypoints],
  );
  const lb = "block text-xs text-slate-400 mb-1";
  const ip = "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 font-mono focus:border-sky-500 focus:outline-none";
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto border border-slate-700">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-200">{aircraft.callsign ? `Edit ${aircraft.callsign}` : `New ${a.isDeparture ? "Departure" : "Arrival"}`}</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200"><Icon name="x" size={20} /></button>
        </div>
        <div className="p-5 space-y-5">
          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">Identity</h4>
            <div className="grid grid-cols-4 gap-3">
              <div><label className={lb}>Callsign</label><input className={ip} value={a.callsign} onChange={(e) => update("callsign", e.target.value.toUpperCase())} /></div>
              <div><label className={lb}>Type</label><input className={ip} value={a.type} onChange={(e) => update("type", e.target.value.toUpperCase())} placeholder="A320" /></div>
              <div><label className={lb}>Squawk</label><input className={ip} value={a.squawk} onChange={(e) => update("squawk", e.target.value)} /></div>
              <div><label className={lb}>Runway</label><input className={ip} value={a.runway} onChange={(e) => update("runway", e.target.value.toUpperCase())} /></div>
            </div>
          </section>
          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">Flight Plan</h4>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><label className={lb}>Origin</label><input className={ip} value={a.origin} onChange={(e) => update("origin", e.target.value.toUpperCase())} /></div>
              <div><label className={lb}>Destination</label><input className={ip} value={a.dest} onChange={(e) => update("dest", e.target.value.toUpperCase())} /></div>
              <div><label className={lb}>Cruise Alt (ft)</label><input type="number" className={ip} value={a.cruiseAlt} onChange={(e) => update("cruiseAlt", +e.target.value)} /></div>
            </div>
            <div><label className={lb}>FP Route</label><textarea className={`${ip} min-h-[60px]`} value={a.fpRoute} onChange={(e) => update("fpRoute", e.target.value)} /></div>
          </section>
          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">Spawn Position</h4>
            <div className="mb-3">
              <label className={lb}>Waypoint {a.spawnWaypoint && <span className="text-sky-400">· {a.spawnWaypoint}</span>}</label>
              <div className="relative">
                <input value={wptSearch} onChange={(e) => setWptSearch(e.target.value.toUpperCase())} placeholder="Type waypoint name..." className={ip} />
                {wptMatches.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-slate-800 border border-slate-700 rounded mt-1 z-10 max-h-48 overflow-auto">
                    {wptMatches.map((w: any) => (
                      <button key={`${w.type}-${w.name}`} onClick={() => pickSpawn(w)} className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-xs font-mono flex justify-between">
                        <span className="text-slate-200">{w.name}</span>
                        <span className="text-slate-500">{w.lat.toFixed(4)}, {w.lon.toFixed(4)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-3">
              <div><label className={lb}>Lat</label><input type="number" step="0.0000001" className={ip} value={a.lat} onChange={(e) => update("lat", +e.target.value)} /></div>
              <div><label className={lb}>Lon</label><input type="number" step="0.0000001" className={ip} value={a.lon} onChange={(e) => update("lon", +e.target.value)} /></div>
              <div><label className={lb}>Alt (ft)</label><input type="number" className={ip} value={a.alt} onChange={(e) => update("alt", +e.target.value)} /></div>
              <div><label className={lb}>GS</label><input type="number" className={ip} value={a.gs} onChange={(e) => update("gs", +e.target.value)} /></div>
              <div><label className={lb}>Start (min)</label><input type="number" step="0.1" className={ip} value={a.start} onChange={(e) => update("start", e.target.value === "" ? "" : +e.target.value)} placeholder="blank=T+0" /></div>
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase text-slate-500 font-semibold">Sim Route</h4>
              {a.spawnWaypoint && (
                <button onClick={() => setA((prev: any) => ({ ...prev, simRoute: trimRoute(a.simRoute, a.spawnWaypoint) }))} className="text-xs px-2 py-1 bg-sky-700 hover:bg-sky-600 rounded text-white">
                  Trim from {a.spawnWaypoint}
                </button>
              )}
            </div>
            <textarea className={`${ip} min-h-[60px]`} value={a.simRoute} onChange={(e) => update("simRoute", e.target.value)} />
          </section>
          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">Pre-entry Offset</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <label className="text-xs text-slate-400 w-24">Distance:</label>
                <input type="range" min="0" max="50" step="1" className="flex-1" value={a.preEntryNm || 0} onChange={(e) => update("preEntryNm", +e.target.value)} />
                <span className="w-16 text-right text-sm font-mono text-sky-300">{a.preEntryNm || 0} NM</span>
              </div>
              {off ? (
                <div className="text-xs font-mono text-sky-300 bg-sky-950/40 border border-sky-900 rounded p-2">
                  <div className="text-slate-400 mb-1">Computed ({a.preEntryNm} NM before {a.spawnWaypoint}):</div>
                  {off.lat.toFixed(5)}, {off.lon.toFixed(5)}
                </div>
              ) : (
                (+a.preEntryNm || 0) > 0 && <div className="text-xs text-amber-400">⚠ Cannot compute — need upstream waypoint in FP/sim route</div>
              )}
            </div>
          </section>
          <section>
            <h4 className="text-xs uppercase text-slate-500 font-semibold mb-2">Altitude Request</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lb}>At waypoint</label><input className={ip} value={a.reqAltWpt} onChange={(e) => update("reqAltWpt", e.target.value.toUpperCase())} /></div>
              <div><label className={lb}>Request altitude</label><input type="number" className={ip} value={a.reqAltVal} onChange={(e) => update("reqAltVal", e.target.value === "" ? "" : +e.target.value)} /></div>
            </div>
          </section>
        </div>
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-700 p-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200">Cancel</button>
          <button onClick={() => onSave(a)} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded text-sm text-white font-medium">Save</button>
        </div>
      </div>
    </div>
  );
}
