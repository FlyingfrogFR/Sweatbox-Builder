// NavdataTray.tsx — deck adapter: hosts the classic NavdataPanel inside the
// shared Tray shell. DeckApp's granular callbacks are mapped onto the panel's
// classic prop names (onParseSctData→onParseSct, onApplyNavBundle→
// onImportBundle, ...). Panel internals keep their legacy slate-* styling —
// accepted for this milestone (M2 cleanup).
import { Tray } from "../Tray";
import { NavdataPanel } from "../../panels/NavdataPanel";

export function NavdataTray({
  open,
  close,
  waypoints,
  airports,
  positions,
  runways,
  stars,
  copx,
  gates,
  navMeta,
  airac,
  onSetAirac,
  onParseSctData,
  onParseEseData,
  onResetSct,
  onResetEse,
  onApplyNavBundle,
  rampAgent,
  rampConfig,
  onLoadRampAgent,
  onLoadRampConfig,
  onResetRampAgent,
}: any) {
  return (
    <Tray open={open} title="NAVDATA — GROUND TRUTH" onDone={close}>
      <NavdataPanel
        waypoints={waypoints}
        airports={airports}
        positions={positions}
        runways={runways}
        stars={stars}
        copx={copx}
        gates={gates}
        navMeta={navMeta}
        airac={airac}
        onSetAirac={onSetAirac}
        onParseSct={onParseSctData}
        onParseEse={onParseEseData}
        onResetSct={onResetSct}
        onResetEse={onResetEse}
        onImportBundle={onApplyNavBundle}
        rampAgent={rampAgent}
        rampConfig={rampConfig}
        onLoadRampAgent={onLoadRampAgent}
        onLoadRampConfig={onLoadRampConfig}
        onResetRampAgent={onResetRampAgent}
      />
    </Tray>
  );
}
