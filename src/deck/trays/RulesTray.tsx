// RulesTray.tsx — RULE WORKBENCH tray: hosts the existing RuleWorkbench
// (master/detail + session timeline + preview) under FLIGHTDECK chrome.
// Mode latches (S3/C1, S2 soon) live in the tray head; ruleset import/export
// lives in the footer. Import-first empty state: the primary real flow is
// "import a syllabus ruleset, then tweak" — so an empty scenario greets the
// user with two doors instead of a bare workbench.
import { useState, useEffect, useRef } from "react";
import { Tray } from "../Tray";
import { DeckKey, Latch } from "../ui";
import { Icon } from "../../ui/Icon";
import { RuleWorkbench } from "../../generators/RuleWorkbench";
import { emptyRule } from "../../core/model";
import { readJsonFile, downloadJsonBundle } from "../../io/bundles";
import { extractRules, normalizeRules } from "../../state/rulesImport";

type Mode = "S3" | "C1";
const MODE_LABEL: Record<Mode, string> = { S3: "S3 · APPROACH", C1: "C1 · ENROUTE" };

export function RulesTray({
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
  focusRuleId,
  clearFocus,
  rating,
}: any) {
  // The session's target rating steers the default workbench mode.
  const [mode, setMode] = useState<Mode>(rating === "C1" ? "C1" : "S3");
  useEffect(() => {
    if (rating === "S3" || rating === "C1") setMode(rating);
  }, [rating]);

  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const fileRef = useRef<HTMLInputElement>(null);

  const allRules = scenario.rules || [];
  const modeRules = allRules.filter((r: any) => r.mode === mode);
  const otherModes: string[] = Array.from(new Set(allRules.map((r: any) => r.mode || "S3"))).filter(
    (m: any) => m !== mode,
  ) as string[];

  // Board → tray focus: switch the mode latch to the focused rule's mode.
  // RuleWorkbench then selects the first rule of that mode itself; wiring the
  // exact rule into the workbench selection is future work.
  useEffect(() => {
    if (!open || !focusRuleId) return;
    const r = allRules.find((x: any) => x.id === focusRuleId);
    if (r) setMode(r.mode === "C1" ? "C1" : "S3");
    clearFocus();
  }, [open, focusRuleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- import (merge/replace semantics ported from SavedPanel.applyRules) ----------
  const applyRules = (incoming: any[]) => {
    const normalised = normalizeRules(incoming);
    const n = normalised.length;
    if (importMode === "replace") {
      snapshot("before REPLACE import");
      // Replaced rules take their generated aircraft with them.
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

  // ---------- export ----------
  const saveRuleset = () => {
    if (!allRules.length) {
      toast("No rules to save yet", "warn");
      return;
    }
    const prefix = (scenario.name || "scenario").replace(/[^a-z0-9]+/gi, "_");
    const filename = `${prefix}.RULESET.json`;
    downloadJsonBundle(filename, {
      kind: "sweatbox-rules",
      version: 1,
      exportedAt: new Date().toISOString(),
      rules: allRules,
    });
    toast(`Ruleset saved — <b class="font-mono">${filename}</b>`, "ok");
  };

  // ---------- second door: build from scratch ----------
  const firstRule = () => {
    const r = { ...emptyRule(), mode, name: `New ${mode} rule` };
    onChange({ ...scenario, rules: [...allRules, r] });
  };

  return (
    <Tray
      open={open}
      title="RULE WORKBENCH"
      onDone={close}
      headExtra={
        <span className="flex items-center gap-1.5 ml-1.5">
          <Latch on={mode === "S3"} onClick={() => setMode("S3")}>
            S3 · APPROACH
          </Latch>
          <Latch on={mode === "C1"} onClick={() => setMode("C1")}>
            C1 · ENROUTE
          </Latch>
          <Latch on={false} disabled title="soon">
            S2 · TOWER — soon
          </Latch>
        </span>
      }
      footer={
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
          <span className="flex-1" />
          <DeckKey size="sm" onClick={saveRuleset} title="Download all rules as a portable ruleset .json">
            <Icon name="download" size={13} />
            SAVE RULESET
          </DeckKey>
        </>
      }
    >
      <div className="h-full min-h-0 flex flex-col">
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />

        {!allRules.length ? (
          /* ---------- import-first empty state: two doors ---------- */
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
            {!modeRules.length && (
              /* rules exist, but all under the other mode — slim hint bar */
              <div className="flex-none flex items-center gap-2 px-4 py-2 border-b border-bd1 bg-inset text-[11px] text-tx4">
                <span className="text-am-fg">
                  <Icon name="alert" size={13} />
                </span>
                <span>
                  No {mode} rules — {allRules.length} rule{allRules.length !== 1 ? "s" : ""} live under{" "}
                  {otherModes.map((m, i) => (
                    <span key={m}>
                      {i > 0 && " and "}
                      <b className="font-mono text-tx2">{MODE_LABEL[m as Mode] || m}</b>
                    </span>
                  ))}{" "}
                  — flip the mode latch above.
                </span>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <RuleWorkbench
                mode={mode}
                scenario={scenario}
                onChange={onChange}
                waypoints={waypoints}
                pool={pool}
                stars={stars}
                copx={copx}
              />
            </div>
          </>
        )}
      </div>
    </Tray>
  );
}
