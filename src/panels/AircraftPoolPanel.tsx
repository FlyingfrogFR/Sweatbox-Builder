// AircraftPoolPanel.tsx — the Pool tab. Ported VERBATIM from the rc3 shell.
import { useState, useEffect, useMemo } from "react";
import { Icon } from "../ui/Icon";
import { SRC_LABELS } from "../core/pool";
import { downloadJsonBundle, readJsonFile } from "../io/bundles";

export function AircraftPoolPanel({ pool, onDelete, onAddToScenario, airac, onSetAirac, onImportPool }: any) {
  const [fQ, setFQ] = useState("");
  const [fDep, setFDep] = useState("");
  const [fArr, setFArr] = useState("");
  const [fSrc, setFSrc] = useState("");
  const [sel, setSel] = useState(new Set<string>());
  const [airacInput, setAiracInput] = useState(airac || "");
  const [status, setStatus] = useState("");
  useEffect(() => setAiracInput(airac || ""), [airac]);
  const filtered = useMemo(
    () =>
      pool.filter((p: any) => {
        if (fQ && !p.callsign.toUpperCase().includes(fQ.toUpperCase())) return false;
        if (fDep && p.origin !== fDep.toUpperCase()) return false;
        if (fArr && p.dest !== fArr.toUpperCase()) return false;
        if (fSrc && p.source !== fSrc) return false;
        return true;
      }),
    [pool, fQ, fDep, fArr, fSrc],
  );
  const toggleSel = (id: string) => {
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const counts = useMemo(() => pool.reduce((a: any, p: any) => { a[p.source] = (a[p.source] || 0) + 1; return a; }, {}), [pool]);
  const inp = "bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 font-mono";
  const flash = (m: string) => {
    setStatus(m);
    setTimeout(() => setStatus(""), 3000);
  };

  function exportPool() {
    downloadJsonBundle("pool.json", { kind: "sweatbox-pool", version: 1, airac: airac || "", exportedAt: new Date().toISOString(), pool });
    flash("Exported pool.json");
  }
  async function importPool(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const bundle = await readJsonFile(file);
      if (bundle.kind !== "sweatbox-pool") throw new Error("Not a pool bundle");
      onImportPool(bundle);
      flash(`Imported ${file.name}${bundle.airac ? ` (AIRAC ${bundle.airac})` : ""}: ${(bundle.pool || []).length} entries`);
    } catch (err: any) {
      flash("Import failed: " + (err.message || err));
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-semibold uppercase">AIRAC</label>
          <input value={airacInput} onChange={(e) => setAiracInput(e.target.value)} onBlur={() => onSetAirac(airacInput.trim())} onKeyDown={(e: any) => { if (e.key === "Enter") e.target.blur(); }} placeholder="2511" className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 font-mono" />
          <span className="text-xs text-slate-500">tag this pool</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button onClick={exportPool} disabled={!pool.length} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 rounded text-xs text-slate-200">
            <Icon name="download" size={12} />Export pool.json
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 hover:bg-sky-600 rounded text-xs text-white cursor-pointer">
            <Icon name="upload" size={12} />Import bundle
            <input type="file" accept=".json,application/json" onChange={importPool} className="hidden" />
          </label>
        </div>
      </div>
      {status && <div className="text-xs text-emerald-400">{status}</div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Aircraft Pool</h2>
          <div className="flex gap-3 mt-1 text-xs">
            {Object.entries(counts).map(([src, n]: any) => {
              const s = SRC_LABELS[src] || { label: src, color: "text-slate-400 bg-slate-800" };
              return (
                <span key={src} className={`px-2 py-0.5 rounded font-medium ${s.color}`}>
                  {s.label}: {n}
                </span>
              );
            })}{" "}
            {!pool.length && <span className="text-slate-500">Empty</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { if (!sel.size) return; if (!confirm(`Delete ${sel.size}?`)) return; onDelete([...sel]); setSel(new Set()); }} disabled={!sel.size} className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 disabled:bg-slate-700 rounded text-sm text-white">
            Delete sel
          </button>
          <button onClick={() => { if (!confirm(`Clear all ${pool.length}?`)) return; onDelete(pool.map((p: any) => p.id)); setSel(new Set()); }} disabled={!pool.length} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-sm text-slate-200">
            Clear all
          </button>
          <button onClick={() => { const items = filtered.filter((p: any) => sel.has(p.id)); if (!items.length) return; onAddToScenario(items); setSel(new Set()); }} disabled={!sel.size} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 rounded text-sm text-white font-medium">
            <Icon name="plane" size={14} />Add to Scenario ({sel.size})
          </button>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <div className="absolute left-2 top-2 text-slate-500">
            <Icon name="search" size={12} />
          </div>
          <input value={fQ} onChange={(e) => setFQ(e.target.value)} placeholder="Callsign" className={`${inp} pl-7 w-32`} />
        </div>
        <input value={fDep} onChange={(e) => setFDep(e.target.value.toUpperCase())} placeholder="DEP" className={`${inp} w-20`} />
        <input value={fArr} onChange={(e) => setFArr(e.target.value.toUpperCase())} placeholder="ARR" className={`${inp} w-20`} />
        <select value={fSrc} onChange={(e) => setFSrc(e.target.value)} className={inp}>
          <option value="">All sources</option>
          {Object.keys(SRC_LABELS).map((s) => (
            <option key={s} value={s}>{SRC_LABELS[s].label}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500 self-center">{filtered.length}/{pool.length}</span>
        {(fQ || fDep || fArr || fSrc) && (
          <button onClick={() => { setFQ(""); setFDep(""); setFArr(""); setFSrc(""); }} className="text-xs text-sky-400">Clear filters</button>
        )}
      </div>
      <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
            <tr>
              <th className="p-3 w-8">
                <input type="checkbox" onChange={(e) => { if (e.target.checked) setSel(new Set(filtered.map((p: any) => p.id))); else setSel(new Set()); }} checked={sel.size === filtered.length && filtered.length > 0} className="accent-sky-500" />
              </th>
              <th className="text-left p-3">Callsign</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">DEP</th>
              <th className="text-left p-3">ARR</th>
              <th className="text-left p-3">FL</th>
              <th className="text-left p-3">Route</th>
              <th className="text-left p-3">Source</th>
              <th className="text-left p-3">Added</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => {
              const sl = SRC_LABELS[p.source] || { label: p.source || "?", color: "text-slate-400 bg-slate-800" };
              return (
                <tr key={p.id} onClick={() => toggleSel(p.id)} className={`border-t border-slate-800 cursor-pointer hover:bg-slate-800/30 ${sel.has(p.id) ? "bg-sky-950/20" : ""}`}>
                  <td className="p-3">
                    <input type="checkbox" readOnly checked={sel.has(p.id)} className="accent-sky-500" />
                  </td>
                  <td className="p-3 font-mono font-semibold text-slate-200">{p.callsign || <span className="text-slate-600 italic text-xs">no callsign</span>}</td>
                  <td className="p-3 font-mono text-slate-300">{p.type || "—"}</td>
                  <td className="p-3 font-mono text-slate-400">{p.origin || "—"}</td>
                  <td className="p-3 font-mono text-slate-400">{p.dest || "—"}</td>
                  <td className="p-3 font-mono text-slate-400">{p.cruiseFL ? `FL${p.cruiseFL}` : "—"}</td>
                  <td className="p-3 text-slate-500 text-xs max-w-xs truncate font-mono">
                    {(p.route || "").split(" ").slice(0, 5).join(" ")}
                    {(p.route || "").split(" ").length > 5 ? "…" : ""}
                  </td>
                  <td className="p-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${sl.color}`}>{sl.label}</span>
                  </td>
                  <td className="p-3 text-xs text-slate-500">{p.addedAt ? new Date(p.addedAt).toLocaleTimeString() : ""}</td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => onDelete([p.id])} className="text-rose-400 hover:text-rose-300">
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-500">
                  {pool.length ? "No entries match" : "Pool empty — import from Flight Plans or load a pool.json bundle"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
