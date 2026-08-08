// ExportPanel.tsx — generate the .scn, plus native Save-As with the
// ICAO_X.Y_CONFIGYY naming convention (tokens entered here, with a live filename
// preview, per "ask at save time"). Also exports the ruleset .json with the
// matching ..._RULESET.json name. Falls back to a browser download in the web build.
// Export settings (auto-assign pseudo pilot + naming tokens) persist in
// localStorage so they survive tab switches and app restarts.
import { useState, useMemo, useEffect, useDeferredValue } from "react";
import { Icon } from "../ui/Icon";
import { generateSweatbox } from "../core/generateSweatbox";
import { buildExportName, saveTextFile } from "../io/fileSave";
import { storage, KEYS } from "../state/storage";
import { isTauri } from "../env";

export function ExportPanel({ scenario, waypoints }: any) {
  const prefs = useMemo(() => storage.get(KEYS.exportPrefs) || {}, []);
  const [autoAssign, setAutoAssign] = useState(!!prefs.autoAssign);
  // Pseudo-pilot picked either from the Setup controller list or typed freely.
  // Both values are kept so switching source doesn't lose the other one.
  const [ppMode, setPpMode] = useState(prefs.ppMode === "custom" ? "custom" : "list");
  const [ppList, setPpList] = useState(prefs.ppList || "");
  const [ppCustom, setPpCustom] = useState(prefs.ppCustom || "");
  const initPP = ppMode === "list" ? ppList : ppCustom;
  const controllers = (scenario.controllers || []).filter((c: any) => c.callsign);
  // Deferred so typing a mentor callsign doesn't re-run the full .scn
  // generation (O(aircraft × waypoints)) synchronously on every keystroke;
  // the preview converges within a frame and Copy/Save read the settled value.
  const deferredPP = useDeferredValue(initPP);
  const output = useMemo(
    () => generateSweatbox(scenario, waypoints, { initPseudoPilot: autoAssign ? deferredPP : "" }),
    [scenario, waypoints, autoAssign, deferredPP],
  );
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");

  // Naming-convention tokens — collected at save time. ICAO from saved prefs,
  // else seeded from the first 4 letters of the scenario name if it looks like an ICAO.
  const seededIcao = (scenario.name || "").trim().slice(0, 4).toUpperCase();
  const [icao, setIcao] = useState(prefs.icao || (/^[A-Z]{4}$/.test(seededIcao) ? seededIcao : ""));
  const [version, setVersion] = useState(prefs.version || "");
  const [config, setConfig] = useState(prefs.config || "");
  const [configNum, setConfigNum] = useState(prefs.configNum || "");
  const tokens = { icao, version, config, configNum };

  useEffect(() => {
    storage.set(KEYS.exportPrefs, { autoAssign, ppMode, ppList, ppCustom, icao, version, config, configNum });
  }, [autoAssign, ppMode, ppList, ppCustom, icao, version, config, configNum]);
  const scnName = useMemo(() => buildExportName(tokens, "scenario"), [icao, version, config, configNum]);
  const rulesetName = useMemo(() => buildExportName(tokens, "ruleset"), [icao, version, config, configNum]);

  const flash = (m: string) => {
    setStatus(m);
    setTimeout(() => setStatus(""), 4000);
  };
  const copy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  async function saveScenario() {
    try {
      const r = await saveTextFile(scnName, output, "scenario");
      if (r.saved) flash(r.path ? `Saved ${r.path}` : `Downloaded ${scnName}`);
    } catch (e: any) {
      flash("Save failed: " + (e.message || e));
    }
  }
  async function saveRuleset() {
    const payload = JSON.stringify(
      { kind: "sweatbox-rules", version: 1, exportedAt: new Date().toISOString(), rules: scenario.rules || [] },
      null,
      2,
    );
    try {
      const r = await saveTextFile(rulesetName, payload, "ruleset");
      if (r.saved) flash(r.path ? `Saved ${r.path}` : `Downloaded ${rulesetName}`);
    } catch (e: any) {
      flash("Save failed: " + (e.message || e));
    }
  }

  const ip = "w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 font-mono focus:border-sky-500 focus:outline-none";

  return (
    <div className="p-6 space-y-3 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">Export</h2>
        <div className="flex gap-2">
          <button onClick={copy} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200">
            <Icon name="copy" size={14} />
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={saveScenario} className="flex items-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-500 rounded text-sm text-white font-medium">
            <Icon name="download" size={14} />
            Save scenario
          </button>
          <button onClick={saveRuleset} disabled={!(scenario.rules || []).length} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-sm text-slate-200" title={(scenario.rules || []).length ? "" : "No rules to export"}>
            <Icon name="save" size={14} />
            Save ruleset
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs uppercase text-slate-400 font-semibold">Export name — ICAO_X.Y_CONFIGYY</h3>
          <span className="text-xs text-slate-500">{isTauri() ? "Native Save-As (writes directly)" : "Browser download (web fallback)"}</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">ICAO</label>
            <input value={icao} onChange={(e) => setIcao(e.target.value.toUpperCase())} placeholder="LFBO" maxLength={4} className={ip} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Version X.Y</label>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="3.3" className={ip} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Config</label>
            <input value={config} onChange={(e) => setConfig(e.target.value.toUpperCase())} placeholder="CONFIG" className={ip} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Config nº (YY)</label>
            <input value={configNum} onChange={(e) => setConfigNum(e.target.value)} placeholder="32" className={ip} />
          </div>
        </div>
        <div className="text-xs font-mono space-y-1">
          <div className="text-slate-400">Scenario → <span className="text-sky-300">{scnName}</span></div>
          <div className="text-slate-400">Ruleset → <span className="text-sky-300">{rulesetName}</span></div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" checked={autoAssign} onChange={(e) => setAutoAssign(e.target.checked)} className="accent-sky-500" />
          Auto-assign initial pseudo pilot
        </label>
        {autoAssign && (
          <div className="space-y-2">
            <div className="inline-flex gap-[3px] bg-slate-950 border border-slate-700 rounded-md p-[3px]">
              <button
                onClick={() => setPpMode("list")}
                className={`text-xs px-2.5 py-1 rounded ${ppMode === "list" ? "bg-slate-700 text-slate-100 font-medium" : "text-slate-400 hover:text-slate-200"}`}
              >
                Setup controller
              </button>
              <button
                onClick={() => setPpMode("custom")}
                className={`text-xs px-2.5 py-1 rounded ${ppMode === "custom" ? "bg-slate-700 text-slate-100 font-medium" : "text-slate-400 hover:text-slate-200"}`}
              >
                Mentor callsign
              </button>
            </div>
            {ppMode === "list" ? (
              controllers.length ? (
                <select
                  value={ppList}
                  onChange={(e) => setPpList(e.target.value)}
                  className="block w-64 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 font-mono focus:border-sky-500 focus:outline-none"
                >
                  <option value="">— pick a controller —</option>
                  {controllers.map((c: any) => (
                    <option key={c.callsign} value={c.callsign}>
                      {c.callsign}
                      {c.freq ? ` · ${c.freq}` : ""}
                    </option>
                  ))}
                  {ppList && !controllers.some((c: any) => c.callsign === ppList) && (
                    <option value={ppList}>{ppList} · no longer in Setup</option>
                  )}
                </select>
              ) : (
                <p className="text-xs text-slate-500">No controllers defined in Setup — add them there, or switch to Mentor callsign.</p>
              )
            ) : (
              <input
                value={ppCustom}
                onChange={(e) => setPpCustom(e.target.value.toUpperCase())}
                placeholder="LFPG_APP"
                className="block w-48 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 font-mono focus:border-sky-500 focus:outline-none"
              />
            )}
          </div>
        )}
        {(scenario.holdings || []).length > 0 && (
          <p className="text-xs text-sky-400">
            <Icon name="check" size={12} className="inline mr-1" />
            {(scenario.holdings || []).length} holding pattern{(scenario.holdings || []).length !== 1 ? "s" : ""} defined in Setup
          </p>
        )}
        {waypoints.length > 0 && (
          <p className="text-xs text-emerald-600">
            <Icon name="check" size={12} className="inline mr-1" />
            Navdata loaded — pre-entry offsets computed at export
          </p>
        )}
        {status && <p className="text-xs text-emerald-400">{status}</p>}
      </div>

      <pre className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-auto whitespace-pre min-h-[400px]">
        {output}
      </pre>
    </div>
  );
}
