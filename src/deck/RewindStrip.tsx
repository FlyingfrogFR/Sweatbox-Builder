// RewindStrip.tsx — the REWIND drop-down strip over the board: one snapchip
// per snapshot ("14:32 · before RUN RULES · 24 AC"), newest first. Restoring
// is DeckApp's job (it snapshots the present first, so REWIND never destroys).
import type { Snap } from "../state/slots";

export function RewindStrip({ snaps, onRestore }: { snaps: Snap[]; onRestore: (snap: Snap) => void }) {
  return (
    <div className="dk-rewind">
      {snaps.length ? (
        snaps.map((s, i) => (
          <button
            key={`${s.t}-${i}`}
            className="dk-snapchip"
            title={`Restore this snapshot (${s.aircraft.length} aircraft)`}
            onClick={() => onRestore(s)}
          >
            {new Date(s.t).toTimeString().slice(0, 5)} · {s.label} · {s.aircraft.length} AC
          </button>
        ))
      ) : (
        <span className="text-[11px] text-tx6">No snapshots yet — they are taken before every big action.</span>
      )}
    </div>
  );
}
