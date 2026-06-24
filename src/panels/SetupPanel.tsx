// SetupPanel.tsx — scenario name, ILS lines, holdings, controllers.
// Ported VERBATIM from the rc3 shell.
import { useState, useEffect, useMemo } from "react";
import { Icon } from "../ui/Icon";

export function SetupPanel({ scenario, onChange, positions, runways, waypoints }: any) {
  const set = (f: string, v: any) => onChange({ ...scenario, [f]: v });
  const setIls = (i: number, f: string, v: any) => {
    const a = [...scenario.ils];
    a[i] = { ...a[i], [f]: f === "name" ? v : +v };
    onChange({ ...scenario, ils: a });
  };
  const delIls = (i: number) => onChange({ ...scenario, ils: scenario.ils.filter((_: any, j: number) => j !== i) });
  const setCtrl = (i: number, f: string, v: any) => {
    const a = [...scenario.controllers];
    a[i] = { ...a[i], [f]: v };
    onChange({ ...scenario, controllers: a });
  };
  const addCtrl = () => onChange({ ...scenario, controllers: [...scenario.controllers, { callsign: "", freq: "" }] });
  const delCtrl = (i: number) => onChange({ ...scenario, controllers: scenario.controllers.filter((_: any, j: number) => j !== i) });

  const holdings = scenario.holdings || [];
  const setHold = (i: number, f: string, v: any) => {
    const a = [...holdings];
    a[i] = { ...a[i], [f]: v };
    onChange({ ...scenario, holdings: a });
  };
  const addHold = () => onChange({ ...scenario, holdings: [...holdings, { fix: "", inboundCourse: 0, turn: "R" }] });
  const delHold = (i: number) => onChange({ ...scenario, holdings: holdings.filter((_: any, j: number) => j !== i) });

  const [ilsApt, setIlsApt] = useState("");
  const [ilsRwy, setIlsRwy] = useState("");
  const [ilsName, setIlsName] = useState("");
  const rwyAirports = useMemo(() => [...new Set((runways || []).map((r: any) => r.airport))].sort(), [runways]);
  const rwyList = useMemo(() => {
    if (!ilsApt) return [];
    const out: any[] = [];
    for (const r of (runways || []).filter((r: any) => r.airport === ilsApt)) {
      out.push({ key: `${r.airport}|${r.ident1}`, ident: r.ident1 });
      out.push({ key: `${r.airport}|${r.ident2}`, ident: r.ident2 });
    }
    return out;
  }, [runways, ilsApt]);
  useEffect(() => {
    if (!ilsRwy) {
      setIlsName("");
      return;
    }
    const [, id] = ilsRwy.split("|");
    setIlsName(id);
  }, [ilsRwy]);
  function addIlsFromRwy() {
    if (!ilsRwy || !ilsName.trim()) return;
    const [apt, id] = ilsRwy.split("|");
    const rwy = (runways || []).find((r: any) => r.airport === apt && (r.ident1 === id || r.ident2 === id));
    if (!rwy) return;
    let la1, lo1, la2, lo2;
    if (rwy.ident1 === id) {
      la1 = rwy.lat1;
      lo1 = rwy.lon1;
      la2 = rwy.lat2;
      lo2 = rwy.lon2;
    } else {
      la1 = rwy.lat2;
      lo1 = rwy.lon2;
      la2 = rwy.lat1;
      lo2 = rwy.lon1;
    }
    onChange({ ...scenario, ils: [...scenario.ils, { name: ilsName.trim(), lat1: la1, lon1: lo1, lat2: la2, lon2: lo2 }] });
    setIlsRwy("");
    setIlsName("");
  }

  const ip = "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 font-mono";

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Scenario Name</label>
          <input value={scenario.name} onChange={(e) => set("name", e.target.value)} className={ip} />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Airport Altitude (ft)</label>
          <input type="number" value={scenario.airportAlt} onChange={(e) => set("airportAlt", +e.target.value)} step="0.1" className={ip} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">ILS Lines</h2>
          <button onClick={() => onChange({ ...scenario, ils: [...scenario.ils, { name: "", lat1: 0, lon1: 0, lat2: 0, lon2: 0 }] })} className="flex items-center gap-1 px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200">
            <Icon name="plus" size={14} />
            Add blank
          </button>
        </div>
        {(runways || []).length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-2">
            <h4 className="text-xs font-semibold text-slate-400 uppercase">Auto-add from runways</h4>
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-3">
                <select value={ilsApt} onChange={(e) => { setIlsApt(e.target.value); setIlsRwy(""); }} className={ip}>
                  <option value="">— airport —</option>
                  {rwyAirports.map((a: any) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <select value={ilsRwy} onChange={(e) => setIlsRwy(e.target.value)} disabled={!ilsApt} className={`${ip} disabled:opacity-50`}>
                  <option value="">— runway —</option>
                  {rwyList.map((o: any) => (
                    <option key={o.key} value={o.key}>{o.ident}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <input value={ilsName} onChange={(e) => setIlsName(e.target.value)} placeholder="26L" className={ip} />
              </div>
              <div className="col-span-2">
                <button onClick={addIlsFromRwy} disabled={!ilsRwy || !ilsName.trim()} className="w-full px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 rounded text-sm text-white">
                  Add ILS
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-2">
          {scenario.ils.map((ils: any, i: number) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-900 p-2 rounded">
              <input value={ils.name} onChange={(e) => setIls(i, "name", e.target.value)} placeholder="26L" className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono" />
              <input type="number" step="0.0000001" value={ils.lat1} onChange={(e) => setIls(i, "lat1", e.target.value)} className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono" />
              <input type="number" step="0.0000001" value={ils.lon1} onChange={(e) => setIls(i, "lon1", e.target.value)} className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono" />
              <input type="number" step="0.0000001" value={ils.lat2} onChange={(e) => setIls(i, "lat2", e.target.value)} className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono" />
              <input type="number" step="0.0000001" value={ils.lon2} onChange={(e) => setIls(i, "lon2", e.target.value)} className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono" />
              <button onClick={() => delIls(i)} className="text-rose-400 hover:text-rose-300">
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <Icon name="rotate" size={18} />
            Holding Patterns
          </h2>
          <button onClick={addHold} className="flex items-center gap-1 px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200">
            <Icon name="plus" size={14} />
            Add holding
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Published holds over a fix. Outputs <code className="text-sky-400">HOLDING:&lt;fix&gt;:&lt;inbound&gt;:&lt;-1|1&gt;</code> in the scenario file (−1 = left, 1 = right).
        </p>
        {holdings.length > 0 && (
          <div className="grid grid-cols-12 gap-2 px-2 text-xs text-slate-500 uppercase font-semibold">
            <div className="col-span-3">Fix</div>
            <div className="col-span-2">Inbnd °</div>
            <div className="col-span-2">Turn</div>
            <div className="col-span-4">Preview</div>
            <div className="col-span-1" />
          </div>
        )}
        <div className="space-y-2">
          {holdings.map((h: any, i: number) => {
            const preview = h.fix ? `HOLDING:${h.fix}:${h.inboundCourse || 0}:${h.turn === "L" ? -1 : 1}` : "—";
            const fixExists = h.fix && (waypoints || []).some((w: any) => w.name === h.fix.toUpperCase());
            return (
              <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-900 p-2 rounded">
                <input
                  value={h.fix || ""}
                  onChange={(e) => setHold(i, "fix", e.target.value.toUpperCase())}
                  placeholder="OKABO"
                  className={`col-span-3 bg-slate-950 border ${h.fix && !fixExists ? "border-amber-700" : "border-slate-700"} rounded px-2 py-1 text-xs text-slate-200 font-mono`}
                  title={h.fix && !fixExists ? "Fix not found in current navdata" : ""}
                />
                <input type="number" min="0" max="359" value={h.inboundCourse ?? 0} onChange={(e) => setHold(i, "inboundCourse", +e.target.value)} className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono" />
                <select value={h.turn || "R"} onChange={(e) => setHold(i, "turn", e.target.value)} className="col-span-2 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono">
                  <option value="R">Right</option>
                  <option value="L">Left</option>
                </select>
                <span className="col-span-4 text-xs text-slate-500 font-mono truncate" title={preview}>{preview}</span>
                <button onClick={() => delHold(i)} className="col-span-1 text-rose-400 hover:text-rose-300 flex justify-center">
                  <Icon name="trash" size={14} />
                </button>
              </div>
            );
          })}
          {!holdings.length && (
            <p className="text-xs text-slate-500 italic px-2">
              No holdings defined. Click <strong>Add holding</strong> above to define one.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">Controllers</h2>
          <button onClick={addCtrl} className="flex items-center gap-1 px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200">
            <Icon name="plus" size={14} />
            Add
          </button>
        </div>
        <div className="space-y-2">
          {scenario.controllers.map((c: any, i: number) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-900 p-2 rounded">
              {positions.length > 0 ? (
                <select
                  value={c.callsign && c.freq ? `${c.callsign}|${c.freq}` : ""}
                  onChange={(e) => {
                    if (!e.target.value) {
                      const a = [...scenario.controllers];
                      a[i] = { callsign: "", freq: "" };
                      onChange({ ...scenario, controllers: a });
                      return;
                    }
                    const [cs, fr] = e.target.value.split("|");
                    const p = positions.find((x: any) => x.callsign === cs && x.freq === fr);
                    if (!p) return;
                    const a = [...scenario.controllers];
                    a[i] = { callsign: p.callsign, freq: p.freq };
                    onChange({ ...scenario, controllers: a });
                  }}
                  className="col-span-5 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 font-mono"
                >
                  <option value="">— pick —</option>
                  {positions.map((p: any) => (
                    <option key={p.callsign + p.freq} value={`${p.callsign}|${p.freq}`}>
                      {p.callsign} · {p.freq}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={c.callsign} onChange={(e) => setCtrl(i, "callsign", e.target.value)} placeholder="LFPG_TWR" className="col-span-5 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 font-mono" />
              )}
              <input value={c.freq} onChange={(e) => setCtrl(i, "freq", e.target.value)} placeholder="119.250" className="col-span-5 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 font-mono" />
              <button onClick={() => delCtrl(i)} className="col-span-2 text-rose-400 hover:text-rose-300 flex justify-center">
                <Icon name="trash" size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
