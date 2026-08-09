// SimbriefTray.tsx — deck adapter: hosts the classic SimBriefSection (from
// FlightPlansPanel) inside the shared Tray shell. Section internals keep their
// legacy slate-* styling — accepted for this milestone.
import { Tray } from "../Tray";
import { SimBriefSection } from "../../panels/FlightPlansPanel";

export function SimbriefTray({ open, close, cache, setCache, onAddToPool }: any) {
  return (
    <Tray open={open} title="SIMBRIEF — FETCH OFP" onDone={close}>
      <div className="p-4">
        <SimBriefSection onAddToPool={onAddToPool} cache={cache} setCache={setCache} />
      </div>
    </Tray>
  );
}
