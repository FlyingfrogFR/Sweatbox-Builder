// SessionTimeline.tsx — the Direction B plane-glyph timeline, promoted from the
// Rule Workbench session overview to cover EVERY aircraft on the traffic board
// (rule output, ground spawns, pool imports, manual adds alike). Two lanes on a
// shared T+ axis: ARR planes in rgb(var(--arr)), DEP planes in rgb(var(--dep)).
// Reference implementation: Timeline + PLANE_D in src/generators/RuleWorkbench.tsx.
import { useMemo } from "react";

const PLANE_D =
  "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z";

function Lane({ items, color, maxT }: { items: any[]; color: string; maxT: number }) {
  return (
    <div
      className="relative h-[18px]"
      style={{
        background:
          "linear-gradient(rgb(var(--bd1)),rgb(var(--bd1))) 0 50%/100% 1px no-repeat," +
          "linear-gradient(rgb(var(--bd2)),rgb(var(--bd2))) 33.33% 0/1px 100% no-repeat," +
          "linear-gradient(rgb(var(--bd2)),rgb(var(--bd2))) 66.66% 0/1px 100% no-repeat",
      }}
    >
      {items.map((a) => (
        <span
          key={a.id}
          title={`${a.callsign || "?"} · T+${+a.start || 0}`}
          className="absolute top-1/2"
          style={{
            left: `${maxT ? ((+a.start || 0) / maxT) * 100 : 0}%`,
            transform: "translate(-50%,-50%) rotate(90deg)",
            color,
            lineHeight: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d={PLANE_D} />
          </svg>
        </span>
      ))}
    </div>
  );
}

export function SessionTimeline({ aircraft }: { aircraft: any[] }) {
  const lanes = useMemo(() => {
    const arr: any[] = [];
    const dep: any[] = [];
    let maxT = 0;
    for (const a of aircraft) {
      (a.isDeparture ? dep : arr).push(a);
      maxT = Math.max(maxT, +a.start || 0);
    }
    return { arr, dep, maxT: Math.max(45, maxT) };
  }, [aircraft]);

  // The strip disappears entirely on an empty board (ghost cards take over).
  if (!aircraft.length) return null;

  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => Math.round(lanes.maxT * f));

  return (
    <div className="flex-none bg-panel/50 border-b border-bd1 px-3.5 pt-1.5 pb-1">
      <div className="grid grid-cols-[34px_1fr] gap-y-1 items-center">
        <span className="text-[9px] font-mono text-arr select-none">ARR</span>
        <Lane items={lanes.arr} color="rgb(var(--arr))" maxT={lanes.maxT} />
        <span className="text-[9px] font-mono text-dep select-none">DEP</span>
        <Lane items={lanes.dep} color="rgb(var(--dep))" maxT={lanes.maxT} />
        <span />
        <div className="relative h-[12px] font-mono text-[9px] text-tx7 select-none">
          {ticks.map((tk, i) => (
            <span
              key={i}
              className="absolute"
              style={
                i === 0
                  ? { left: 0 }
                  : i === ticks.length - 1
                    ? { right: 0 }
                    : { left: `${(i / (ticks.length - 1)) * 100}%`, transform: "translateX(-50%)" }
              }
            >
              T+{tk}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
