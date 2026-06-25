// Sidebar.tsx — the left navigation rail from the design handoff: logo header,
// three numbered phase groups, count chips, active-item treatment, and the
// Saved + AIRAC footer. Replaces the old top TabBar.
import { Icon } from "../ui/Icon";

type Item = { id: string; label: string; icon: string; count?: number | null; dot?: boolean };

function NavItem({ item, active, onClick }: { item: Item; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-[11px] w-full text-left px-[11px] py-2 rounded-[7px] text-[13px] ${
        active ? "bg-cy-soft text-cy-fg font-semibold" : "text-tx4 hover:bg-inset hover:text-tx2"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-[2px] bg-[#5ccfe0]" />
      )}
      <Icon name={item.icon} size={15} className={active ? "text-cy-fg" : "text-tx5"} />
      <span>{item.label}</span>
      {item.dot && <span className="ml-auto text-gn-fg text-[10px] leading-none">●</span>}
      {item.count != null && item.count > 0 && (
        <span className="ml-auto font-mono text-[10px] text-tx6 bg-chip border border-bd3 rounded-[5px] px-1.5 py-px">
          {item.count}
        </span>
      )}
    </button>
  );
}

function PhaseHeader({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-[9px] px-1.5 mb-[9px]">
      <span className="w-[17px] h-[17px] border border-bd5 rounded-full grid place-items-center font-mono text-[9px] text-tx6">
        {n}
      </span>
      <span className="text-[10px] font-semibold tracking-[0.16em] text-tx7">{label}</span>
      <span className="flex-1 h-px bg-bd1" />
    </div>
  );
}

export function Sidebar({
  active,
  onChange,
  poolCount,
  scenarioCount,
  rulesCount,
  navdataLoaded,
  airac,
}: any) {
  const phases: { n: number; label: string; items: Item[] }[] = [
    {
      n: 1,
      label: "PREPARE",
      items: [
        { id: "navdata", label: "Navdata", icon: "database", dot: navdataLoaded },
        { id: "setup", label: "Setup", icon: "settings" },
      ],
    },
    {
      n: 2,
      label: "TRAFFIC",
      items: [
        { id: "plans", label: "Flight Plans", icon: "cloud" },
        { id: "pool", label: "Pool", icon: "layers", count: poolCount },
        { id: "generators", label: "Generators", icon: "zap", count: rulesCount },
      ],
    },
    {
      n: 3,
      label: "ASSEMBLE & SHIP",
      items: [
        { id: "scenario", label: "Scenario", icon: "plane", count: scenarioCount },
        { id: "export", label: "Export", icon: "file" },
      ],
    },
  ];

  return (
    <div className="w-[252px] flex-none bg-rail border-r border-bd1 flex flex-col">
      {/* logo header */}
      <div className="px-[18px] pt-[18px] pb-4 border-b border-bd1 flex items-center gap-[11px]">
        <div className="w-8 h-8 border border-bd5 rounded-[7px] grid place-items-center text-cy-fg bg-logo">
          <Icon name="plane" size={16} />
        </div>
        <div>
          <div className="text-[12.5px] font-semibold tracking-[0.14em] text-tx1">SWEATBOX</div>
          <div className="text-[10px] font-medium tracking-[0.22em] text-tx7 mt-px">BUILDER · V6</div>
        </div>
      </div>

      {/* phase groups */}
      <div className="flex-1 overflow-auto px-3 py-4">
        {phases.map((ph) => (
          <div key={ph.n} className="mb-5">
            <PhaseHeader n={ph.n} label={ph.label} />
            <div className="flex flex-col gap-0.5">
              {ph.items.map((it) => (
                <NavItem key={it.id} item={it} active={active === it.id} onClick={() => onChange(it.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* footer: Saved + AIRAC */}
      <div className="border-t border-bd1 p-3">
        <NavItem
          item={{ id: "saved", label: "Saved scenarios", icon: "folder" }}
          active={active === "saved"}
          onClick={() => onChange("saved")}
        />
        <div className="flex items-center justify-between mt-2.5 px-[11px] py-[7px] rounded-[7px] bg-inset border border-bd2">
          <span className="text-[10px] tracking-[0.12em] text-tx7">AIRAC</span>
          <span className="font-mono text-[11px] text-tx3">{airac || "—"}</span>
        </div>
      </div>
    </div>
  );
}
