// GeneratorsPanel.tsx — the Generators tab. Ported from the rc3 GeneratorsTabPanel,
// but reads the ES-module registry (getGenerators/onRegister) instead of window.SB.
import { useState, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { getGenerators, onRegister } from "../generators";

export function GeneratorsPanel(props: any) {
  const [, setTick] = useState(0);
  const [subTab, setSubTab] = useState("S1");
  useEffect(() => {
    const off = onRegister(() => setTick((t) => t + 1));
    return off;
  }, []);
  const order = ["S1", "S2", "S3", "C1"];
  const labels: Record<string, string> = { S1: "S1 Ground", S2: "S2 Tower", S3: "S3 Approach", C1: "C1 Enroute" };
  const registry = getGenerators();
  const byId = Object.fromEntries(registry.map((g) => [g.id, g]));
  const extras = registry.map((g) => g.id).filter((id) => !order.includes(id));
  const fullOrder = [...order, ...extras];
  const active = byId[subTab];
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-slate-800 bg-slate-900/40 overflow-x-auto">
        {fullOrder.map((id) => {
          const g = byId[id];
          const lbl = g?.label || labels[id] || id;
          const loaded = !!g;
          return (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${subTab === id ? "text-sky-400 border-b-2 border-sky-400 bg-slate-800/40" : loaded ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30" : "text-slate-700 hover:text-slate-600"}`}
            >
              {lbl}
              {!loaded && <span className="text-xs italic">(not loaded)</span>}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-auto">
        {active ? (
          active.render(props)
        ) : (
          <div className="p-12 text-center text-slate-500">
            <div className="text-slate-600 mb-2">
              <Icon name="zap" size={32} className="mx-auto" />
            </div>
            <p className="mb-1">{labels[subTab] || subTab} plugin not loaded.</p>
          </div>
        )}
      </div>
    </div>
  );
}
