// SetupTray.tsx — dock button 1 of 3. Everything "prepare" lives here in two
// sub-sections: SCENARIO (target rating + name/ILS/controllers/holdings) and
// NAVDATA (SCT/ESE/ramp data). Both sections are deck-native now.
import { Tray } from "../Tray";
import { Latch } from "../ui";
import { SetupSection } from "../SetupSection";
import { NavdataSection } from "../NavdataSection";

export function SetupTray(props: any) {
  const { open, close, scenario, onChange, positions, runways, waypoints, section, setSection } =
    props;
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
        <SetupSection
          scenario={scenario}
          onChange={onChange}
          positions={positions}
          runways={runways}
          waypoints={waypoints}
          toast={props.toast}
          onGoNavdata={() => setSection("navdata")}
        />
      ) : (
        <NavdataSection
          waypoints={waypoints}
          airports={props.airports}
          positions={positions}
          runways={runways}
          stars={props.stars}
          copx={props.copx}
          firBounds={props.firBounds}
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
