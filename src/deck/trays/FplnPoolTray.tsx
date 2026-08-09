// FplnPoolTray.tsx — the FPLN POOL dock button: real flight plans in, staged
// in the pool, then onto the board. The fetchers are SUB-SECTIONS (top
// latches), not inline blocks — a 50-departure fetch would make one long
// page unreadable. Land on POOL when it has entries, else on SIMBRIEF.
// Hosted panels keep their legacy styling — accepted for this milestone.
import { useState, useEffect } from "react";
import { Tray } from "../Tray";
import { Latch } from "../ui";
import { SimBriefSection, VatsimSection } from "../../panels/FlightPlansPanel";
import { AircraftPoolPanel } from "../../panels/AircraftPoolPanel";

type Section = "simbrief" | "vatsim" | "pool";

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

  const [section, setSection] = useState<Section>("pool");
  // On open, land where the work is: the pool if it's stocked, else a fetcher.
  useEffect(() => {
    if (open) setSection((pool || []).length ? "pool" : "simbrief");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Tray
      open={open}
      title="FPLN POOL"
      onDone={close}
      headExtra={
        <span className="flex items-center gap-1.5 ml-1.5">
          <Latch on={section === "simbrief"} onClick={() => setSection("simbrief")} title="Fetch a SimBrief OFP into the pool">
            SIMBRIEF
          </Latch>
          <Latch on={section === "vatsim"} onClick={() => setSection("vatsim")} title="Snapshot live VATSIM traffic into the pool">
            VATSIM
          </Latch>
          <span className="w-px self-stretch bg-bd1 mx-1" />
          <Latch on={section === "pool"} onClick={() => setSection("pool")} title="The staged flight plans — send them to the board">
            POOL {(pool || []).length > 0 && <b className="font-mono">{(pool || []).length}</b>}
          </Latch>
        </span>
      }
    >
      {section === "simbrief" && (
        <SimBriefSection onAddToPool={onAddToPool} cache={simbriefCache} setCache={setSimbriefCache} />
      )}
      {section === "vatsim" && (
        <VatsimSection onAddToPool={onAddToPool} cache={vatsimCache} setCache={setVatsimCache} />
      )}
      {section === "pool" && (
        <AircraftPoolPanel
          pool={pool}
          onDelete={onDeleteFromPool}
          onAddToScenario={onAddToBoard}
          airac={poolAirac}
          onSetAirac={onSetPoolAirac}
          onImportPool={onImportPool}
        />
      )}
    </Tray>
  );
}
