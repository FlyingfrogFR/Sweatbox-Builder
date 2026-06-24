// SavedPanel.tsx — localStorage saves + scenario-bundle import/export + rules
// import. Ported VERBATIM from the rc3 shell (localStorage keys preserved).
import { useState, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { storage, KEYS } from "../state/storage";
import { downloadJsonBundle, readJsonFile } from "../io/bundles";
import { defaultScenario, migrateRules, emptyRule } from "../core/model";
import { uid } from "../core/uid";

export function SavedPanel({ scenario, onChange }: any) {
  const [list, setList] = useState<string[]>([]);
  const [name, setName] = useState(scenario.name);
  const [status, setStatus] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [rulesMode, setRulesMode] = useState("merge");

  useEffect(() => setName(scenario.name), [scenario.name]);
  const refresh = () => setList(storage.get(KEYS.list) || []);
  useEffect(refresh, []);

  const flash = (m: string) => {
    setStatus(m);
    setTimeout(() => setStatus(""), 3000);
  };

  const save = () => {
    if (!name.trim()) return;
    const l = storage.get(KEYS.list) || [];
    storage.set(KEYS.list, Array.from(new Set([...l, name])));
    storage.set(`sb:sc:${name}`, { ...scenario, name });
    flash(`Saved "${name}"`);
    refresh();
  };
  const load = (n: string) => {
    const s = storage.get(`sb:sc:${n}`);
    if (s) {
      onChange({ ...defaultScenario(), ...s, rules: migrateRules(s.rules) });
      flash(`Loaded "${n}"`);
    }
  };
  const del = (n: string) => {
    const l = storage.get(KEYS.list) || [];
    storage.set(KEYS.list, l.filter((x: string) => x !== n));
    storage.del(`sb:sc:${n}`);
    refresh();
  };

  function exportScenario() {
    const filename = `${(scenario.name || "scenario").replace(/[^a-z0-9]+/gi, "_")}.scenario.json`;
    downloadJsonBundle(filename, { kind: "sweatbox-scenario", version: 1, exportedAt: new Date().toISOString(), scenario });
    flash(`Exported ${filename}`);
  }
  async function importScenario(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const b = await readJsonFile(file);
      if (b.kind !== "sweatbox-scenario") throw new Error("Not a scenario bundle");
      if (!b.scenario || typeof b.scenario !== "object") throw new Error("Bundle missing .scenario");
      if (!confirm(`Replace current scenario "${scenario.name}" with "${b.scenario.name || "(unnamed)"}"?`)) return;
      const next = { ...defaultScenario(), ...b.scenario, rules: migrateRules(b.scenario.rules) };
      onChange(next);
      flash(`Imported ${file.name}`);
    } catch (err: any) {
      flash("Import failed: " + (err.message || err));
    }
  }

  function extractRules(parsed: any) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && parsed.kind === "sweatbox-rules" && Array.isArray(parsed.rules)) return parsed.rules;
    if (parsed && parsed.kind === "sweatbox-scenario" && parsed.scenario && Array.isArray(parsed.scenario.rules)) return parsed.scenario.rules;
    if (parsed && Array.isArray(parsed.rules)) return parsed.rules;
    throw new Error("Could not find a rules array in the input");
  }
  function applyRules(incoming: any[]) {
    const normalised = incoming.map((r) => ({ ...emptyRule(), ...r, id: r.id || uid(), mode: r.mode || "S3" }));
    if (rulesMode === "replace") {
      const existing = (scenario.rules || []).length;
      if (!confirm(`Replace all ${existing} existing rule${existing !== 1 ? "s" : ""} with ${normalised.length} imported rule${normalised.length !== 1 ? "s" : ""}?`)) return;
      const keptAc = scenario.aircraft.filter((a: any) => !a.ruleId);
      onChange({ ...scenario, rules: normalised, aircraft: keptAc });
      flash(`Replaced rules: ${normalised.length} imported`);
    } else {
      const existingIds = new Set((scenario.rules || []).map((r: any) => r.id));
      const merged = [...(scenario.rules || []).filter((r: any) => !normalised.some((n) => n.id === r.id)), ...normalised];
      const overlap = normalised.filter((n) => existingIds.has(n.id)).length;
      onChange({ ...scenario, rules: merged });
      flash(`Merged ${normalised.length} rule${normalised.length !== 1 ? "s" : ""}${overlap ? ` (${overlap} replaced by id)` : ""}`);
    }
  }
  function importRulesFromText() {
    if (!rulesText.trim()) {
      flash("Paste rules JSON first");
      return;
    }
    try {
      const parsed = JSON.parse(rulesText);
      const rules = extractRules(parsed);
      if (!rules.length) throw new Error("Rules array is empty");
      applyRules(rules);
      setRulesText("");
    } catch (err: any) {
      flash("Parse failed: " + (err.message || err));
    }
  }
  async function importRulesFromFile(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const parsed = await readJsonFile(file);
      const rules = extractRules(parsed);
      if (!rules.length) throw new Error("Rules array is empty");
      applyRules(rules);
    } catch (err: any) {
      flash("Import failed: " + (err.message || err));
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-200">
          Save Current <span className="text-slate-500 text-sm font-normal">(browser storage)</span>
        </h2>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200" placeholder="Scenario name" />
          <button onClick={save} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-sm text-white">
            <Icon name="save" size={14} />Save
          </button>
        </div>
        {status && <div className="text-xs text-emerald-400">{status}</div>}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-200">Saved Scenarios</h2>
        <div className="space-y-2">
          {list.map((n) => (
            <div key={n} className="flex items-center justify-between bg-slate-900 rounded p-3">
              <span className="text-sm text-slate-200 font-mono">{n}</span>
              <div className="flex gap-2">
                <button onClick={() => load(n)} className="px-3 py-1 text-xs bg-sky-700 hover:bg-sky-600 rounded text-white">Load</button>
                <button onClick={() => del(n)} className="text-rose-400 hover:text-rose-300 p-1"><Icon name="trash" size={14} /></button>
              </div>
            </div>
          ))}
          {!list.length && <div className="text-sm text-slate-500">No saved scenarios</div>}
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-800 pt-5">
        <h2 className="text-lg font-semibold text-slate-200">
          Scenario bundle <span className="text-slate-500 text-sm font-normal">(.scenario.json)</span>
        </h2>
        <p className="text-xs text-slate-500">Export the entire current scenario as a portable JSON file.</p>
        <div className="flex gap-2">
          <button onClick={exportScenario} className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200">
            <Icon name="download" size={14} />Export scenario
          </button>
          <label className="flex items-center gap-1.5 px-3 py-2 bg-sky-700 hover:bg-sky-600 rounded text-sm text-white cursor-pointer">
            <Icon name="upload" size={14} />Import scenario
            <input type="file" accept=".json,application/json" onChange={importScenario} className="hidden" />
          </label>
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-800 pt-5">
        <h2 className="text-lg font-semibold text-slate-200">Import rules only</h2>
        <p className="text-xs text-slate-500">
          Paste rules JSON or upload a file. Imported rules are not auto-applied — review in Generators tab and click Apply All when ready.
        </p>
        <div className="flex items-center gap-4 text-sm bg-slate-950/60 border border-slate-800 rounded p-2.5">
          <span className="text-xs text-slate-400 font-semibold uppercase">Mode</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={rulesMode === "merge"} onChange={() => setRulesMode("merge")} className="accent-sky-500" />
            <span className="text-slate-300">Merge</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" checked={rulesMode === "replace"} onChange={() => setRulesMode("replace")} className="accent-sky-500" />
            <span className="text-slate-300">Replace all</span>
          </label>
        </div>
        <textarea value={rulesText} onChange={(e) => setRulesText(e.target.value)} placeholder='[{"name":"...","mode":"S3","spawnWaypoint":"ODILO", ... }]' className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300 focus:border-sky-500 focus:outline-none h-40" />
        <div className="flex gap-2">
          <button onClick={importRulesFromText} disabled={!rulesText.trim()} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 rounded text-sm text-white">
            <Icon name="upload" size={14} />Import pasted rules
          </button>
          <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200 cursor-pointer">
            <Icon name="folder" size={14} />…or upload JSON file
            <input type="file" accept=".json,application/json" onChange={importRulesFromFile} className="hidden" />
          </label>
        </div>
      </div>
    </div>
  );
}
