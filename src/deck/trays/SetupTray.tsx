// SetupTray.tsx — dock button 1 of 3. Everything "prepare" lives here in two
// sub-sections: SCENARIO (target rating + name/ILS/controllers/holdings) and
// NAVDATA (SCT/ESE/ramp data). Hosted panels keep their legacy styling —
// accepted for this milestone.
import { useState } from "react";
import { Tray } from "../Tray";
import { Latch, RATINGS } from "../ui";
import { SetupPanel } from "../../panels/SetupPanel";
import { NavdataSection } from "../NavdataSection";

export function SetupTray(props: any) {
  const {
    open,
    close,
    scenario,
    onChange,
    positions,
    runways,
    waypoints,
    section,
    setSection,
  } = props;
  const rating = scenario.rating || null;
  const navLoaded = (waypoints || []).length > 0;

  return (
    <Tray
      open={open}
      title="SETUP"
      onDone={close}
      headExtra={
        <span className="flex items-center gap-1.5 ml-1.5">
          <Latch on={section === "scenario"} onClick={() => setSection("scenario")}>
            SCENARIO
          </Latch>
          <Latch on={section === "navdata"} onClick={() => setSection("navdata")}>
            <span className={`dk-led ${navLoaded ? "dk-on" : ""}`} />
            NAVDATA
          </Latch>
        </span>
      }
    >
      {section === "scenario" ? (
        <>
          {!navLoaded && (
            /* navdata is the real prerequisite — route the user there first */
            <div className="flex items-center gap-2.5 px-6 py-2.5 border-b border-am-bd bg-am-bg text-[11.5px] text-am-fg">
              <span className="font-semibold">No navdata loaded</span>
              <span className="text-am-fg/80">— runway pickers, holdings and pre-entry offsets need your .sct/.ese first.</span>
              <button
                onClick={() => setSection("navdata")}
                className="ml-auto text-[10.5px] font-bold tracking-[0.06em] border border-am-fg/60 rounded-md px-2.5 py-1 hover:bg-am-fg/10"
              >
                LOAD NAVDATA →
              </button>
            </div>
          )}
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
        </>
      ) : (
        <NavdataSection
          waypoints={waypoints}
          airports={props.airports}
          positions={positions}
          runways={runways}
          stars={props.stars}
          copx={props.copx}
          gates={props.gates}
          navMeta={props.navMeta}
          airac={props.airac}
          onSetAirac={props.onSetAirac}
          onParseSct={props.onParseSctData}
          onParseEse={props.onParseEseData}
          onResetSct={props.onResetSct}
          onResetEse={props.onResetEse}
          onImportBundle={props.onApplyNavBundle}
          rampAgent={props.rampAgent}
          rampConfig={props.rampConfig}
          onLoadRampAgent={props.onLoadRampAgent}
          onLoadRampConfig={props.onLoadRampConfig}
          onResetRampAgent={props.onResetRampAgent}
          toast={props.toast}
        />
      )}
    </Tray>
  );
}
