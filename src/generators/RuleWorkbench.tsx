// RuleWorkbench.tsx — "Generators · Direction B": a master/detail workbench for
// the rule-based generators (S3/C1). Session-overview timeline + rule list +
// inline detail pane with a produced-aircraft preview. The full rule editor
// (all ~30 fields) stays reachable via "Edit all fields".
import { useState, useMemo, useEffect, useRef, useDeferredValue } from "react";
import { Icon } from "../ui/Icon";
import { emptyRule } from "../core/model";
import { uid } from "../core/uid";
import { generateFromRule } from "../core/generateFromRule";
import { RuleEditor } from "./s3";

const PLANE_D =
  "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z";

function produce(
  rule: any,
  waypoints: any[],
  pool: any[],
  copx?: any[],
  boundaryFir?: string,
  firBounds?: any,
) {
  try {
    const r: any = generateFromRule(
      rule,
      waypoints,
      new Set<string>(),
      pool,
      copx,
      boundaryFir,
      firBounds,
    );
    return { aircraft: r.aircraft || [], error: r.error || null, warning: r.warning || null };
  } catch (e: any) {
    return { aircraft: [], error: String(e?.message || e), warning: null };
  }
}

function Timeline({ times, color, maxT }: { times: number[]; color: string; maxT: number }) {
  return (
    <div
      className="relative h-[22px]"
      style={{
        background:
          "linear-gradient(rgb(var(--bd1)),rgb(var(--bd1))) 0 50%/100% 1px no-repeat," +
          "linear-gradient(rgb(var(--bd2)),rgb(var(--bd2))) 33.33% 0/1px 100% no-repeat," +
          "linear-gradient(rgb(var(--bd2)),rgb(var(--bd2))) 66.66% 0/1px 100% no-repeat",
      }}
    >
      {times.map((t, i) => (
        <span
          key={i}
          className="absolute top-1/2"
          style={{
            left: `${maxT ? (t / maxT) * 100 : 0}%`,
            transform: "translate(-50%,-50%) rotate(90deg)",
            color,
            lineHeight: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d={PLANE_D} />
          </svg>
        </span>
      ))}
    </div>
  );
}

export function RuleWorkbench({
  mode,
  scenario,
  onChange,
  waypoints,
  pool,
  stars,
  copx,
  firBounds,
  runways,
  FullEditor,
}: any) {
  const Editor = FullEditor || RuleEditor;
  const allRules = scenario.rules || [];
  const rules = allRules.filter((r: any) => r.mode === mode);
  const [selectedId, setSelectedId] = useState<string | null>(rules[0]?.id ?? null);
  const [editingFull, setEditingFull] = useState<any>(null);

  // Keep a selection valid as rules change.
  useEffect(() => {
    if (!rules.find((r: any) => r.id === selectedId)) setSelectedId(rules[0]?.id ?? null);
  }, [rules.map((r: any) => r.id).join(","), selectedId]);

  const selected = rules.find((r: any) => r.id === selectedId) || null;

  // Editable draft of the selected rule. Edits COMMIT LIVE — debounced 300ms
  // for typing, flushed on blur/unmount, immediate for button toggles. The old
  // Save/Revert pair silently ate edits whenever the user left without
  // pressing the small Save button ("changes not memorized nor applied").
  // lastCommitted lets us ignore our own commit echoing back through props
  // without clobbering keys typed while the commit was in flight.
  const [draft, setDraft] = useState<any>(selected);
  const draftRef = useRef<any>(selected);
  draftRef.current = draft;
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;
  const lastCommitted = useRef<any>(null);
  const commitTimer = useRef<any>(null);
  useEffect(() => {
    if (selected && selected === lastCommitted.current) return; // our own echo
    setDraft(selected);
  }, [selectedId, selected]);

  const editingFullRef = useRef<any>(null);
  const commitNow = (next: any) => {
    clearTimeout(commitTimer.current);
    commitTimer.current = null;
    if (!next?.id) return;
    if (editingFullRef.current) return; // the full editor owns the rule now
    const sc = scenarioRef.current;
    if (!(sc.rules || []).some((r: any) => r.id === next.id)) return; // rule deleted meanwhile
    lastCommitted.current = next;
    onChange({ ...sc, rules: sc.rules.map((r: any) => (r.id === next.id ? next : r)) });
  };
  const flushCommit = () => {
    if (commitTimer.current) commitNow(draftRef.current);
  };
  // Flush (not drop) a pending commit if the workbench unmounts mid-edit.
  useEffect(() => () => flushCommit(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (f: string, v: any, immediate = false) => {
    setDraft((d: any) => {
      const next = { ...d, [f]: v };
      clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => commitNow(next), immediate ? 0 : 300);
      return next;
    });
  };

  const writeRules = (next: any[]) => onChange({ ...scenarioRef.current, rules: next });
  const newRule = () => {
    const r = { ...emptyRule(), mode, name: `New ${mode} rule` };
    writeRules([...allRules, r]);
    setSelectedId(r.id);
  };
  const duplicate = (r: any) => {
    const c = { ...r, id: uid(), name: `${r.name} copy` };
    writeRules([...allRules, c]);
    setSelectedId(c.id);
  };
  const remove = (id: string) => {
    if (!confirm("Remove rule and its generated aircraft?")) return;
    onChange({
      ...scenario,
      rules: allRules.filter((r: any) => r.id !== id),
      aircraft: scenario.aircraft.filter((a: any) => a.ruleId !== id),
    });
  };
  const saveFull = (r: any) => {
    editingFullRef.current = null;
    writeRules(allRules.filter((x: any) => x.id !== r.id).concat({ ...r, mode: r.mode || mode }));
    setDraft({ ...r, mode: r.mode || mode }); // keep the inline pane in sync
    setEditingFull(null);
  };

  // Produced-aircraft preview for the (draft of the) selected rule. Deferred
  // so each keystroke in the detail inputs doesn't synchronously re-run
  // generateFromRule (linear navdata scan + pool filtering) — the preview
  // catches up a frame later with identical results.
  const deferredDraft = useDeferredValue(draft);
  const preview = useMemo(
    () =>
      deferredDraft
        ? produce(deferredDraft, waypoints, pool, copx, scenario.boundaryFir, firBounds)
        : { aircraft: [], error: null, warning: null },
    [deferredDraft, waypoints, pool, copx, scenario.boundaryFir, firBounds],
  );

  // Session overview: produce every saved rule of this mode, split by direction.
  // Keyed on the full rule content — any saved field can change the produced
  // aircraft (direction, scheduling mode, pool filters, …), so a partial key
  // left the timeline and per-rule counts stale after some edits.
  const rulesKey = JSON.stringify(rules);
  const session = useMemo(() => {
    const arr: number[] = [];
    const dep: number[] = [];
    let maxT = 0;
    const counts: Record<string, number> = {};
    for (const r of rules) {
      const { aircraft } = produce(r, waypoints, pool, copx, scenario.boundaryFir, firBounds);
      counts[r.id] = aircraft.length;
      maxT = Math.max(maxT, (+r.startOffset || 0) + (+r.duration || 0));
      for (const a of aircraft) (a.isDeparture ? dep : arr).push(+a.start || 0);
    }
    return { arr, dep, maxT: maxT || 45, counts, total: arr.length + dep.length };
  }, [rulesKey, waypoints, pool, copx, scenario.boundaryFir, firBounds]);

  const ticks = [0, 0.3333, 0.6666, 1].map((f) => Math.round(session.maxT * f));

  // C1 only: bind the SCENARIO (not the rules — rulesets stay FIR-agnostic and
  // portable) to a FIR. Options = unique destination FIRs of the parsed
  // FIR_COPX entries; auto-boundary rules spawn each aircraft at the gate
  // where its own route enters this FIR.
  const firs = useMemo(() => {
    const s = new Set<string>();
    for (const f of Object.keys(firBounds || {})) s.add(f);
    for (const c of copx || []) if (c.kind === "fir" && c.toFir) s.add(c.toFir);
    return [...s].sort();
  }, [copx, firBounds]);
  // What the generator will actually use for this FIR: sector geometry traced
  // from the ESE (exact crossing points) beats published FIR_COPX gates.
  const firSource = useMemo(() => {
    const f = scenario.boundaryFir;
    if (!f) return "";
    const segs = (firBounds || {})[f]?.length || 0;
    if (segs) return `· boundary traced from ESE · ${segs} segments`;
    const gates = new Set(
      (copx || []).filter((c: any) => c.kind === "fir" && c.toFir === f).map((c: any) => c.fix),
    ).size;
    return gates ? `· ${gates} published entry gates` : "· no geometry or gates for this FIR";
  }, [copx, firBounds, scenario.boundaryFir]);

  const lb = "block text-[9.5px] tracking-[0.1em] text-tx7 mb-[5px]";
  const ip =
    "w-full bg-inset border border-bd3 rounded-md px-2.5 py-2 text-[12.5px] text-tx1 font-mono focus:border-cy-fg focus:outline-none";

  return (
    <div className="relative flex flex-col h-full">
      {/* SESSION OVERVIEW */}
      <div className="px-[18px] py-[13px] bg-panel border-b border-bd1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[10.5px] font-semibold tracking-[0.16em] text-tx6">
              SESSION OVERVIEW
            </span>
            <span className="font-mono text-[10.5px] text-tx8">{mode} rules combined</span>
            {mode === "C1" &&
              (firs.length ? (
                <span className="flex items-center gap-1.5 ml-2">
                  <span className="text-[9.5px] font-semibold tracking-[0.12em] text-tx7">
                    SCENARIO FIR
                  </span>
                  <select
                    value={scenario.boundaryFir || ""}
                    onChange={(e) =>
                      onChange({ ...scenarioRef.current, boundaryFir: e.target.value })
                    }
                    className="bg-inset border border-bd3 rounded-md px-1.5 py-1 text-[11px] font-mono text-tx1 focus:border-cy-fg focus:outline-none"
                    title="FIR this session is bound to — auto-boundary rules spawn each aircraft at the gate where its own route enters this FIR"
                  >
                    <option value="">— select —</option>
                    {firs.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  {scenario.boundaryFir && (
                    <span className="font-mono text-[10.5px] text-tx7">{firSource}</span>
                  )}
                </span>
              ) : (
                <span className="ml-2 text-[10.5px] text-tx7">
                  load an ESE (SETUP → NAVDATA) to enable auto-boundary spawns
                </span>
              ))}
          </div>
          <div className="flex items-center gap-[15px] font-mono text-[11px] text-tx5">
            <span className="flex items-center gap-1.5 text-arr">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ transform: "rotate(90deg)" }}
              >
                <path d={PLANE_D} />
              </svg>
              ARR {session.arr.length}
            </span>
            <span className="flex items-center gap-1.5 text-dep">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ transform: "rotate(90deg)" }}
              >
                <path d={PLANE_D} />
              </svg>
              DEP {session.dep.length}
            </span>
            <span className="text-tx7">
              {session.total} aircraft · {session.maxT} min
            </span>
          </div>
        </div>
        <div className="grid grid-cols-[40px_1fr] gap-y-[7px] items-center">
          <span className="text-[9px] font-mono text-arr">ARR</span>
          <Timeline times={session.arr} color="rgb(var(--arr))" maxT={session.maxT} />
          <span className="text-[9px] font-mono text-dep">DEP</span>
          <Timeline times={session.dep} color="rgb(var(--dep))" maxT={session.maxT} />
          <span />
          <div className="relative h-[13px] font-mono text-[9px] text-tx7">
            {ticks.map((tk, i) => (
              <span
                key={i}
                className="absolute"
                style={
                  i === 0
                    ? { left: 0 }
                    : i === ticks.length - 1
                      ? { right: 0 }
                      : {
                          left: `${(i / (ticks.length - 1)) * 100}%`,
                          transform: "translateX(-50%)",
                        }
                }
              >
                T+{tk}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* MASTER / DETAIL */}
      <div className="flex-1 grid grid-cols-[330px_1fr] min-h-0">
        {/* LIST */}
        <div className="border-r border-bd1 flex flex-col bg-rail min-h-0">
          <div className="flex items-center justify-between px-4 pt-[14px] pb-[11px]">
            <span className="text-[10.5px] font-semibold tracking-[0.16em] text-tx6">
              RULES · {rules.length}
            </span>
            <button
              onClick={newRule}
              className="flex items-center gap-1.5 text-[11px] text-tx3 bg-btn2 border border-bd4 hover:border-bdh rounded-md px-2.5 py-1.5"
            >
              <Icon name="plus" size={12} />
              New
            </button>
          </div>
          <div className="flex-1 overflow-auto px-3 pb-3 flex flex-col gap-[7px]">
            {rules.map((r: any) => {
              const sel = r.id === selectedId;
              const dir = r.isDeparture ? "text-dep" : "text-arr";
              const badge = r.isDeparture
                ? "text-dep bg-[rgb(111_158_239_/_0.13)]"
                : "text-arr bg-[rgb(232_116_110_/_0.13)]";
              const cadence =
                r.schedulingMode === "separation" ? `${r.nmSeparation || 10}NM` : `${r.rate}/hr`;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`relative text-left rounded-[9px] px-3.5 py-3 ${
                    sel
                      ? "bg-cy-soft border border-cy-bd"
                      : "bg-panel border border-bd2 hover:border-bd4"
                  }`}
                >
                  {sel && (
                    <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-[2px] bg-cy-fg" />
                  )}
                  <div className="flex items-center gap-2 mb-[9px]">
                    <span className={dir}>
                      <Icon name="zap" size={13} />
                    </span>
                    <span
                      className={`text-[13px] font-semibold ${sel ? "text-tx1" : "text-tx2"} truncate`}
                    >
                      {r.name}
                    </span>
                    <span
                      className={`ml-auto text-[10px] font-semibold rounded-[5px] px-[7px] py-0.5 ${badge}`}
                    >
                      {r.isDeparture ? "DEP" : "ARR"}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono text-[10.5px] text-tx7">
                    <span>
                      {r.rwyInUse || r.runway || "—"} · {cadence} · {r.duration}m
                    </span>
                    <span className={sel ? "text-cy-fg" : "text-tx3"}>
                      {session.counts[r.id] ?? 0} ac
                    </span>
                  </div>
                </button>
              );
            })}
            {!rules.length && (
              <div className="text-[12px] text-tx7 text-center py-8">
                No {mode} rules yet. Click <span className="text-tx3">New</span>.
              </div>
            )}
          </div>
        </div>

        {/* DETAIL — onBlur flushes the pending commit, so clicking anything
            (RUN RULES, DONE, another rule) right after typing never races the
            300ms debounce. */}
        <div className="overflow-auto p-[20px_22px] dotgrid min-h-0" onBlur={flushCommit}>
          {!draft ? (
            <div className="text-[13px] text-tx7 text-center py-16">
              Select or create a rule to edit it.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-[11px] mb-4">
                <span className={draft.isDeparture ? "text-dep" : "text-arr"}>
                  <Icon name="zap" size={17} />
                </span>
                <span className="text-[16px] font-semibold text-tx1 truncate">
                  {draft.name} — {draft.rwyInUse || draft.runway || "—"}
                </span>
                <span
                  className={`text-[10px] font-semibold rounded-[5px] px-[7px] py-0.5 border ${
                    draft.isDeparture
                      ? "text-dep bg-[rgb(111_158_239_/_0.12)] border-[rgb(111_158_239_/_0.24)]"
                      : "text-arr bg-[rgb(232_116_110_/_0.12)] border-[rgb(232_116_110_/_0.24)]"
                  }`}
                >
                  {draft.isDeparture ? "DEP" : "ARR"}
                </span>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => duplicate(selected)}
                    className="text-[11.5px] text-tx3 bg-btn2 border border-bd4 hover:border-bdh rounded-md px-3 py-[7px]"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => remove(draft.id)}
                    className="text-[11.5px] text-rd-fg bg-btn2 border border-bd4 hover:border-bdh rounded-md px-3 py-[7px]"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* core params */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <label className={lb}>RULE NAME</label>
                  <input
                    className={ip}
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>
                <div>
                  <label className={lb}>ENTRY FIX</label>
                  <input
                    className={ip}
                    value={draft.spawnWaypoint}
                    onChange={(e) => set("spawnWaypoint", e.target.value.toUpperCase())}
                  />
                </div>
                <div>
                  <label className={lb}>HOME ICAO</label>
                  <input
                    className={ip}
                    value={draft.homeIcao ?? ""}
                    onChange={(e) => set("homeIcao", e.target.value.toUpperCase())}
                    placeholder={draft.isDeparture ? "departs from" : "lands at"}
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className={lb}>RUNWAY</label>
                  <input
                    className={ip}
                    value={draft.rwyInUse}
                    onChange={(e) => set("rwyInUse", e.target.value.toUpperCase())}
                  />
                </div>
                <div>
                  <label className={lb}>RATE /HR</label>
                  <input
                    type="number"
                    className={ip}
                    value={draft.rate}
                    onChange={(e) => set("rate", +e.target.value)}
                  />
                </div>
                <div>
                  <label className={lb}>DURATION (min)</label>
                  <input
                    type="number"
                    className={ip}
                    value={draft.duration}
                    onChange={(e) => set("duration", +e.target.value)}
                  />
                </div>
                <div>
                  <label className={lb}>TIMING</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => set("timingMode", "regular", true)}
                      title="Evenly spaced across the window"
                      className={`flex-1 text-[10.5px] font-semibold px-2 py-2 rounded-md border ${
                        draft.timingMode !== "random"
                          ? "bg-cy-soft border-cy-bd text-cy-fg"
                          : "bg-inset border-bd3 text-tx5 hover:text-tx3"
                      }`}
                    >
                      REGULAR
                    </button>
                    <button
                      onClick={() => set("timingMode", "random", true)}
                      title="Same aircraft count, random spawn times — never under 2 min apart"
                      className={`flex-1 text-[10.5px] font-semibold px-2 py-2 rounded-md border ${
                        draft.timingMode === "random"
                          ? "bg-cy-soft border-cy-bd text-cy-fg"
                          : "bg-inset border-bd3 text-tx5 hover:text-tx3"
                      }`}
                    >
                      RANDOM ≥2′
                    </button>
                  </div>
                </div>
                <div>
                  <label className={lb}>SEPARATION (NM)</label>
                  <input
                    type="number"
                    className={ip}
                    value={draft.nmSeparation}
                    onChange={(e) => set("nmSeparation", +e.target.value)}
                  />
                </div>
                <div className="col-span-3">
                  <label className={lb}>TYPES</label>
                  <input
                    className={ip}
                    value={draft.typePool}
                    onChange={(e) => set("typePool", e.target.value)}
                  />
                </div>
              </div>

              {/* produced aircraft */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold tracking-[0.14em] text-tx6">
                  PRODUCED AIRCRAFT
                </span>
                <button
                  onClick={() => {
                    flushCommit();
                    editingFullRef.current = draft;
                    setEditingFull(draft);
                  }}
                  className="text-[11px] text-cy-fg hover:underline"
                >
                  Edit all fields →
                </button>
              </div>
              {preview.warning && !preview.error && (
                <div className="text-[11px] text-am-fg bg-am-bg border border-am-bd rounded-lg px-3 py-2 font-mono mb-2">
                  {preview.warning}
                </div>
              )}
              {preview.error ? (
                <div className="text-[11.5px] text-am-fg bg-am-bg border border-am-bd rounded-lg p-3 font-mono">
                  {preview.error}
                </div>
              ) : (
                <div className="border border-bd2 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-4 bg-thead px-[13px] py-[7px] text-[9px] tracking-[0.1em] text-tx7 font-semibold">
                    <span>CALLSIGN</span>
                    <span>TYPE</span>
                    <span>ENTRY</span>
                    <span className="text-right">SPAWN</span>
                  </div>
                  {preview.aircraft.slice(0, 6).map((a: any, i: number) => (
                    <div
                      key={a.id || i}
                      className={`grid grid-cols-4 px-[13px] py-[7px] border-t border-rowdiv font-mono text-[11.5px] ${i % 2 === 1 ? "bg-inset" : ""}`}
                    >
                      <span className="text-tx2 font-semibold truncate">{a.callsign}</span>
                      <span className="text-tx3">{a.type}</span>
                      <span className="text-cy-fg">{a.spawnWaypoint || "—"}</span>
                      <span className="text-right text-tx3">T+{a.start}</span>
                    </div>
                  ))}
                  {preview.aircraft.length > 6 && (
                    <div className="px-[13px] py-[7px] border-t border-rowdiv font-mono text-[11.5px] text-tx6">
                      + {preview.aircraft.length - 6} more
                    </div>
                  )}
                  {!preview.aircraft.length && (
                    <div className="px-[13px] py-3 text-center text-[11.5px] text-tx7">
                      No aircraft produced
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end items-center gap-2 mt-4 font-mono text-[10px] text-tx7 select-none">
                <span className="w-[6px] h-[6px] rounded-full bg-gn-fg/70" />
                changes save automatically
              </div>
            </>
          )}
        </div>
      </div>

      {editingFull && FullEditor ? (
        <div className="absolute inset-0 z-40 bg-panel">
          <FullEditor
            rule={editingFull}
            waypoints={waypoints}
            pool={pool}
            stars={stars}
            copx={copx}
            runways={runways}
            scenarioIls={scenario.ils}
            onSave={saveFull}
            onCancel={() => {
              editingFullRef.current = null;
              setEditingFull(null);
            }}
          />
        </div>
      ) : editingFull ? (
        <Editor
          rule={editingFull}
          waypoints={waypoints}
          pool={pool}
          stars={stars}
          copx={copx}
          runways={runways}
          scenarioIls={scenario.ils}
          onSave={saveFull}
          onCancel={() => {
            editingFullRef.current = null;
            setEditingFull(null);
          }}
        />
      ) : null}
    </div>
  );
}
