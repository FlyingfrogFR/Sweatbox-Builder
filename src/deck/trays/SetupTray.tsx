// SetupTray.tsx — deck adapter: TARGET RATING latch row (deck-native feature)
// above the classic SetupPanel (name, ILS, holdings, controllers), inside the
// shared Tray shell. Panel internals keep their legacy slate-* styling —
// accepted for this milestone.
import { Tray } from "../Tray";
import { Latch, RATINGS } from "../ui";
import { SetupPanel } from "../../panels/SetupPanel";

export function SetupTray({ open, close, scenario, onChange, positions, runways, waypoints }: any) {
  const rating = scenario.rating || null;
  return (
    <Tray open={open} title="SETUP — SCENARIO FRAME" onDone={close}>
      {/* SetupPanel carries its own p-6, so this row pads itself to line up. */}
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[8.5px] font-extrabold tracking-[0.18em] text-tx8 select-none">TARGET RATING</span>
          {RATINGS.map((r) => (
            <Latch
              key={r}
              on={rating === r}
              onClick={() => onChange({ ...scenario, rating: rating === r ? null : r })}
              title={rating === r ? "Clear target rating" : `Set target rating ${r}`}
            >
              {r}
            </Latch>
          ))}
        </div>
        <p className="mt-1.5 text-[10.5px] text-tx7">
          Tags the session's student rating — shows on the slot card and steers the deck's hints.
        </p>
      </div>
      <SetupPanel scenario={scenario} onChange={onChange} positions={positions} runways={runways} waypoints={waypoints} />
    </Tray>
  );
}
