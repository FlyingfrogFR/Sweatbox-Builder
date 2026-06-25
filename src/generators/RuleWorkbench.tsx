// RuleWorkbench.tsx — "Generators · Direction B": a master/detail workbench for
// the rule-based generators (S3/C1). Session-overview timeline + rule list +
// inline detail pane with a produced-aircraft preview. The full rule editor
// (all ~30 fields) stays reachable via "Edit all fields".
import { useState, useMemo, useEffect } from "react";
import { Icon } from "../ui/Icon";
import { emptyRule } from "../core/model";
import { uid } from "../core/uid";
import { generateFromRule } from "../core/generateFromRule";
import { RuleEditor } from "./s3";

const PLANE_D =
  "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z";

function produce(rule: any, waypoints: any[], pool: any[]) {
  try {
    const r = generateFromRule(rule, waypoints, new Set<string>(), pool);
    return { aircraft: r.aircraft || [], error: r.error || null };
  } catch (e: any) {
    return { aircraft: [], error: String(e?.message || e) };
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

export function RuleWorkbench({ mode, scenario, onChange, waypoints, pool, stars, copx }: any) {
  const allRules = scenario.rules || [];
  const rules = allRules.filter((r: any) => r.mode === mode);
  const [selectedId, setSelectedId] = useState<string | null>(rules[0]?.id ?? null);
  const [editingFull, setEditingFull] = useState<any>(null);

  // Keep a selection valid as rules change.
  useEffect(() => {
    if (!rules.find((r: any) => r.id === selectedId)) setSelectedId(rules[0]?.id ?? null);
  }, [rules.map((r: any) => r.id).join(","), selectedId]);

  const selected = rules.find((r: any) => r.id === selectedId) || null;

  // Editable draft of the selected rule (Save / Revert).
  const [draft, setDraft] = useState<any>(selected);
  useEffect(() => setDraft(selected), [selectedId, selected]);
  const set = (f: string, v: any) => setDraft((d: any) => ({ ...d, [f]: v }));

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(selected), [draft, selected]);

  const writeRules = (next: any[]) => onChange({ ...scenario, rules: next });

  const saveDraft = () => {
    if (!draft) return;
    writeRules(allRules.map((r: any) => (r.id === draft.id ? draft : r)));
  };
  const revertDraft = () => setDraft(selected);
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
    writeRules(allRules.filter((x: any) => x.id !== r.id).concat({ ...r, mode: r.mode || mode }));
    setEditingFull(null);
  };

  // Produced-aircraft preview for the (draft of the) selected rule.
  const preview = useMemo(
    () => (draft ? produce(draft, waypoints, pool) : { aircraft: [], error: null }),
    [draft, waypoints, pool],
  );

  // Session overview: produce every saved rule of this mode, split by direction.
  const session = useMemo(() => {
    const arr: number[] = [];
    const dep: number[] = [];
    let maxT = 0;
    const counts: Record<string, number> = {};
    for (const r of rules) {
      const { aircraft } = produce(r, waypoints, pool);
      counts[r.id] = aircraft.length;
      maxT = Math.max(maxT, (+r.startOffset || 0) + (+r.duration || 0));
      for (const a of aircraft) (a.isDeparture ? dep : arr).push(+a.start || 0);
    }
    return { arr, dep, maxT: maxT || 45, counts, total: arr.length + dep.length };
  }, [rules.map((r: any) => r.id + ":" + r.rate + ":" + r.duration + ":" + r.startOffset + ":" + r.spawnWaypoint).join("|"), waypoints, pool]);

  const ticks = [0, 0.3333, 0.6666, 1].map((f) => Math.round(session.maxT * f));

  const lb = "block text-[9.5px] tracking-[0.1em] text-tx7 mb-[5px]";
  const ip =
    "w-full bg-inset border border-bd3 rounded-md px-2.5 py-2 text-[12.5px] text-tx1 font-mono focus:border-cy-fg focus:outline-none";

  return (
    <div className="flex flex-col h-full">
      {/* SESSION OVERVIEW */}
      <div className="px-[18px] py-[13px] bg-panel border-b border-bd1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[10.5px] font-semibold tracking-[0.16em] text-tx6">SESSION OVERVIEW</span>
            <span className="font-mono text-[10.5px] text-tx8">{mode} rules combined</span>
          </div>
          <div className="flex items-center gap-[15px] font-mono text-[11px] text-tx5">
            <span className="flex items-center gap-1.5 text-arr">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ transform: "rotate(90deg)" }}>
                <path d={PLANE_D} />
              </svg>
              ARR {session.arr.length}
            </span>
            <span className="flex items-center gap-1.5 text-dep">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ transform: "rotate(90deg)" }}>
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
                      : { left: `${(i / (ticks.length - 1)) * 100}%`, transform: "translateX(-50%)" }
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
            <span className="text-[10.5px] font-semibold tracking-[0.16em] text-tx6">RULES · {rules.length}</span>
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
              const cadence = r.schedulingMode === "separation" ? `${r.nmSeparation || 10}NM` : `${r.rate}/hr`;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`relative text-left rounded-[9px] px-3.5 py-3 ${
                    sel ? "bg-cy-soft border border-cy-bd" : "bg-panel border border-bd2 hover:border-bd4"
                  }`}
                >
                  {sel && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-[2px] bg-cy-fg" />}
                  <div className="flex items-center gap-2 mb-[9px]">
                    <span className={dir}>
                      <Icon name="zap" size={13} />
                    </span>
                    <span className={`text-[13px] font-semibold ${sel ? "text-tx1" : "text-tx2"} truncate`}>{r.name}</span>
                    <span className={`ml-auto text-[10px] font-semibold rounded-[5px] px-[7px] py-0.5 ${badge}`}>
                      {r.isDeparture ? "DEP" : "ARR"}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono text-[10.5px] text-tx7">
                    <span>
                      {r.rwyInUse || r.runway || "—"} · {cadence} · {r.duration}m
                    </span>
                    <span className={sel ? "text-cy-fg" : "text-tx3"}>{session.counts[r.id] ?? 0} ac</span>
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

        {/* DETAIL */}
        <div className="overflow-auto p-[20px_22px] dotgrid min-h-0">
          {!draft ? (
            <div className="text-[13px] text-tx7 text-center py-16">Select or create a rule to edit it.</div>
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
                  <button onClick={() => duplicate(selected)} className="text-[11.5px] text-tx3 bg-btn2 border border-bd4 hover:border-bdh rounded-md px-3 py-[7px]">
                    Duplicate
                  </button>
                  <button onClick={() => remove(draft.id)} className="text-[11.5px] text-rd-fg bg-btn2 border border-bd4 hover:border-bdh rounded-md px-3 py-[7px]">
                    Delete
                  </button>
                </div>
              </div>

              {/* core params */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <label className={lb}>RULE NAME</label>
                  <input className={ip} value={draft.name} onChange={(e) => set("name", e.target.value)} />
                </div>
                <div>
                  <label className={lb}>ENTRY FIX</label>
                  <input className={ip} value={draft.spawnWaypoint} onChange={(e) => set("spawnWaypoint", e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className={lb}>RUNWAY</label>
                  <input className={ip} value={draft.rwyInUse} onChange={(e) => set("rwyInUse", e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className={lb}>RATE /HR</label>
                  <input type="number" className={ip} value={draft.rate} onChange={(e) => set("rate", +e.target.value)} />
                </div>
                <div>
                  <label className={lb}>DURATION (min)</label>
                  <input type="number" className={ip} value={draft.duration} onChange={(e) => set("duration", +e.target.value)} />
                </div>
                <div>
                  <label className={lb}>SEPARATION (NM)</label>
                  <input type="number" className={ip} value={draft.nmSeparation} onChange={(e) => set("nmSeparation", +e.target.value)} />
                </div>
                <div className="col-span-3">
                  <label className={lb}>TYPES</label>
                  <input className={ip} value={draft.typePool} onChange={(e) => set("typePool", e.target.value)} />
                </div>
              </div>

              {/* produced aircraft */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold tracking-[0.14em] text-tx6">PRODUCED AIRCRAFT</span>
                <button onClick={() => setEditingFull(draft)} className="text-[11px] text-cy-fg hover:underline">
                  Edit all fields →
                </button>
              </div>
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
                    <div className="px-[13px] py-3 text-center text-[11.5px] text-tx7">No aircraft produced</div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-[9px] mt-4">
                <button
                  onClick={revertDraft}
                  disabled={!dirty}
                  className="text-[12px] text-tx3 bg-transparent border border-bd4 hover:border-bdh disabled:opacity-40 rounded-[7px] px-[15px] py-2"
                >
                  Revert
                </button>
                <button
                  onClick={saveDraft}
                  disabled={!dirty}
                  className="text-[12.5px] font-semibold text-on-cyan bg-[#5ccfe0] hover:bg-[#74d8e6] disabled:opacity-50 rounded-[7px] px-4 py-2"
                >
                  Save rule
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {editingFull && (
        <RuleEditor
          rule={editingFull}
          waypoints={waypoints}
          pool={pool}
          stars={stars}
          copx={copx}
          scenarioIls={scenario.ils}
          onSave={saveFull}
          onCancel={() => setEditingFull(null)}
        />
      )}
    </div>
  );
}
