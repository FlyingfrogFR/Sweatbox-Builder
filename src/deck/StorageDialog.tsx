// StorageDialog.tsx — "STORAGE FULL" / "STORAGE UNAVAILABLE": the app's saved
// data lives in the webview's localStorage, which has a hard quota (about 5
// million characters). When a write is refused the shell shows this instead
// of carrying on as if it had saved — which is what it used to do, leaving
// slots listed with no data behind them.
//
// It covers the whole window like UpdateDialog: unsaved work is about the app,
// not about the scenario underneath. FREE SPACE drops every scenario's REWIND
// history — irreversible for all of them, so it is a hold-to-confirm key like
// every other wholesale clear on the deck (TONES rule 5); LATER is neutral and
// Escape is LATER. A store that refuses everything (disabled, private profile)
// is a different problem with different advice, so it gets its own wording.
import { useEffect, useRef } from "react";
import { HoldKey } from "./ui";
import type { StorageUsage } from "../state/storage";

/** "full" = the quota was hit; "unavailable" = the webview refuses to store at all. */
export type StorageReason = "full" | "unavailable";

const kb = (n: number) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : "0 KB");

export function StorageDialog({
  slot,
  usage,
  reason,
  result,
  onFreeSpace,
  onLater,
}: {
  slot: string;
  usage: StorageUsage;
  reason: StorageReason;
  result: string;
  onFreeSpace: () => void;
  onLater: () => void;
}) {
  const full = reason === "full";
  const laterRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onLater();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onLater]);
  useEffect(() => {
    const t = setTimeout(() => laterRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const rows: [string, number, string][] = [
    ["Saved scenarios", usage.scenarios, `${usage.slots} slot${usage.slots === 1 ? "" : "s"}`],
    [
      "REWIND snapshots",
      usage.snapshots,
      usage.snapshotKeys
        ? `${usage.snapshotKeys} slot${usage.snapshotKeys === 1 ? "" : "s"} — safe to drop`
        : "none",
    ],
    ["Navdata (SCT / ESE)", usage.navdata, "needed"],
    ["Flight-plan pool", usage.pool, ""],
    ["Other", usage.other, "preferences, tokens"],
  ];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgb(0_0_0/0.55)] backdrop-blur-[2px] p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dk-storage-title"
      data-storage-dialog
      data-storage-reason={reason}
    >
      <div className="w-full max-w-[520px] bg-panel border border-bd3 rounded-xl shadow-[0_24px_60px_rgb(0_0_0/0.5)] overflow-hidden">
        <div className="px-4 py-3 border-b border-bd1 bg-inset flex items-center gap-2.5">
          <span
            id="dk-storage-title"
            className="text-[11px] font-extrabold tracking-[0.12em] text-tx6"
          >
            {full ? "STORAGE FULL" : "STORAGE UNAVAILABLE"}
          </span>
          <span className="text-[10.5px] text-tx7 truncate">
            changes to <b className="text-tx4">{slot}</b> are not being saved
          </span>
        </div>
        <div className="px-4 py-3.5 flex flex-col gap-3 text-[12px] text-tx3 leading-snug">
          {full ? (
            <p>
              The app keeps everything in the browser-style storage of this machine, which is at its
              limit. Until space is freed nothing you change is kept: edits reopen as they were last
              saved, and NEW, CLONE, IMPORT and RENAME are refused.
            </p>
          ) : (
            <p>
              This machine's webview refuses to store anything — a private or locked-down profile,
              or storage switched off by policy. Nothing you change is kept. Export what you need as
              bundles from the rail (⋯ → EXPORT) and check the webview's storage settings; freeing
              space would not help.
            </p>
          )}
          {full && (
            <table className="w-full font-mono text-[11px]">
              <tbody>
                {rows.map(([label, n, note]) => (
                  <tr key={label} className="border-t border-rowdiv">
                    <td className="py-1 pr-2 text-tx5">{label}</td>
                    <td className="py-1 pr-2 text-right text-tx1 tabular-nums">{kb(n)}</td>
                    <td className="py-1 text-tx7">{note}</td>
                  </tr>
                ))}
                <tr className="border-t border-bd3">
                  <td className="py-1 pr-2 text-tx4 font-semibold">In use</td>
                  <td className="py-1 pr-2 text-right text-tx1 tabular-nums font-semibold">
                    {kb(usage.total)}
                  </td>
                  <td className="py-1 text-tx7">of roughly 5 MB</td>
                </tr>
              </tbody>
            </table>
          )}
          {full && (
            <p className="text-tx7 text-[11px]">
              {usage.snapshots
                ? "FREE SPACE (hold) drops every scenario's REWIND history — the one thing that is always safe to lose — and saves again. If that is not enough, export scenarios you want to keep as bundles, then delete them from the rail (⋯ → DELETE); a scenario's history goes with it."
                : "There is no REWIND history left to drop. Export scenarios you want to keep as bundles, then delete them from the rail (⋯ → DELETE)."}
            </p>
          )}
          {result && (
            <p className="text-[11.5px] text-tx4" data-storage-result>
              {result}
            </p>
          )}
        </div>
        <div className="flex-none flex items-center gap-2.5 px-4 py-2.5 border-t border-bd1 bg-inset">
          <span className="flex-1" />
          <button
            ref={laterRef}
            className="dk-key dk-sm"
            onClick={onLater}
            title="Close for now — the next refused save reopens this after a minute"
          >
            LATER
          </button>
          {full && usage.snapshots > 0 && (
            <HoldKey
              size="md"
              onHold={onFreeSpace}
              title="Hold to drop every REWIND snapshot and save again"
            >
              FREE SPACE
            </HoldKey>
          )}
        </div>
      </div>
    </div>
  );
}
