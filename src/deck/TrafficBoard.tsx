// TrafficBoard.tsx — FLIGHTDECK center zone. Filter latches + CLEAR hold-keys
// in the header, the promoted SessionTimeline strip, then the aircraft table:
// sticky column header, zebra rows, origin chips (rule / GND / MANUAL) and
// hover actions. The forwarded ref lands on the scrollable rows container so
// the shell can pulse dk-board-sweep on slot switches and rewinds.
import { forwardRef, useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { uid } from "../core/uid";
import { sortByStart } from "../state/aircraft";
import { Latch, HoldKey, DeckKey } from "./ui";
import { SessionTimeline } from "./SessionTimeline";

const COLS = "grid grid-cols-[96px_46px_52px_minmax(0,1fr)_104px_54px_112px_92px] gap-x-2.5 items-center";

// Copied verbatim from src/panels/ScenarioPanel.tsx so both shells agree.
function RoleBadge({ dep }: { dep: boolean }) {
  return dep ? (
    <span className="text-[10px] font-semibold text-dep bg-[rgb(111_158_239_/_0.12)] border border-[rgb(111_158_239_/_0.24)] rounded-[5px] px-[7px] py-0.5">
      DEP
    </span>
  ) : (
    <span className="text-[10px] font-semibold text-arr bg-[rgb(232_116_110_/_0.12)] border border-[rgb(232_116_110_/_0.24)] rounded-[5px] px-[7px] py-0.5">
      ARR
    </span>
  );
}

const CHIP =
  "font-mono text-[9px] tracking-[0.03em] px-1.5 py-[2px] rounded-[5px] border justify-self-start max-w-full truncate";
const ACT =
  "w-6 h-6 rounded-md grid place-items-center text-tx6 hover:bg-bd2 hover:text-tx1 active:translate-y-px";

export const TrafficBoard = forwardRef<HTMLDivElement, any>(function TrafficBoard(
  { scenario, onChange, filter, setFilter, flashIds, onEdit, onOpenRule, onOpenTray, onSnapshot, onRewind, onAddAc, toast },
  ref,
) {
  const aircraft: any[] = scenario.aircraft || [];
  const [localFlash, setLocalFlash] = useState<Set<string>>(new Set());

  const arrCount = aircraft.filter((a) => !a.isDeparture).length;
  const depCount = aircraft.length - arrCount;
  const genCount = aircraft.filter((a) => a.ruleId).length;
  const gndCount = aircraft.filter((a) => a.groundMeta).length;

  const rows = useMemo(
    () =>
      sortByStart(
        aircraft.filter((a) => (filter === "all" ? true : filter === "arr" ? !a.isDeparture : a.isDeparture)),
      ),
    [aircraft, filter],
  );

  const ruleNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of scenario.rules || []) m.set(r.id, r.name);
    return m;
  }, [scenario.rules]);

  const clearGen = () => {
    onSnapshot("before CLEAR GEN");
    onChange({ ...scenario, aircraft: aircraft.filter((a) => !a.ruleId) });
    toast("Generated traffic cleared — REWIND is the backstop", "warn");
  };
  const clearGnd = () => {
    onSnapshot("before CLEAR GND");
    onChange({ ...scenario, aircraft: aircraft.filter((a) => !a.groundMeta) });
    toast("Ground traffic cleared — REWIND is the backstop", "warn");
  };

  const dup = (e: any, a: any) => {
    e.stopPropagation();
    const c = { ...a, id: uid(), callsign: a.callsign + "_2", ruleId: null, groundMeta: null };
    onChange({ ...scenario, aircraft: sortByStart([...aircraft, c]) });
    setLocalFlash(new Set([c.id]));
    toast(`Duplicated as <b class="font-mono">${c.callsign}</b>`, "ok");
  };
  const del = (e: any, a: any) => {
    e.stopPropagation();
    // Play the row-out flash, then drop it — no confirm, REWIND is the backstop.
    (e.currentTarget as HTMLElement).closest("[data-rowid]")?.classList.add("dk-row-out");
    window.setTimeout(() => {
      onChange((s: any) => ({ ...s, aircraft: s.aircraft.filter((x: any) => x.id !== a.id) }));
    }, 250);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* ===== header: filter latches + clear keys ===== */}
      <div className="flex-none flex items-center gap-2 bg-panel border-b border-bd1 px-3.5 py-2">
        <Latch on={filter === "all"} onClick={() => setFilter("all")} title="Show all aircraft">
          ALL <b className="font-mono">{aircraft.length}</b>
        </Latch>
        <Latch tone="arr" on={filter === "arr"} onClick={() => setFilter("arr")} title="Show arrivals only">
          ARR <b className="font-mono">{arrCount}</b>
        </Latch>
        <Latch tone="dep" on={filter === "dep"} onClick={() => setFilter("dep")} title="Show departures only">
          DEP <b className="font-mono">{depCount}</b>
        </Latch>
        <span className="flex-1" />
        {genCount > 0 && (
          <HoldKey onHold={clearGen} title="Hold to clear rule-generated aircraft">
            CLEAR GEN <span className="dk-badge">{genCount}</span>
          </HoldKey>
        )}
        {gndCount > 0 && (
          <HoldKey onHold={clearGnd} title="Hold to clear ground traffic">
            CLEAR GND <span className="dk-badge">{gndCount}</span>
          </HoldKey>
        )}
        <DeckKey size="sm" onClick={onRewind} title="Snapshots — rewind the board">
          REWIND
        </DeckKey>
      </div>

      {/* ===== session timeline (hidden when the board is empty) ===== */}
      <SessionTimeline aircraft={aircraft} />

      {/* ===== scrollable rows container (shell pulses dk-board-sweep here) ===== */}
      <div ref={ref} className="flex-1 min-h-0 overflow-y-auto">
        {aircraft.length === 0 ? (
          <div className="h-full min-h-[220px] flex items-center justify-center gap-[18px] p-6 flex-wrap">
            <button
              className="dk-ghost cursor-pointer hover:border-cy-fg/60 transition-colors"
              onClick={() => onOpenTray("build", "rules")}
            >
              <b>Import your syllabus ruleset</b>
              Load your training ruleset, then pull RUN RULES.
              <span className="block mt-2.5 text-[15px] text-cy-fg">↓</span>
              <span className="dk-kref">BUILD TFC → RULESET</span>
            </button>
            <button
              className="dk-ghost cursor-pointer hover:border-cy-fg/60 transition-colors"
              onClick={() => onOpenTray("pool")}
            >
              <b>Fetch real traffic</b>
              Pull a SimBrief OFP or live VATSIM pilots into the pool.
              <span className="block mt-2.5 text-[15px] text-cy-fg">↓</span>
              <span className="dk-kref">FPLN POOL</span>
            </button>
            <button className="dk-ghost cursor-pointer hover:border-cy-fg/60 transition-colors" onClick={onAddAc}>
              <b>Add one by hand</b>
              Drop a blank aircraft and type its plan.
              <span className="block mt-2.5 text-[15px] text-cy-fg">↓</span>
              <span className="dk-kref">BUILD TFC → MANUAL</span>
            </button>
          </div>
        ) : (
          <>
            <div
              className={`${COLS} sticky top-0 z-[5] bg-thead px-3.5 py-[5px] text-[9.5px] tracking-[0.1em] text-tx7 font-bold border-b border-bd1 select-none`}
            >
              <span>CALLSIGN</span>
              <span>ROLE</span>
              <span>TYPE</span>
              <span>ROUTE</span>
              <span>SPAWN</span>
              <span className="text-right">START</span>
              <span>ORIGIN</span>
              <span />
            </div>
            {rows.length === 0 && (
              <div className="px-3.5 py-10 text-center text-tx7 text-[12px]">
                No {filter === "arr" ? "ARR" : "DEP"} aircraft on the board — flip the filter latches above.
              </div>
            )}
            {rows.map((a: any, i: number) => (
              <div
                key={a.id}
                data-rowid={a.id}
                tabIndex={0}
                onClick={() => onEdit(a)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onEdit(a);
                }}
                className={`group relative cursor-pointer ${COLS} px-3.5 py-[7px] border-b border-bd1/60 text-[12px] ${
                  i % 2 === 1 ? "bg-panel/50" : ""
                } hover:bg-cy-fg/[0.07] ${flashIds?.has(a.id) || localFlash.has(a.id) ? "dk-row-in" : ""}`}
              >
                <span className="font-mono font-bold text-[12px] text-tx1 truncate">
                  {a.callsign || "—"}
                  {a.ruleId && (
                    <span className="text-cy-fg text-[9px] ml-1" title="rule-generated">
                      ●
                    </span>
                  )}
                  {a.groundMeta && (
                    <span className="text-am-fg text-[9px] ml-1" title="ground-generated">
                      ◆
                    </span>
                  )}
                </span>
                <span>
                  <RoleBadge dep={!!a.isDeparture} />
                </span>
                <span className="font-mono text-[11px] text-tx3 truncate">{a.type || "—"}</span>
                <span className="text-tx5 text-[11.5px] truncate" title={`${a.origin || "?"} → ${a.dest || "?"}`}>
                  {a.origin || "?"} → {a.dest || "?"}
                </span>
                <span className="font-mono text-[11px] text-tx3 truncate">
                  {a.spawnWaypoint || `${(+a.lat).toFixed(2)},${(+a.lon).toFixed(2)}`}
                  {(+a.preEntryNm || 0) > 0 ? ` -${a.preEntryNm}nm` : ""}
                </span>
                <span className="text-right font-mono text-[11px] text-tx3">
                  {a.start !== "" ? `T+${a.start}` : "—"}
                </span>
                {a.ruleId ? (
                  <button
                    title="Open this rule"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRule(a.ruleId);
                    }}
                    className={`${CHIP} text-left text-cy-fg border-cy-fg/40 hover:bg-cy-fg/10 cursor-pointer`}
                  >
                    ⚡ {ruleNames.get(a.ruleId) || "rule"}
                  </button>
                ) : a.groundMeta ? (
                  <span className={`${CHIP} text-am-fg border-am-fg/40 bg-am-bg/50`}>GND</span>
                ) : (
                  <span className={`${CHIP} text-tx6 border-bd2 bg-inset`}>MANUAL</span>
                )}
                <span className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    title="Edit"
                    className={ACT}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(a);
                    }}
                  >
                    <Icon name="edit" size={13} />
                  </button>
                  <button title="Duplicate" className={ACT} onClick={(e) => dup(e, a)}>
                    <Icon name="copy" size={13} />
                  </button>
                  <button title="Delete" className={`${ACT} hover:text-rd-fg`} onClick={(e) => del(e, a)}>
                    <Icon name="trash" size={13} />
                  </button>
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
});
