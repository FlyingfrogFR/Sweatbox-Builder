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
  if (parsed && parsed.kind === "sweatbox-rules" && Array.isArray(parsed.rules))
    return parsed.rules;
  if (
    parsed &&
    parsed.kind === "sweatbox-scenario" &&
    parsed.scenario &&
    Array.isArray(parsed.scenario.rules)
  )
    return parsed.scenario.rules;
  if (parsed && Array.isArray(parsed.rules)) return parsed.rules;
  throw new Error("Could not find a rules array in the input");
}

// Merge each incoming rule over a fresh emptyRule() (so missing fields get
// defaults), keep or mint an id, and default the generator mode to "S3".
// `scenarioHome` is the airport the scenario is about (from its export plate).
export function normalizeRules(incoming: any[], scenarioHome?: string): any[] {
  const home = String(scenarioHome || "")
    .trim()
    .toUpperCase();
  return (incoming || []).map((r: any) => {
    const n = { ...emptyRule(), ...r, id: r.id || uid(), mode: r.mode || "S3" };
    // A rule that predates homeIcao must not be left with emptyRule's "" —
    // that would silently turn it into an overflight. It used to be stamped
    // with a hardcoded LFPG; now it takes THIS scenario's airport, explicit and
    // editable. When the scenario has none yet, the key is left absent so the
    // rule inherits whatever the scenario is given later (and the generator
    // says so plainly if it is still missing at run time).
    if (r.homeIcao === undefined) {
      if (home) n.homeIcao = home;
      else delete n.homeIcao;
    }
    // Spawning closer than 1 NM to the entry fix creates a heading problem.
    if ((+n.preEntryNm || 0) < 1) n.preEntryNm = 1;
    return n;
  });
}
