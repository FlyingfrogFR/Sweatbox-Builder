// FplnPoolTray.tsx — the FPLN POOL dock button: real flight plans in, staged
// in the pool, then onto the board. SimBrief + VATSIM fetchers sit above the
// pool table so fetch → pool → board happens on one page. Hosted panels keep
// their legacy styling — accepted for this milestone.
import { Tray } from "../Tray";
import { SimBriefSection, VatsimSection } from "../../panels/FlightPlansPanel";
import { AircraftPoolPanel } from "../../panels/AircraftPoolPanel";

export function FplnPoolTray(props: any) {
  const {
    open,
    close,
    pool,
    simbriefCache,
    setSimbriefCache,
    vatsimCache,
    setVatsimCache,
    onAddToPool,
    onDeleteFromPool,
    poolAirac,
    onSetPoolAirac,
    onImportPool,
    onAddToBoard,
  } = props;

  return (
    <Tray
      open={open}
      title="FPLN POOL"
      onDone={close}
      headExtra={
        <span className="text-[10px] text-tx7 ml-1.5">
          real flight plans — fetch, stage, send to the board
        </span>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 border-b border-bd1">
        <div className="min-w-0">
          <SimBriefSection onAddToPool={onAddToPool} cache={simbriefCache} setCache={setSimbriefCache} />
        </div>
        <div className="min-w-0">
          <VatsimSection onAddToPool={onAddToPool} cache={vatsimCache} setCache={setVatsimCache} />
        </div>
      </div>
      <AircraftPoolPanel
        pool={pool}
        onDelete={onDeleteFromPool}
        onAddToScenario={onAddToBoard}
        airac={poolAirac}
        onSetAirac={onSetPoolAirac}
        onImportPool={onImportPool}
      />
    </Tray>
  );
}
