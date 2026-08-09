// CommandDock.tsx — the FLIGHTDECK bottom bar, radically simple: three
// numbered buttons that ARE the workflow — 1 SETUP · 2 TRAFFIC · 3 EXPORT.
// Everything else lives inside those trays as sub-sections. The filename
// PLATE (attached to EXPORT) opens a popover with the ICAO_X.Y_CONFIGYY
// naming tokens and the pseudo-pilot settings; EXPORT is a never-dead lever
// that either ships the .scn or takes you to what's missing.
import { useState, useRef, useEffect, useCallback } from "react";
import { DeckKey, Latch, Cluster } from "./ui";

const Divider = () => <div className="w-px self-stretch bg-bd1 my-0.5" />;

// Module-scope so React keeps the same component type across renders (inputs
// inside would lose focus per keystroke otherwise).
function Field({ label, children }: any) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9.5px] font-bold tracking-[0.1em] text-tx8 select-none">{label}</label>
      {children}
    </div>
  );
}

const ip =
  "bg-panel border border-bd2 rounded-md px-2 py-[5px] text-[12px] font-mono text-tx1 outline-none transition-colors focus:border-cy-fg";

export function CommandDock({
  navLoaded,
  acCount,
  poolCount,
  tokens,
  setTokens,
  tokensSet,
  scnName,
  controllers,
  autoPP,
  setAutoPP,
  ppMode,
  setPpMode,
  ppList,
  setPpList,
  ppCustom,
  setPpCustom,
  lastExport,
  breathe,
  onOpenTray,
  onExport,
  toast,
}: any) {
  const [popOpen, setPopOpen] = useState(false);

  const popRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLButtonElement>(null);
  const icaoRef = useRef<HTMLInputElement>(null);
  const sweepTimer = useRef<any>(null);
  useEffect(() => () => clearTimeout(sweepTimer.current), []);

  // ---------- plate popover ----------
  const openPlate = useCallback((focusIcao: boolean) => {
    setPopOpen(true);
    if (focusIcao) setTimeout(() => icaoRef.current?.focus(), 60);
  }, []);

  useEffect(() => {
    if (!popOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || plateRef.current?.contains(t)) return;
      setPopOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Capture phase so the popover consumes Escape before the deck's
        // global handler starts closing trays underneath it.
        e.stopPropagation();
        setPopOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [popOpen]);

  // ---------- export (never-dead) ----------
  const doExport = async () => {
    if (acCount === 0) {
      toast("No aircraft yet — press BUILD TFC or FPLN POOL to feed the board", "warn");
      onOpenTray("build");
      return;
    }
    if (!tokensSet) {
      openPlate(true);
      return;
    }
    const ok = await onExport();
    if (ok) {
      const el = document.getElementById("dk-export");
      if (el) {
        el.classList.remove("dk-sweeping");
        void el.offsetWidth;
        el.classList.add("dk-sweeping");
        clearTimeout(sweepTimer.current);
        sweepTimer.current = setTimeout(() => el.classList.remove("dk-sweeping"), 700);
      }
    }
  };

  const exportReady = acCount > 0 && tokensSet;
  const staleList = ppList && !(controllers || []).some((c: any) => c.callsign === ppList);

  return (
    <div className="relative z-[60] flex-none min-h-[76px] flex items-center gap-4 px-4 py-2.5 bg-panel border-t border-bd1">
      <Cluster label="1 · PREPARE">
        <DeckKey
          size="lever"
          led={navLoaded}
          breathe={breathe === "setup"}
          onClick={() => onOpenTray("setup")}
          title="Scenario frame + navdata"
        >
          SETUP
        </DeckKey>
      </Cluster>
      <Divider />

      <Cluster label="2 · TRAFFIC">
        <DeckKey
          size="lever"
          badge={poolCount}
          onClick={() => onOpenTray("pool")}
          title="Real flight plans — SimBrief / VATSIM fetchers + the staging pool"
        >
          FPLN POOL
        </DeckKey>
        <DeckKey
          size="lever"
          badge={acCount}
          breathe={breathe === "build"}
          onClick={() => onOpenTray("build")}
          title="Generate traffic — ruleset · manual · ground"
        >
          BUILD TFC
        </DeckKey>
      </Cluster>
      <Divider />

      <Cluster label="3 · SHIP" className="ml-auto">
        <button
          ref={plateRef}
          onClick={() => (popOpen ? setPopOpen(false) : openPlate(false))}
          title="Filename tokens — ICAO_X.Y_CONFIGYY + pseudo-pilot"
          className={`h-11 inline-flex items-center px-[13px] font-mono text-[11px] font-bold tracking-[0.02em] rounded-lg bg-inset shadow-[inset_0_2px_4px_rgb(0_0_0/0.14)] transition-all border ${
            tokensSet
              ? "text-tx2 border-solid border-bd2 hover:border-bdh"
              : "text-am-fg border-dashed border-am-fg/55 hover:border-am-fg"
          } ${breathe === "plate" ? "dk-breathe" : ""}`}
        >
          {tokensSet ? scnName : "— SET NAME —"}
        </button>
        <DeckKey
          id="dk-export"
          size="lever"
          variant={exportReady ? "primary" : "fix"}
          breathe={breathe === "export"}
          onClick={doExport}
          className="min-w-[180px]"
          title="Ship the scenario (Ctrl+E)"
        >
          <span className="dk-sweep" />
          {acCount === 0 ? "FIX: NO AIRCRAFT" : !tokensSet ? "FIX: SET FILENAME" : `EXPORT ${scnName}`}
        </DeckKey>
      </Cluster>

      {/* ===== last-export tab ===== */}
      {lastExport && (
        <div className="absolute right-4 top-0 -translate-y-full z-[59] font-mono text-[9px] text-tx7 bg-panel border border-bd1 border-b-0 rounded-t-[7px] px-[9px] py-0.5 pointer-events-none select-none">
          ↳ {lastExport.path} · {lastExport.t}
        </div>
      )}

      {/* ===== plate popover ===== */}
      {popOpen && (
        <div
          ref={popRef}
          className="absolute bottom-[calc(100%+8px)] right-4 z-[120] w-[340px] bg-panel border border-bd3 rounded-xl shadow-[0_14px_38px_rgb(0_0_0/0.4)] p-3.5"
        >
          {/* live filename preview */}
          <div className="font-mono text-[12px] font-bold text-tx1 bg-inset border border-bd1 rounded-[7px] px-2.5 py-[7px] mb-3 text-center">
            {tokensSet ? scnName : "— incomplete —"}
          </div>
          {/* naming tokens — same semantics as the classic ExportPanel */}
          <div className="flex gap-2.5 items-end flex-wrap mb-3">
            <Field label="ICAO">
              <input
                ref={icaoRef}
                value={tokens.icao}
                onChange={(e) => setTokens({ ...tokens, icao: e.target.value.toUpperCase() })}
                placeholder="LFPG"
                maxLength={4}
                className={`${ip} w-[70px]`}
              />
            </Field>
            <Field label="VERSION X.Y">
              <input
                value={tokens.version}
                onChange={(e) => setTokens({ ...tokens, version: e.target.value })}
                placeholder="3.3"
                className={`${ip} w-[62px]`}
              />
            </Field>
            <Field label="CONFIG">
              <input
                value={tokens.config}
                onChange={(e) => setTokens({ ...tokens, config: e.target.value.toUpperCase() })}
                placeholder="WEST"
                className={`${ip} w-[76px]`}
              />
            </Field>
            <Field label="Nº">
              <input
                value={tokens.configNum}
                onChange={(e) => setTokens({ ...tokens, configNum: e.target.value })}
                placeholder="26"
                className={`${ip} w-[46px]`}
              />
            </Field>
          </div>
          {/* pseudo-pilot */}
          <div className="border-t border-bd1 pt-2.5 flex flex-col gap-2">
            <div className="text-[9.5px] font-bold tracking-[0.1em] text-tx8 select-none">
              MENTOR AS PSEUDO-PILOT
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Latch
                on={autoPP}
                onClick={() => setAutoPP(!autoPP)}
                title="Writes INITIALPSEUDOPILOT so the mentor's client controls every aircraft from session start"
              >
                {autoPP ? "ON" : "OFF"}
              </Latch>
              {autoPP && (
                <div className="flex gap-1 ml-1">
                  <Latch on={ppMode === "list"} onClick={() => setPpMode("list")} title="Pick from Setup controllers">
                    SETUP CTRL
                  </Latch>
                  <Latch on={ppMode === "custom"} onClick={() => setPpMode("custom")} title="Type a mentor callsign">
                    TYPED
                  </Latch>
                </div>
              )}
            </div>
            {!autoPP && (
              <p className="text-[10px] text-tx7">
                When ON, every aircraft starts under the mentor's control (INITIALPSEUDOPILOT in the .scn).
              </p>
            )}
            {autoPP &&
              (ppMode === "list" ? (
                (controllers || []).length || staleList ? (
                  <select value={ppList} onChange={(e) => setPpList(e.target.value)} className={`${ip} w-full`}>
                    <option value="">— pick a controller —</option>
                    {(controllers || []).map((c: any) => (
                      <option key={c.callsign} value={c.callsign}>
                        {c.callsign}
                        {c.freq ? ` · ${c.freq}` : ""}
                      </option>
                    ))}
                    {staleList && <option value={ppList}>{ppList} · no longer in Setup</option>}
                  </select>
                ) : (
                  <p className="text-[10.5px] text-tx6">
                    No controllers defined in SETUP — add them there, or switch to TYPED.
                  </p>
                )
              ) : (
                <input
                  value={ppCustom}
                  onChange={(e) => setPpCustom(e.target.value.toUpperCase())}
                  placeholder="LFPG_M_APP"
                  className={`${ip} w-[180px]`}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
