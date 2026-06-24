// NavdataPanel.tsx — .sct / .ese / RampAgent parsing + navdata tables and the
// navdata bundle import/export. Ported VERBATIM from the rc3 shell.
import { useState, useEffect, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { parseSectorFile } from "../parsers/sct";
import { parseESE } from "../parsers/ese";
import { parseRampAgent } from "../core/ramp";
import { downloadJsonBundle, readJsonFile, readTextFile } from "../io/bundles";

export function NavdataPanel({
  waypoints,
  airports,
  positions,
  runways,
  stars,
  copx,
  gates,
  navMeta,
  airac,
  onSetAirac,
  onParseSct,
  onParseEse,
  onResetSct,
  onResetEse,
  onImportBundle,
  rampAgent,
  rampConfig,
  onLoadRampAgent,
  onLoadRampConfig,
  onResetRampAgent,
}: any) {
  const [sctText, setSctText] = useState("");
  const [eseText, setEseText] = useState("");
  const [filter, setFilter] = useState("");
  const [gateFilter, setGateFilter] = useState("");
  const [status, setStatus] = useState("");
  const [airacInput, setAiracInput] = useState(airac || "");
  useEffect(() => setAiracInput(airac || ""), [airac]);
  const filtered = useMemo(() => {
    const f = filter.trim().toUpperCase();
    return f ? waypoints.filter((w: any) => w.name.includes(f)).slice(0, 200) : waypoints.slice(0, 200);
  }, [waypoints, filter]);
  const filteredGates = useMemo(() => {
    const f = gateFilter.trim().toUpperCase();
    return f
      ? gates.filter((g: any) => g.icao.includes(f) || g.label.toUpperCase().includes(f)).slice(0, 200)
      : gates.slice(0, 200);
  }, [gates, gateFilter]);
  const fmtTs = (ts: number) => (ts ? new Date(ts).toLocaleString() : null);
  const rampAirports = Object.keys(rampAgent || {}).sort();

  async function handleFileUpload(e: any, kind: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const text = await readTextFile(file);
      if (!text.trim()) {
        setStatus(`${file.name} is empty`);
        return;
      }
      if (kind === "sct") {
        const r = parseSectorFile(text);
        if (!r.waypoints.length && !r.airports.length && !r.runways.length) {
          setStatus(`Parsed ${file.name} but found nothing — is this a valid .sct file?`);
          return;
        }
        onParseSct(r);
        setStatus(`Loaded ${file.name}: ${r.waypoints.length} wpts, ${r.airports.length} apt, ${r.runways.length} rwy`);
      } else {
        const r = parseESE(text);
        onParseEse(r);
        setStatus(`Loaded ${file.name}: ${r.positions.length} positions · ${r.stars.length} STARs · ${r.copx.length} COPX · ${r.gates.length} gates`);
      }
    } catch (err: any) {
      setStatus(`Failed to parse ${file.name}: ${err.message || err}`);
    }
  }

  function exportBundle() {
    downloadJsonBundle("navdata.json", {
      kind: "sweatbox-navdata",
      version: 1,
      airac: airac || "",
      exportedAt: new Date().toISOString(),
      navMeta,
      waypoints,
      airports,
      positions,
      runways,
      stars,
      copx,
      gates,
    });
    setStatus("Exported navdata.json");
  }

  async function handleRampUpload(e: any) {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;
    e.target.value = "";
    let airportCount = 0,
      configCount = 0,
      failCount = 0;
    await Promise.all(
      files.map(async (file) => {
        try {
          const json = await readJsonFile(file);
          const parsed = parseRampAgent(json);
          if (parsed.kind === "config") {
            onLoadRampConfig(parsed);
            configCount++;
          } else {
            onLoadRampAgent(parsed);
            airportCount++;
          }
        } catch (err) {
          failCount++;
        }
      }),
    );
    const parts = [];
    if (airportCount) parts.push(`${airportCount} airport${airportCount !== 1 ? "s" : ""}`);
    if (configCount) parts.push(`config.json`);
    if (failCount) parts.push(`${failCount} failed`);
    setStatus("Loaded: " + (parts.join(" · ") || "nothing"));
  }

  async function importBundle(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const bundle = await readJsonFile(file);
      if (bundle.kind !== "sweatbox-navdata") throw new Error("Not a navdata bundle");
      onImportBundle(bundle);
      setStatus(`Imported ${file.name}${bundle.airac ? ` (AIRAC ${bundle.airac})` : ""}`);
    } catch (err: any) {
      setStatus("Import failed: " + (err.message || err));
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-semibold uppercase">AIRAC</label>
          <input value={airacInput} onChange={(e) => setAiracInput(e.target.value)} onBlur={() => onSetAirac(airacInput.trim())} onKeyDown={(e: any) => { if (e.key === "Enter") e.target.blur(); }} placeholder="2511" className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 font-mono" />
          <span className="text-xs text-slate-500">tag this navdata</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button onClick={exportBundle} disabled={!waypoints.length && !positions.length} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 rounded text-xs text-slate-200">
            <Icon name="download" size={12} />Export navdata.json
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 hover:bg-sky-600 rounded text-xs text-white cursor-pointer">
            <Icon name="upload" size={12} />Import bundle
            <input type="file" accept=".json,application/json" onChange={importBundle} className="hidden" />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-200">Sector File (.sct)</h2>
              {waypoints.length > 0 ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-emerald-400">
                    <Icon name="check" size={12} className="inline" /> {waypoints.length} wpts
                  </span>
                  <button onClick={onResetSct} className="text-xs text-rose-400 underline">Clear</button>
                </div>
              ) : (
                <span className="text-xs text-slate-500">FIXES, VOR, NDB, AIRPORT, RUNWAY</span>
              )}
            </div>
            {navMeta?.sctAt && <p className="text-xs text-slate-500 mb-1">Parsed {fmtTs(navMeta.sctAt)}</p>}
            <div className="flex gap-2 mb-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-xs text-white cursor-pointer">
                <Icon name="upload" size={12} />Upload .sct file
                <input type="file" accept=".sct,.txt,text/plain" onChange={(e) => handleFileUpload(e, "sct")} className="hidden" />
              </label>
              <span className="text-xs text-slate-500 self-center">or paste below</span>
            </div>
            <textarea value={sctText} onChange={(e) => setSctText(e.target.value)} placeholder="[FIXES]&#10;MOPIL N050.13.53.000 E004.07.49.000" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300 focus:border-sky-500 focus:outline-none h-36" />
            <button onClick={() => { if (!sctText.trim()) { setStatus("Paste .sct first"); return; } const r = parseSectorFile(sctText); onParseSct(r); setStatus(`${r.waypoints.length} wpts, ${r.airports.length} apt, ${r.runways.length} rwy`); setSctText(""); }} className="mt-2 flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded text-sm">
              <Icon name="upload" />Parse pasted .sct
            </button>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-200">ESE File (.ese)</h2>
              {positions.length > 0 ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-emerald-400">
                    <Icon name="check" size={12} className="inline" /> {positions.length} pos · {stars.length} STARs · {copx.length} COPX · {gates.length} gates
                  </span>
                  <button onClick={onResetEse} className="text-xs text-rose-400 underline">Clear</button>
                </div>
              ) : (
                <span className="text-xs text-slate-500">[POSITIONS] [SIDSSTARS] [COPX] [FREETEXT]</span>
              )}
            </div>
            {navMeta?.eseAt && <p className="text-xs text-slate-500 mb-1">Parsed {fmtTs(navMeta.eseAt)}</p>}
            <div className="flex gap-2 mb-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-xs text-white cursor-pointer">
                <Icon name="upload" size={12} />Upload .ese file
                <input type="file" accept=".ese,.txt,text/plain" onChange={(e) => handleFileUpload(e, "ese")} className="hidden" />
              </label>
              <span className="text-xs text-slate-500 self-center">or paste below</span>
            </div>
            <textarea value={eseText} onChange={(e) => setEseText(e.target.value)} placeholder="[POSITIONS]&#10;LFPG_TWR:..." className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300 focus:border-sky-500 focus:outline-none h-28" />
            <button onClick={() => { if (!eseText.trim()) { setStatus("Paste .ese first"); return; } const r = parseESE(eseText); onParseEse(r); setStatus(`${r.positions.length} positions · ${r.stars.length} STARs · ${r.copx.length} COPX · ${r.gates.length} gates`); setEseText(""); }} className="mt-2 flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded text-sm">
              <Icon name="upload" />Parse pasted .ese
            </button>
          </div>
          {status && <div className="text-xs text-emerald-400">{status}</div>}
        </div>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-200">Waypoints</h2>
              <span className="text-xs text-slate-500">{waypoints.length} · {airports.length} apt · {runways.length} rwy</span>
            </div>
            <div className="relative mb-2">
              <div className="absolute left-3 top-2.5 text-slate-500"><Icon name="search" size={14} /></div>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter..." className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-300" />
            </div>
            <div className="bg-slate-950 border border-slate-700 rounded-lg h-44 overflow-auto">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-slate-900 text-slate-400">
                  <tr>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Lat</th>
                    <th className="text-right p-2">Lon</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w: any) => (
                    <tr key={`${w.type}-${w.name}`} className="border-t border-slate-800 hover:bg-slate-900/50">
                      <td className="p-2 text-slate-200 font-semibold">{w.name}</td>
                      <td className="p-2 text-slate-500">{w.type}</td>
                      <td className="p-2 text-slate-400 text-right">{w.lat.toFixed(5)}</td>
                      <td className="p-2 text-slate-400 text-right">{w.lon.toFixed(5)}</td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-500">No waypoints</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-200">Gates / Stands</h2>
              <span className="text-xs text-slate-500">{gates.length}</span>
            </div>
            {gates.length > 0 && (
              <div className="relative mb-2">
                <div className="absolute left-3 top-2.5 text-slate-500"><Icon name="search" size={14} /></div>
                <input value={gateFilter} onChange={(e) => setGateFilter(e.target.value)} placeholder="Filter ICAO or label..." className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-300" />
              </div>
            )}
            <div className="bg-slate-950 border border-slate-700 rounded-lg max-h-36 overflow-auto">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-slate-900 text-slate-400">
                  <tr>
                    <th className="text-left p-2">ICAO</th>
                    <th className="text-left p-2">Stand</th>
                    <th className="text-right p-2">Lat</th>
                    <th className="text-right p-2">Lon</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGates.map((g: any, i: number) => (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="p-2 text-sky-300 font-semibold">{g.icao}</td>
                      <td className="p-2 text-slate-200">{g.label}</td>
                      <td className="p-2 text-slate-400 text-right">{g.lat.toFixed(5)}</td>
                      <td className="p-2 text-slate-400 text-right">{g.lon.toFixed(5)}</td>
                    </tr>
                  ))}
                  {!filteredGates.length && (
                    <tr>
                      <td colSpan={4} className="p-3 text-center text-slate-500">{gates.length ? "No matches" : "No gates parsed"}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-200">RampAgent stands</h2>
              {rampAirports.length > 0 || rampConfig ? (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-emerald-400">
                    <Icon name="check" size={12} className="inline" /> {rampAirports.length} airport{rampAirports.length !== 1 ? "s" : ""}
                    {rampConfig ? ` · config (${Object.keys(rampConfig.aircraftWingspans || {}).length} types)` : ""}
                  </span>
                  <button onClick={onResetRampAgent} className="text-xs text-rose-400 underline">Clear</button>
                </div>
              ) : (
                <span className="text-xs text-slate-500">VAC France RampAgent JSON</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-2">
              Upload one or more files. <code className="text-slate-400">config.json</code> provides aircraft wingspans; per-airport JSONs provide stand catalogues.
            </p>
            {!rampConfig && rampAirports.length > 0 && (
              <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-900/30 rounded p-2 mb-2 flex items-center gap-1.5">
                <Icon name="alert" size={12} />Airports loaded but no <code className="text-amber-300">config.json</code> — wingspan check uses WTC fallback values.
              </div>
            )}
            <div className="flex gap-2 mb-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-xs text-white cursor-pointer">
                <Icon name="upload" size={12} />Upload RampAgent JSON (multi)
                <input type="file" accept=".json,application/json" multiple onChange={handleRampUpload} className="hidden" />
              </label>
            </div>
            <div className="bg-slate-950 border border-slate-700 rounded-lg max-h-36 overflow-auto">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-slate-900 text-slate-400">
                  <tr>
                    <th className="text-left p-2">ICAO</th>
                    <th className="text-right p-2">Stands</th>
                    <th className="text-right p-2">With wingspan</th>
                    <th className="text-right p-2">Code F</th>
                  </tr>
                </thead>
                <tbody>
                  {rampAirports.map((icao: string) => {
                    const ra = rampAgent[icao];
                    const ws = ra.stands.filter((s: any) => s.wingspan !== null).length;
                    const cf = ra.stands.filter((s: any) => s.code && s.code.includes("F")).length;
                    return (
                      <tr key={icao} className="border-t border-slate-800">
                        <td className="p-2 text-sky-300 font-semibold">{icao}</td>
                        <td className="p-2 text-slate-300 text-right">{ra.stands.length}</td>
                        <td className="p-2 text-slate-400 text-right">{ws}</td>
                        <td className="p-2 text-slate-400 text-right">{cf || "—"}</td>
                      </tr>
                    );
                  })}
                  {!rampAirports.length && (
                    <tr>
                      <td colSpan={4} className="p-3 text-center text-slate-500">No airport data loaded</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-200">STARs</h2>
              <span className="text-xs text-slate-500">{stars.length}</span>
            </div>
            <div className="bg-slate-950 border border-slate-700 rounded-lg max-h-36 overflow-auto">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-slate-900 text-slate-400">
                  <tr>
                    <th className="text-left p-2">Airport</th>
                    <th className="text-left p-2">Runway</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Entry Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {stars.map((s: any, i: number) => (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="p-2 text-slate-300">{s.airport}</td>
                      <td className="p-2 text-slate-400">{s.runway}</td>
                      <td className="p-2 text-sky-400">{s.name}</td>
                      <td className="p-2 text-emerald-400">{s.iaf}</td>
                    </tr>
                  ))}
                  {!stars.length && (
                    <tr>
                      <td colSpan={4} className="p-3 text-center text-slate-500">No STARs</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
