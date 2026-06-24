// FlightPlansPanel.tsx — SimBrief + VATSIM import. Ported from the rc3 shell;
// network calls go through net/apis.ts (httpFetch -> Tauri HTTP plugin on
// desktop, so no CORS proxy is needed).
import { useState } from "react";
import { Icon } from "../ui/Icon";
import { storage, KEYS } from "../state/storage";
import { fetchSimbrief, parseSimbriefOFP, fetchVatsimData, filterVatsimPilots } from "../net/apis";

export function FlightPlansPanel({ onAddToPool, vatsimCache, setVatsimCache }: any) {
  const [src, setSrc] = useState("simbrief");
  const btn = (id: string, label: string, icon: string) => (
    <button
      onClick={() => setSrc(id)}
      className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium ${src === id ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="flex gap-2">
        {btn("simbrief", "SimBrief", "file")}
        {btn("vatsim", "VATSIM Live", "radio")}
      </div>
      <p className="text-xs text-slate-500">
        All imports go to the <strong className="text-slate-300">Aircraft Pool</strong> tab.
      </p>
      {src === "simbrief" && <SimBriefSection onAddToPool={onAddToPool} />}
      {src === "vatsim" && <VatsimSection onAddToPool={onAddToPool} cache={vatsimCache} setCache={setVatsimCache} />}
    </div>
  );
}

function SimBriefSection({ onAddToPool }: any) {
  const [username, setUsername] = useState(() => storage.get(KEYS.sbUser) || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ofp, setOfp] = useState<any>(null);
  async function fetch_() {
    if (!username.trim()) {
      setError("Enter username or pilot ID");
      return;
    }
    setError("");
    setLoading(true);
    setOfp(null);
    storage.set(KEYS.sbUser, username.trim());
    try {
      const data = await fetchSimbrief(username);
      if (data.fetch?.status === "Error" || data.error) throw new Error(data.fetch?.message || "SimBrief error");
      setOfp(parseSimbriefOFP(data));
    } catch (e: any) {
      const m = String(e.message || e);
      if (m.includes("Failed to fetch") || m.includes("CORS")) setError("Network error fetching SimBrief.");
      else setError(m);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-slate-900 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-200">SimBrief — Latest OFP</h3>
        <div className="flex gap-2">
          <input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetch_()} placeholder="Navigraph username or Pilot ID" className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono" />
          <button onClick={fetch_} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 rounded text-sm text-white">
            <Icon name={loading ? "cloud" : "refresh"} />
            {loading ? "…" : "Fetch"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-900 rounded p-2">{error}</p>}
      </div>
      {ofp && (
        <div className="bg-slate-900 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <div className="text-xs text-slate-500 mb-1">Flight</div>
              <div className="text-sm font-mono font-semibold text-sky-400">{ofp.callsign || "—"}</div>
              <div className="text-xs text-slate-400">{ofp.origin}→{ofp.dest}</div>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded p-2">
              <div className="text-xs text-slate-500 mb-1">Aircraft</div>
              <div className="text-sm font-mono font-semibold text-slate-200">{ofp.type || "—"}</div>
              <div className="text-xs text-slate-400">FL{ofp.cruiseFL}</div>
            </div>
            <div className="col-span-2 bg-slate-950 border border-slate-800 rounded p-2">
              <div className="text-xs text-slate-500 mb-1">Route</div>
              <div className="text-xs font-mono text-slate-300 max-h-16 overflow-auto">{ofp.route || "(none)"}</div>
            </div>
          </div>
          <button
            onClick={() => onAddToPool([{ callsign: ofp.callsign, type: ofp.type, origin: ofp.origin, dest: ofp.dest, route: ofp.route, cruiseFL: ofp.cruiseFL, squawk: ofp.squawk }], "simbrief")}
            className="w-full px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm text-white font-medium"
          >
            Add to Aircraft Pool
          </button>
        </div>
      )}
    </div>
  );
}

function VatsimSection({ onAddToPool, cache, setCache }: any) {
  const [icao, setIcao] = useState(cache.icao || "");
  const [mode, setMode] = useState(cache.mode || "arr");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sel, setSel] = useState(new Set<string>());
  const pilots = cache.pilots || [];
  async function doFetch() {
    if (!icao.trim()) {
      setError("Enter airport ICAO");
      return;
    }
    setError("");
    setLoading(true);
    setSel(new Set());
    try {
      const data = await fetchVatsimData();
      const filtered = filterVatsimPilots(data, icao, mode);
      setCache({ pilots: filtered, icao: icao.toUpperCase(), mode, fetchedAt: new Date().toLocaleTimeString() });
      if (!filtered.length) setError(`No ${mode} found for ${icao.toUpperCase()}.`);
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }
  const toggleSel = (cs: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      n.has(cs) ? n.delete(cs) : n.add(cs);
      return n;
    });
  };
  function addSel() {
    const items = pilots
      .filter((p: any) => sel.has(p.callsign))
      .map((p: any) => ({ callsign: p.callsign, type: p.type, origin: p.dep, dest: p.arr, route: p.route, cruiseFL: p.cruiseFL || 350, squawk: p.squawk }));
    if (!items.length) return;
    onAddToPool(items, "vatsim");
    setSel(new Set());
  }
  const mb = (v: string, l: string) => (
    <button onClick={() => setMode(v)} className={`px-3 py-1.5 rounded text-xs font-medium ${mode === v ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}>
      {l}
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-lg p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 mb-1">VATSIM Live</h3>
          <p className="text-xs text-slate-500">Cached until Refresh.</p>
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Airport ICAO</label>
            <input value={icao} onChange={(e) => setIcao(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && doFetch()} placeholder="LFPG" className="w-32 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Show</label>
            <div className="flex gap-1">
              {mb("arr", "Arrivals")}
              {mb("dep", "Departures")}
              {mb("both", "Both")}
            </div>
          </div>
          <button onClick={doFetch} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 rounded text-sm text-white h-9">
            <Icon name="refresh" size={14} />
            {loading ? "…" : "Refresh"}
          </button>
          {cache.fetchedAt && <span className="text-xs text-slate-500">Last: {cache.fetchedAt} · {pilots.length}</span>}
        </div>
        {error && <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-900 rounded p-2">{error}</p>}
      </div>
      {pilots.length > 0 && (
        <div className="bg-slate-900 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-semibold text-slate-200">{pilots.length} flights</span>
            <div className="flex gap-2 items-center">
              <button onClick={() => setSel(new Set(pilots.map((p: any) => p.callsign)))} className="text-xs px-2 py-1 bg-slate-700 rounded text-slate-300">All</button>
              <button onClick={() => setSel(new Set())} className="text-xs px-2 py-1 bg-slate-700 rounded text-slate-300">None</button>
              <span className="text-xs text-slate-500">{sel.size} sel</span>
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-700 rounded max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-2 w-8"></th>
                  <th className="p-2 text-left">Callsign</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">DEP</th>
                  <th className="p-2 text-left">ARR</th>
                  <th className="p-2 text-left">FL</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {pilots.map((p: any) => (
                  <tr key={p.callsign} onClick={() => toggleSel(p.callsign)} className={`border-t border-slate-800 cursor-pointer hover:bg-slate-800/40 ${sel.has(p.callsign) ? "bg-sky-950/30" : ""}`}>
                    <td className="p-2">
                      <input type="checkbox" readOnly checked={sel.has(p.callsign)} className="accent-sky-500" />
                    </td>
                    <td className="p-2 font-mono font-semibold text-slate-200">{p.callsign}</td>
                    <td className="p-2 font-mono text-slate-300">{p.type || "—"}</td>
                    <td className="p-2 font-mono text-slate-400">{p.dep}</td>
                    <td className="p-2 font-mono text-slate-400">{p.arr}</td>
                    <td className="p-2 font-mono text-slate-400">{p.cruiseFL ? `FL${p.cruiseFL}` : "—"}</td>
                    <td className="p-2">
                      {p.isPrefiled ? (
                        <span className="px-1.5 py-0.5 bg-amber-900/40 text-amber-300 rounded">PRE</span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-emerald-900/40 text-emerald-300 rounded">LIVE</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addSel} disabled={!sel.size} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 rounded text-sm text-white font-medium">
            <Icon name="plus" size={14} />
            Add {sel.size || ""} to Pool
          </button>
        </div>
      )}
    </div>
  );
}
