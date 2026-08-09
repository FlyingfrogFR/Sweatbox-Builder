// GroundTray.tsx — deck adapter: hosts the registered S1 ground generator
// panel (plugin registry id "S1") inside the shared Tray shell. Panel
// internals keep their legacy slate-* styling — accepted for this milestone.
import { useEffect, useRef } from "react";
import { Tray } from "../Tray";
import { getGenerators } from "../../generators";

export function GroundTray({ open, close, scenario, onChange, gates, pool, rampAgent, rampConfig, onGenerated }: any) {
  const gen = getGenerators().find((g) => g.id === "S1");
  const groundCount = (scenario.aircraft || []).filter((a: any) => a.groundMeta).length;

  // The classic GroundPanel merges generated aircraft into the scenario itself
  // and exposes no completion callback, so the deck's auto-close (DeckApp's
  // onGenerated) is driven by watching the groundMeta count: when it grows
  // while the tray is open, the panel's generate button just ran. A
  // regeneration that keeps the count equal or lower won't auto-close —
  // accepted; the DONE key stays one press away.
  const baseline = useRef(groundCount);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      // Tray just opened — whatever is on the board now is the baseline.
      baseline.current = groundCount;
    } else if (open && groundCount > baseline.current) {
      onGenerated(groundCount - baseline.current);
    }
    if (open) baseline.current = groundCount;
    wasOpen.current = open;
  }, [open, groundCount, onGenerated]);

  return (
    <Tray open={open} title="GROUND — S1 RAMP TRAFFIC" onDone={close}>
      {gen ? (
        gen.render({ scenario, onChange, gates, pool, rampAgent, rampConfig })
      ) : (
        <div className="p-6 text-sm text-tx7">S1 ground generator is not registered.</div>
      )}
    </Tray>
  );
}
