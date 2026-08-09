// PoolTray.tsx — deck adapter: hosts the classic AircraftPoolPanel inside the
// shared Tray shell, mapping DeckApp's deck-named callbacks onto the panel's
// classic prop names (onAddToBoard→onAddToScenario, onDeleteFromPool→
// onDelete). Panel internals keep their legacy slate-* styling — accepted for
// this milestone.
import { Tray } from "../Tray";
import { AircraftPoolPanel } from "../../panels/AircraftPoolPanel";

export function PoolTray({ open, close, pool, onDeleteFromPool, onAddToBoard, airac, onSetAirac, onImportPool }: any) {
  return (
    <Tray open={open} title="POOL — STAGED FLIGHT PLANS" onDone={close}>
      <AircraftPoolPanel
        pool={pool}
        onDelete={onDeleteFromPool}
        onAddToScenario={onAddToBoard}
        airac={airac}
        onSetAirac={onSetAirac}
        onImportPool={onImportPool}
      />
    </Tray>
  );
}
