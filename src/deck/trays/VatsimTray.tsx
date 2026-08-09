// VatsimTray.tsx — deck adapter: hosts the classic VatsimSection (from
// FlightPlansPanel) inside the shared Tray shell. Section internals keep their
// legacy slate-* styling — accepted for this milestone.
import { Tray } from "../Tray";
import { VatsimSection } from "../../panels/FlightPlansPanel";

export function VatsimTray({ open, close, cache, setCache, onAddToPool }: any) {
  return (
    <Tray open={open} title="VATSIM — LIVE TRAFFIC" onDone={close}>
      <div className="p-4">
        <VatsimSection onAddToPool={onAddToPool} cache={cache} setCache={setCache} />
      </div>
    </Tray>
  );
}
