// TabBar.tsx — top tab strip, ported VERBATIM from the rc3 shell.
import { Icon } from "../ui/Icon";

export function TabBar({ active, onChange, poolCount, scenarioCount }: any) {
  const tabs = [
    { id: "navdata", label: "Navdata", icon: "database" },
    { id: "setup", label: "Setup", icon: "settings" },
    { id: "plans", label: "Flight Plans", icon: "cloud" },
    { id: "pool", label: `Pool${poolCount > 0 ? ` (${poolCount})` : ""}`, icon: "layers" },
    { id: "generators", label: "Generators", icon: "zap" },
    { id: "scenario", label: `Scenario${scenarioCount > 0 ? ` (${scenarioCount})` : ""}`, icon: "plane" },
    { id: "export", label: "Export", icon: "file" },
    { id: "saved", label: "Saved", icon: "folder" },
  ];
  return (
    <div className="flex border-b border-slate-800 bg-slate-900/60 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${active === t.id ? "text-sky-300 border-sky-400 bg-slate-800/70" : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40"}`}
        >
          <Icon name={t.icon} size={14} className={active === t.id ? "text-sky-400" : ""} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
