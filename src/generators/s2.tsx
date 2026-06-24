// s2.tsx — S2 Tower generator (placeholder stub). Ported from scenario-s2-tower.js.
// Registers the sub-tab so the Generators tab shows it in canonical order.
import { Icon } from "../ui/Icon";
import { registerGenerator } from "./registry";

function S2Stub() {
  return (
    <div className="p-12 text-center text-slate-500">
      <div className="text-slate-600 mb-3">
        <Icon name="radio" size={32} className="mx-auto" />
      </div>
      <p className="text-slate-300 font-semibold mb-1">S2 Tower — Not yet implemented</p>
      <p className="text-xs text-slate-500 max-w-md mx-auto">
        This sub-tab will eventually generate tower-flow scenarios (departures lined up at the
        holding point, arrivals on final at the approach gate, runway-occupancy timing, etc). For
        now, use <span className="text-slate-300">S1 Ground</span> for single-airport ground
        scenarios or <span className="text-slate-300">S3 Approach</span> for terminal traffic.
      </p>
    </div>
  );
}

registerGenerator({
  id: "S2",
  label: "S2 Tower",
  render: () => <S2Stub />,
});
