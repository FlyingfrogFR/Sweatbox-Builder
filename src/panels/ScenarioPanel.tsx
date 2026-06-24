// ScenarioPanel.tsx — scenario aircraft list + the per-aircraft editor.
// Ported VERBATIM from the rc3 shell (ScenarioAircraftPanel + AircraftEditor).
import { useState, useEffect, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { uid } from "../core/uid";
import { emptyAc } from "../core/model";
import { trimRoute } from "../core/route";
import { preEntryOffset } from "../core/geo";

export function ScenarioPanel({ scenario, onChange, waypoints, pendingAircraft, onClearPending }: any) {
  const [editing, setEditing] = useState<any>(null);
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
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-slate-200">
          Scenario Aircraft{" "}
          <span className="text-slate-500 text-sm font-normal">({scenario.aircraft.length} · {genCount} rule · {groundCount} ground)</span>
        </h2>
        <div className="flex gap-2">
          {groundCount > 0 && <button onClick={clearGround} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200">Clear ground</button>}
          {genCount > 0 && <button onClick={clearGen} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200">Clear rule-generated</button>}
          <button onClick={() => setEditing(emptyAc(false))} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm text-white">
            <Icon name="landing" />Arrival
          </button>
          <button onClick={() => setEditing(emptyAc(true))} className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded text-sm text-white">
            <Icon name="takeoff" />Departure
          </button>
        </div>
      </div>
      <div className="bg-slate-900 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Callsign</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Route</th>
              <th className="text-left p-3">Spawn</th>
              <th className="text-right p-3">Start</th>
              <th className="text-right p-3"></th>
            </tr>
          </thead>
          <tbody>
            {scenario.aircraft.map((a: any) => (
              <tr key={a.id} className={`border-t border-slate-800 hover:bg-slate-800/30 ${a.ruleId || a.groundMeta ? "opacity-90" : ""}`}>
                <td className="p-3 font-mono font-semibold text-slate-200">
                  {a.callsign || "—"}
                  {a.ruleId && <span className="text-sky-500 ml-1 text-xs" title="rule-generated">●</span>}
                  {a.groundMeta && <span className="text-amber-500 ml-1 text-xs" title={`${a.groundMeta.source}-generated`}>◆</span>}
                </td>
                <td className="p-3 font-mono text-slate-300">{a.type || "—"}</td>
                <td className="p-3">
                  {a.isDeparture ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-900/40 text-amber-300 rounded text-xs">
                      <Icon name="takeoff" size={12} />DEP
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-900/40 text-emerald-300 rounded text-xs">
                      <Icon name="landing" size={12} />ARR
                    </span>
                  )}
                </td>
                <td className="p-3 font-mono text-xs text-slate-400">{a.origin || "?"}→{a.dest || "?"}</td>
                <td className="p-3 font-mono text-xs text-slate-400">
                  {a.spawnWaypoint || `${(+a.lat).toFixed(3)},${(+a.lon).toFixed(3)}`}
                  {(+a.preEntryNm || 0) > 0 ? ` -${a.preEntryNm}nm` : ""}
                </td>
                <td className="p-3 text-right text-slate-400">{a.start !== "" ? `T+${a.start}` : "—"}</td>
                <td className="p-3 text-right">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditing(a)} className="text-sky-400 hover:text-sky-300"><Icon name="edit" size={14} /></button>
                    <button onClick={() => dup(a)} className="text-slate-400 hover:text-slate-200"><Icon name="copy" size={14} /></button>
                    <button onClick={() => remove(a.id)} className="text-rose-400 hover:text-rose-300"><Icon name="trash" size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {!scenario.aircraft.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">No aircraft — use Generators or add manually</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
