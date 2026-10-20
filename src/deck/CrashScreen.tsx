// CrashScreen.tsx — the last line of defence. React unmounts the whole tree
// when a render throws, which to a mentor reads as "the app froze". This
// boundary shows what went wrong, offers a reload, and lets them download
// every saved scenario, the pool and the navdata as one rescue file before
// anything else is tried. It has no state of its own to lose.
import { Component, type ReactNode } from "react";
import { storage, KEYS } from "../state/storage";

/** Every sb:* key as stored — except the GitHub token, which is a credential
 *  and must never travel in a file a mentor may attach to a bug report. */
export function rescueBundle(): string {
  const data: Record<string, string | null> = {};
  for (const k of storage.keys())
    if (k.startsWith("sb:") && k !== KEYS.ghToken) data[k] = storage.raw(k);
  return JSON.stringify(
    { kind: "sweatbox-rescue", version: 1, exportedAt: new Date().toISOString(), data },
    null,
    2,
  );
}

function downloadRescue() {
  const blob = new Blob([rescueBundle()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sweatbox-rescue-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  private reloadRef: HTMLButtonElement | null = null;
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(_: any, prev: { error: Error | null }) {
    if (this.state.error && !prev.error) setTimeout(() => this.reloadRef?.focus(), 50);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message || this.state.error);
    return (
      <div
        className="fixed inset-0 bg-app text-tx1 flex items-center justify-center p-6"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dk-crash-title"
        data-crash-screen
      >
        <div className="w-full max-w-[560px] bg-panel border border-bd3 rounded-xl overflow-hidden">
          <div
            id="dk-crash-title"
            className="px-4 py-3 border-b border-bd1 bg-inset text-[11px] font-extrabold tracking-[0.12em] text-tx6"
          >
            SOMETHING WENT WRONG
          </div>
          <div className="px-4 py-3.5 flex flex-col gap-3 text-[12px] text-tx3 leading-snug">
            <p>
              The display hit an error and stopped. Your saved scenarios are still on this machine.
              Download a rescue copy first, then reload. If it happens again on the same scenario,
              attach the rescue file to a GitHub issue — it holds your scenarios, pool and navdata,
              and never your sign-in token.
            </p>
            <pre className="font-mono text-[10.5px] text-tx6 bg-inset border border-bd1 rounded-md p-2 whitespace-pre-wrap break-all max-h-[120px] overflow-auto">
              {msg}
            </pre>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2.5 border-t border-bd1 bg-inset">
            <button
              className="dk-key dk-sm"
              onClick={downloadRescue}
              title="Every saved scenario, the pool and the navdata as one JSON file — without your GitHub token"
            >
              DOWNLOAD RESCUE COPY
            </button>
            <span className="flex-1" />
            <button
              ref={(el) => {
                this.reloadRef = el;
              }}
              className="dk-key dk-primary"
              onClick={() => location.reload()}
            >
              RELOAD
            </button>
          </div>
        </div>
      </div>
    );
  }
}
