// TrafficTray.tsx — dock button 2 of 3. Every way of putting traffic on the
// board lives here, in three sub-sections plus one direct action:
//   RULES        — the workbench (import-first), with the RUN RULES lever
//   LIVE & POOL  — SimBrief + VATSIM fetchers feeding the pool, pool → board
//   GROUND       — S1 ramp traffic
//   + BY HAND    — drops one blank aircraft and opens its editor
// Hosted panels keep their legacy styling — accepted for this milestone.
import { useState, useEffect, useRef } from "react";
import { Tray } from "../Tray";
import { DeckKey, Latch, pulse } from "../ui";
import { Icon } from "../../ui/Icon";
import { RuleWorkbench } from "../../generators/RuleWorkbench";
import { SimBriefSection, VatsimSection } from "../../panels/FlightPlansPanel";
import { AircraftPoolPanel } from "../../panels/AircraftPoolPanel";
import { getGenerators } from "../../generators";
import { emptyRule } from "../../core/model";
import { readJsonFile, downloadJsonBundle } from "../../io/bundles";
import { extractRules, normalizeRules } from "../../state/rulesImport";

type Mode = "S3" | "C1";
const MODE_LABEL: Record<Mode, string> = { S3: "S3 · APPROACH", C1: "C1 · ENROUTE" };

export function TrafficTray(props: any) {
  const {
    open,
    close,
    toast,
    snapshot,
    scenario,
    onChange,
    waypoints,
    pool,
    stars,
    copx,
    gates,
    rampAgent,
    rampConfig,
    section,
    setSection,
    focusRuleId,
    clearFocus,
    rating,
    onAddAc,
    onRunRules,
    estRuleAc,
    simbriefCache,
    setSimbriefCache,
    vatsimCache,
    setVatsimCache,
    onAddToPool,
    onDeleteFromPool,
    poolAirac,
    onSetPoolAirac,
    onImportPool,
    onAddToBoard,
    onGroundGenerated,
  } = props;

  const allRules = scenario.rules || [];
  const ruleCount = allRules.length;

  // ---------- RULES section state ----------
  const [mode, setMode] = useState<Mode>(rating === "C1" ? "C1" : "S3");
  useEffect(() => {
    if (rating === "S3" || rating === "C1") setMode(rating);
  }, [rating]);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const fileRef = useRef<HTMLInputElement>(null);
  const [runAnim, setRunAnim] = useState<number | null>(null);
  const rafRef = useRef(0);
  const runTimer = useRef<any>(null);
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(runTimer.current);
    },
    [],
  );

  const modeRules = allRules.filter((r: any) => r.mode === mode);
  const otherModes: string[] = Array.from(new Set(allRules.map((r: any) => r.mode || "S3"))).filter(
    (m: any) => m !== mode,
  ) as string[];

  // Board → tray focus: land on the RULES section in the focused rule's mode.
  useEffect(() => {
    if (!open || !focusRuleId) return;
    const r = allRules.find((x: any) => x.id === focusRuleId);
    if (r) {
      setSection("rules");
      setMode(r.mode === "C1" ? "C1" : "S3");
    }
    clearFocus();
  }, [open, focusRuleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- ruleset import (merge/replace, ported from SavedPanel.applyRules) ----------
  const applyRules = (incoming: any[]) => {
    const normalised = normalizeRules(incoming);
    const n = normalised.length;
    if (importMode === "replace") {
      snapshot("before REPLACE import");
      const keptAc = (scenario.aircraft || []).filter((a: any) => !a.ruleId);
      onChange({ ...scenario, rules: normalised, aircraft: keptAc });
      toast(`Replaced: <b>${n}</b> rule${n !== 1 ? "s" : ""} imported — review & press RUN RULES`, "ok");
    } else {
      const existingIds = new Set(allRules.map((r: any) => r.id));
      const overlap = normalised.filter((x: any) => existingIds.has(x.id)).length;
      const merged = [...allRules.filter((r: any) => !normalised.some((x: any) => x.id === r.id)), ...normalised];
      onChange({ ...scenario, rules: merged });
      toast(
        `<b>${n}</b> rule${n !== 1 ? "s" : ""} imported${overlap ? ` (${overlap} replaced by id)` : ""} — review & press RUN RULES`,
        "ok",
      );
    }
  };
  const onFile = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const parsed = await readJsonFile(file);
      const rules = extractRules(parsed);
      if (!rules.length) throw new Error("Rules array is empty");
      applyRules(rules);
    } catch (err: any) {
      toast("Import failed: " + (err.message || err), "err");
    }
  };
  const saveRuleset = () => {
    if (!allRules.length) {
      toast("No rules to save yet", "warn");
      return;
    }
    const prefix = (scenario.name || "scenario").replace(/[^a-z0-9]+/gi, "_");
    const filename = `${prefix}.RULESET.json`;
    downloadJsonBundle(filename, { kind: "sweatbox-rules", version: 1, exportedAt: new Date().toISOString(), rules: allRules });
    toast(`Ruleset saved — <b class="font-mono">${filename}</b>`, "ok");
  };
  const firstRule = () => {
    const r = { ...emptyRule(), mode, name: `New ${mode} rule` };
    onChange({ ...scenario, rules: [...allRules, r] });
  };

  // RUN RULES lever with the 0→N count-up (DeckApp does the actual generation).
  const doRunRules = () => {
    const n = onRunRules();
    if (typeof n !== "number") return;
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
  const runLabel =
    ruleCount === 0 ? "RUN RULES" : `RUN RULES · ${ruleCount} → ${runAnim !== null ? runAnim : estRuleAc}`;

  // ---------- GROUND section (registered S1 panel) ----------
  const s1 = getGenerators().find((g) => g.id === "S1");
  // Auto-close on generation: baseline the ground-aircraft count while open.
  const groundBase = useRef(0);
  const groundCount = (scenario.aircraft || []).filter((a: any) => a.groundMeta).length;
  useEffect(() => {
    if (open && section === "ground") groundBase.current = groundCount;
  }, [open, section]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || section !== "ground") return;
    if (groundCount > groundBase.current) {
      onGroundGenerated(groundCount - groundBase.current);
      groundBase.current = groundCount;
    }
  }, [groundCount, open, section]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Tray
      open={open}
      title="TRAFFIC"
      onDone={close}
      headExtra={
        <span className="flex items-center gap-1.5 ml-1.5">
          <Latch on={section === "rules"} onClick={() => setSection("rules")} title="Rule-generated traffic">
            RULES {ruleCount > 0 && <b className="font-mono">{ruleCount}</b>}
          </Latch>
          <Latch on={section === "live"} onClick={() => setSection("live")} title="SimBrief / VATSIM fetchers + the pool">
            LIVE & POOL {(pool || []).length > 0 && <b className="font-mono">{(pool || []).length}</b>}
          </Latch>
          <Latch on={section === "ground"} onClick={() => setSection("ground")} title="S1 ramp traffic">
            GROUND
          </Latch>
          <span className="w-px self-stretch bg-bd1 mx-1" />
          <DeckKey size="sm" onClick={onAddAc} title="Drop one blank aircraft and type its plan">
            <Icon name="plus" size={13} />
            BY HAND
          </DeckKey>
        </span>
      }
      footer={
        section === "rules" ? (
          <>
            <DeckKey size="sm" onClick={() => fileRef.current?.click()} title="Import a ruleset .json (merge or replace)">
              <Icon name="upload" size={13} />
              IMPORT RULES
            </DeckKey>
            <Latch on={importMode === "merge"} onClick={() => setImportMode("merge")} title="Imported rules merge in (same id replaces)">
              MERGE
            </Latch>
            <Latch
              on={importMode === "replace"}
              onClick={() => setImportMode("replace")}
              title="Import replaces ALL rules (snapshots first; rule-generated aircraft are removed)"
            >
              REPLACE
            </Latch>
            <DeckKey size="sm" onClick={saveRuleset} title="Download all rules as a portable ruleset .json">
              <Icon name="download" size={13} />
              SAVE RULESET
            </DeckKey>
            <span className="flex-1" />
            <DeckKey
              id="dk-runrules"
              size="lever"
              variant={ruleCount === 0 ? "fix" : "primary"}
              disabled={ruleCount === 0}
              onClick={doRunRules}
              title="Regenerate all rule traffic (Ctrl+R)"
            >
              {runLabel}
            </DeckKey>
          </>
        ) : null
      }
    >
      <div className="h-full min-h-0 flex flex-col">
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />

        {/* ================= RULES ================= */}
        {section === "rules" &&
          (!allRules.length ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <div className="flex items-center gap-5 flex-wrap justify-center">
                <DeckKey size="lever" variant="primary" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={15} />
                  IMPORT RULESET
                </DeckKey>
                <span className="text-[10px] font-extrabold tracking-[0.18em] text-tx8 select-none">OR</span>
                <DeckKey size="lever" onClick={firstRule}>
                  <Icon name="plus" size={15} />
                  FIRST RULE
                </DeckKey>
              </div>
              <div className="text-[11.5px] text-tx6 text-center max-w-[420px]">
                Have a syllabus ruleset? Import it and tweak — or build from scratch.
              </div>
            </div>
          ) : (
            <>
              <div className="flex-none flex items-center gap-1.5 px-4 py-2 border-b border-bd1 bg-inset">
                <Latch on={mode === "S3"} onClick={() => setMode("S3")}>
                  S3 · APPROACH
                </Latch>
                <Latch on={mode === "C1"} onClick={() => setMode("C1")}>
                  C1 · ENROUTE
                </Latch>
                <Latch on={false} disabled title="soon">
                  S2 · TOWER — soon
                </Latch>
                {!modeRules.length && (
                  <span className="ml-2 text-[11px] text-tx4">
                    <span className="text-am-fg mr-1">
                      <Icon name="alert" size={12} className="inline" />
                    </span>
                    No {mode} rules — {allRules.length} live under{" "}
                    {otherModes.map((m, i) => (
                      <b key={m} className="font-mono text-tx2">
                        {i > 0 && " and "}
                        {MODE_LABEL[m as Mode] || m}
                      </b>
                    ))}
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <RuleWorkbench mode={mode} scenario={scenario} onChange={onChange} waypoints={waypoints} pool={pool} stars={stars} copx={copx} />
              </div>
            </>
          ))}

        {/* ================= LIVE & POOL ================= */}
        {section === "live" && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 border-b border-bd1">
              <div className="min-w-0">
                <SimBriefSection onAddToPool={onAddToPool} cache={simbriefCache} setCache={setSimbriefCache} />
              </div>
              <div className="min-w-0">
                <VatsimSection onAddToPool={onAddToPool} cache={vatsimCache} setCache={setVatsimCache} />
              </div>
            </div>
            <AircraftPoolPanel
              pool={pool}
              onDelete={onDeleteFromPool}
              onAddToScenario={onAddToBoard}
              airac={poolAirac}
              onSetAirac={onSetPoolAirac}
              onImportPool={onImportPool}
            />
          </div>
        )}

        {/* ================= GROUND ================= */}
        {section === "ground" &&
          (s1 ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              {s1.render({ scenario, onChange, gates, pool, rampAgent, rampConfig })}
            </div>
          ) : (
            <div className="p-10 text-center text-tx6">S1 ground generator not loaded.</div>
          ))}
      </div>
    </Tray>
  );
}
