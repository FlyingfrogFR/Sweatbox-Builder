// UpdateDialog.tsx — the launch-time "a new version is available" prompt.
//
// It is the one modal in the deck: it covers the whole window (including the
// dock) because it is a decision about the app itself, not about the scenario
// underneath. Three ways out, and Escape is one of them — the update is an
// offer, never a gate.
//
// Tone contract: UPDATE NOW is the section's single commit lever (filled
// primary, rule 1); SKIP and LATER are neutral siblings. Nothing else is
// coloured — a version number is not a caution state.
import { useEffect, useRef, useState } from "react";
import { DeckKey } from "./ui";
import type { UpdateInfo, DownloadProgress } from "../net/updater";

export function UpdateDialog({
  info,
  onUpdate,
  onSkip,
  onLater,
}: {
  info: UpdateInfo;
  onUpdate: (onProgress: (p: DownloadProgress) => void) => Promise<void>;
  onSkip: () => void;
  onLater: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState("");
  const laterRef = useRef<HTMLButtonElement>(null);

  // Escape = LATER. Capture phase so the deck's global handler doesn't close a
  // tray underneath instead; ignored mid-install, when there is no going back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      e.stopPropagation();
      e.preventDefault();
      onLater();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy, onLater]);

  useEffect(() => {
    const t = setTimeout(() => laterRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await onUpdate(setProgress);
      // Reached only on macOS/Linux, and only if relaunch somehow returns.
    } catch (e: any) {
      setError(String(e?.message || e));
      setBusy(false);
    }
  };

  const pct = progress?.fraction != null ? Math.round(progress.fraction * 100) : null;
  const mb = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgb(0_0_0/0.55)] backdrop-blur-[2px] p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dk-update-title"
    >
      <div className="w-full max-w-[480px] bg-panel border border-bd3 rounded-xl shadow-[0_24px_60px_rgb(0_0_0/0.5)] overflow-hidden">
        <div className="px-4 py-3 border-b border-bd1 bg-inset flex items-center gap-2.5">
          <span
            id="dk-update-title"
            className="text-[11px] font-extrabold tracking-[0.12em] text-tx6"
          >
            UPDATE AVAILABLE
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[11px] text-tx7">
            {info.currentVersion && `${info.currentVersion} → `}
            <b className="text-cy-fg">{info.version}</b>
          </span>
        </div>

        <div className="px-4 py-3.5 flex flex-col gap-3">
          {info.notes ? (
            <div className="max-h-[220px] overflow-y-auto text-[12px] leading-[1.55] text-tx3 whitespace-pre-wrap break-words">
              {info.notes}
            </div>
          ) : (
            <p className="text-[12px] text-tx5">
              A newer version of Sweatbox Builder is ready to install.
            </p>
          )}

          {busy && (
            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 rounded-full bg-inset border border-bd1 overflow-hidden">
                <div
                  className={`h-full bg-cy-fg transition-[width] duration-150 ${pct == null ? "animate-pulse w-1/3" : ""}`}
                  style={pct == null ? undefined : { width: `${pct}%` }}
                />
              </div>
              <span className="font-mono text-[10.5px] text-tx7">
                {pct == null
                  ? "Downloading…"
                  : `Downloading ${pct}% · ${mb(progress!.downloaded)} of ${mb(progress!.total)}`}
              </span>
            </div>
          )}

          {error && (
            <div className="text-[11px] text-am-fg bg-inset border border-am-fg/40 rounded-md px-2.5 py-2">
              Update failed: {error}
              <div className="text-tx7 mt-1">
                You can keep using this version — download the new one from the Releases page
                instead.
              </div>
            </div>
          )}

          <p className="text-[10.5px] text-tx7">
            Your scenarios, navdata and pool stay exactly where they are — the update replaces the
            app only.
          </p>
        </div>

        <div className="px-4 py-3 border-t border-bd1 bg-inset flex items-center gap-2">
          <DeckKey
            size="sm"
            onClick={onSkip}
            disabled={busy}
            title={`Stay quiet until a version newer than ${info.version}`}
          >
            SKIP THIS VERSION
          </DeckKey>
          <span className="flex-1" />
          <DeckKey size="sm" onClick={onLater} disabled={busy} title="Ask again next launch (Esc)">
            LATER
          </DeckKey>
          <DeckKey
            variant="primary"
            onClick={start}
            disabled={busy}
            title="Download and install now"
          >
            {busy ? "UPDATING…" : "UPDATE NOW"}
          </DeckKey>
        </div>
      </div>
    </div>
  );
}
