// GeneratorsPanel.tsx — "Generators · Direction B" shell: header with the
// S1/S2/S3/C1 segmented control + Apply all, then either the rule Workbench
// (master/detail, for S3/C1) or the generator's own panel (S1 ground, S2 stub).
import { useState, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { getGenerators, onRegister } from "../generators";
import { generateFromRule } from "../core/generateFromRule";
import { RuleWorkbench } from "../generators/RuleWorkbench";

const ORDER = ["S1", "S2", "S3", "C1"];
const LABELS: Record<string, string> = { S1: "S1 Ground", S2: "S2 Tower", S3: "S3 Approach", C1: "C1 Enroute" };
const RULE_MODES = new Set(["S3", "C1"]);

export function GeneratorsPanel(props: any) {
  const { scenario, onChange, waypoints, pool } = props;
  const [, setTick] = useState(0);
  const [subTab, setSubTab] = useState("S3");
  useEffect(() => onRegister(() => setTick((t) => t + 1)), []);

  const registry = getGenerators();
  const byId = Object.fromEntries(registry.map((g) => [g.id, g]));
  const extras = registry.map((g) => g.id).filter((id) => !ORDER.includes(id));
  const fullOrder = [...ORDER, ...extras];

  const isRuleMode = RULE_MODES.has(subTab);
  const ruleCount = (scenario.rules || []).filter((r: any) => r.mode === subTab).length;

  const applyAll = () => {
    const rules = (scenario.rules || []).filter((r: any) => r.mode === subTab);
    if (!rules.length) return;
    const myIds = new Set(rules.map((r: any) => r.id));
    let ac = scenario.aircraft.filter((a: any) => !a.ruleId || !myIds.has(a.ruleId));
    const used = new Set<string>(ac.map((a: any) => a.callsign).filter(Boolean));
    for (const r of rules) {
      const { aircraft: gen, error } = generateFromRule(r, waypoints, used, pool);
      if (error) {
        alert(`${r.name}: ${error}`);
        continue;
      }
      ac = [...ac, ...gen];
    }
    onChange({ ...scenario, aircraft: ac.sort((a: any, b: any) => (+a.start || 0) - (+b.start || 0)) });
  };

  const subtitle = isRuleMode
    ? `${LABELS[subTab]} · ${ruleCount} rule${ruleCount !== 1 ? "s" : ""}`
    : LABELS[subTab] || subTab;

  return (
    <div className="flex flex-col h-full">
      {/* HEADER */}
      <div className="flex items-center justify-between px-[18px] py-[13px] bg-panel border-b border-bd1">
        <div className="flex items-center gap-[11px]">
          <div className="w-[30px] h-[30px] border border-cy-bd rounded-[7px] grid place-items-center text-cy-fg bg-cy-soft2">
            <Icon name="zap" size={15} />
          </div>
          <div>
            <div className="text-[12.5px] font-semibold tracking-[0.12em] text-tx1">GENERATORS</div>
            <div className="text-[10px] text-tx7 mt-px font-mono">{subtitle}</div>
          </div>
        </div>

        <div className="flex gap-[3px] bg-inset border border-bd2 rounded-[9px] p-[3px]">
          {fullOrder.map((id) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`text-[11.5px] px-3 py-1.5 rounded-md ${
                subTab === id ? "bg-cy-soft text-cy-fg font-medium" : "text-tx5 hover:text-tx3"
              }`}
            >
              {LABELS[id] || id}
            </button>
          ))}
        </div>

        {isRuleMode ? (
          <button
            onClick={applyAll}
            disabled={!ruleCount}
            className="flex items-center gap-[7px] text-[12.5px] font-semibold text-on-cyan bg-[#5ccfe0] hover:bg-[#74d8e6] disabled:opacity-50 rounded-[7px] px-[15px] py-[9px]"
          >
            <Icon name="check" size={14} />
            Apply all
          </button>
        ) : (
          <div className="w-[92px]" />
        )}
      </div>

      {/* BODY */}
      <div className="flex-1 min-h-0">
        {isRuleMode ? (
          <RuleWorkbench
            mode={subTab}
            scenario={scenario}
            onChange={onChange}
            waypoints={waypoints}
            pool={pool}
            stars={props.stars}
            copx={props.copx}
          />
        ) : byId[subTab] ? (
          <div className="h-full overflow-auto">{byId[subTab].render(props)}</div>
        ) : (
          <div className="p-12 text-center text-tx7">
            <div className="text-tx8 mb-2">
              <Icon name="zap" size={32} className="mx-auto" />
            </div>
            <p>{LABELS[subTab] || subTab} plugin not loaded.</p>
          </div>
        )}
      </div>
    </div>
  );
}
