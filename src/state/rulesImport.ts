// rulesImport.ts — pure rules-import helpers, extracted from the classic
// SavedPanel so the FLIGHTDECK Rules tray shares the exact same contract.
// No UI, no side effects: parse-shape detection + normalization only.
import { emptyRule } from "../core/model";
import { uid } from "../core/uid";

// Accepts any of the shapes the classic shell accepted:
//   [ ...rules ]                          — bare array
//   { kind:"sweatbox-rules", rules }      — ruleset bundle
//   { kind:"sweatbox-scenario", scenario} — full scenario bundle (rules inside)
//   { rules: [...] }                      — anything else carrying a rules array
// Throws when no rules array can be found.
export function extractRules(parsed: any): any[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && parsed.kind === "sweatbox-rules" && Array.isArray(parsed.rules)) return parsed.rules;
  if (parsed && parsed.kind === "sweatbox-scenario" && parsed.scenario && Array.isArray(parsed.scenario.rules))
    return parsed.scenario.rules;
  if (parsed && Array.isArray(parsed.rules)) return parsed.rules;
  throw new Error("Could not find a rules array in the input");
}

// Same normalization SavedPanel.applyRules performed: merge each incoming rule
// over a fresh emptyRule() (so missing fields get defaults), keep or mint an
// id, and default the generator mode to "S3".
export function normalizeRules(incoming: any[]): any[] {
  return (incoming || []).map((r: any) => {
    const n = { ...emptyRule(), ...r, id: r.id || uid(), mode: r.mode || "S3" };
    // Legacy rules predate homeIcao and relied on the old hardcoded LFPG —
    // make that explicit (and editable) instead of silently blanking it.
    if (r.homeIcao === undefined) n.homeIcao = "LFPG";
    // Spawning closer than 1 NM to the entry fix creates a heading problem.
    if ((+n.preEntryNm || 0) < 1) n.preEntryNm = 1;
    return n;
  });
}
