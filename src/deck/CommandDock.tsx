// CommandDock.tsx — the FLIGHTDECK bottom bar. Every deck verb is a physical
// keycap grouped into four silkscreened clusters (GROUND TRUTH · INTAKE ·
// BUILD · SHIP) separated by hairline dividers. The filename PLATE opens a
// popover holding the ICAO_X.Y_CONFIGYY naming tokens and the pseudo-pilot
// settings (same semantics as the classic ExportPanel); EXPORT is a
// never-dead lever that either ships the .scn or tells you exactly what to
// fix. Styling rides on deck.css (dk-*) + the index.css token system.
import { useState, useRef, useEffect, useCallback } from "react";
import { DeckKey, Latch, Cluster, pulse } from "./ui";

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
  poolCount,
  ruleCount,
  acCount,
  estRuleAc,
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
  output,
  lastExport,
  breathe,
  rating,
  onOpenTray,
  onAddAc,
  onRunRules,
  onRewind,
  onExport,
  toast,
}: any) {
  const [popOpen, setPopOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // While non-null, the RUN RULES label shows this animated count instead of
  // the static estimate (mockup's 0→N roll over ~300ms).
  const [runAnim, setRunAnim] = useState<number | null>(null);

  const popRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLButtonElement>(null);
  const icaoRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef(0);
  const runTimer = useRef<any>(null);
  const copyTimer = useRef<any>(null);
  const sweepTimer = useRef<any>(null);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(runTimer.current);
      clearTimeout(copyTimer.current);
      clearTimeout(sweepTimer.current);
    },
    [],
  );

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

  // ---------- key actions ----------
  const doCopy = () => {
    try {
      navigator.clipboard.writeText(output);
    } catch {}
    setCopied(true);
    pulse(document.getElementById("dk-copy"), "dk-pulse-ok");
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1200);
  };

  const doRunRules = () => {
    const n = onRunRules();
    if (typeof n !== "number") return; // no rules — the tray was opened instead
    pulse(document.getElementById("dk-runrules"), "dk-pulse-ok");
    cancelAnimationFrame(rafRef.current);
    clearTimeout(runTimer.current);
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / 300);
      setRunAnim(Math.round(n * p));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else runTimer.current = setTimeout(() => setRunAnim(null), 700);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const doExport = async () => {
    if (acCount === 0) {
      toast("No aircraft yet — feed the board first", "warn");
      pulse(document.getElementById("dk-export"), "dk-pulse-err");
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

  const runLabel =
    ruleCount === 0
      ? "NO RULES — DEFINE ONE ▸"
      : `RUN RULES · ${ruleCount} → ${runAnim !== null ? runAnim : estRuleAc}`;

  const exportReady = acCount > 0 && tokensSet;
  const staleList = ppList && !(controllers || []).some((c: any) => c.callsign === ppList);

  return (
    <div className="relative z-[60] flex-none min-h-[76px] flex items-center gap-3.5 px-3.5 py-2.5 bg-panel border-t border-bd1">
      {/* ===== GROUND TRUTH ===== */}
      <Cluster label="GROUND TRUTH">
        <DeckKey led={navLoaded} breathe={breathe === "navdata"} onClick={() => onOpenTray("navdata")} title="Navdata — SCT / ESE / ramp">
          NAVDATA
        </DeckKey>
        <DeckKey onClick={() => onOpenTray("setup")} title="Scenario setup — ILS, controllers, holdings">
          SETUP
        </DeckKey>
      </Cluster>
      <Divider />

      {/* ===== INTAKE ===== */}
      <Cluster label="INTAKE">
        <DeckKey onClick={() => onOpenTray("simbrief")} title="Pull a SimBrief OFP">SIMBRIEF</DeckKey>
        <DeckKey onClick={() => onOpenTray("vatsim")} title="Snapshot live VATSIM traffic">VATSIM</DeckKey>
        <DeckKey badge={poolCount} onClick={() => onOpenTray("pool")} title="Aircraft pool">
          POOL
        </DeckKey>
      </Cluster>
      <Divider />

      {/* ===== BUILD ===== */}
      <Cluster label="BUILD">
        <DeckKey onClick={onAddAc} title="Add one aircraft manually">ADD AC</DeckKey>
        <DeckKey
          breathe={breathe === "ground"}
          onClick={() => onOpenTray("ground")}
          title={rating === "S1" ? "Spawn ground traffic (S1)" : "Spawn ground traffic"}
        >
          GROUND
        </DeckKey>
        <DeckKey badge={ruleCount} onClick={() => onOpenTray("rules")} title="Traffic rules">
          RULES
        </DeckKey>
        <DeckKey
          id="dk-runrules"
          size="lever"
          variant={ruleCount === 0 ? "fix" : "default"}
          onClick={doRunRules}
          title="Regenerate all rule traffic (Ctrl+R)"
        >
          {runLabel}
        </DeckKey>
      </Cluster>
      <Divider />

      {/* ===== SHIP ===== */}
      <Cluster label="SHIP" className="ml-auto">
        <DeckKey onClick={onRewind} title="Snapshots — rewind the board">REWIND</DeckKey>
        <DeckKey id="dk-copy" onClick={doCopy} title="Copy the .scn text to the clipboard">
          {copied ? "COPIED ✓" : "COPY .SCN"}
        </DeckKey>
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

      {/* ===== last-export tab (mockup #lastExport) ===== */}
      {lastExport && (
        <div className="absolute right-4 top-0 -translate-y-full z-[59] font-mono text-[9px] text-tx7 bg-panel border border-bd1 border-b-0 rounded-t-[7px] px-[9px] py-0.5 pointer-events-none select-none">
          ↳ {lastExport.path} · {lastExport.t}
        </div>
      )}

      {/* ===== plate popover ===== */}
      {popOpen && (
        <div
          ref={popRef}
          className="absolute bottom-[calc(100%+8px)] right-[150px] z-[120] w-[340px] bg-panel border border-bd3 rounded-xl shadow-[0_14px_38px_rgb(0_0_0/0.4)] p-3.5"
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <Latch on={autoPP} onClick={() => setAutoPP(!autoPP)} title="Auto-assign initial pseudo pilot">
                AUTO-PP
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
