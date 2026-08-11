// bundleKind.ts — identify what a dropped .json actually is, so every import
// button can (a) accept exactly its own kind and (b) tell the user precisely
// where a mistaken file belongs instead of failing with "invalid bundle".
//
// The app exports four JSON shapes; each carries a `kind` tag, but rulesets are
// also accepted as a bare array (hand-written syllabus files), so detection is
// tag-first with a structural fallback.

export type BundleKind = "scenario" | "rules" | "pool" | "navdata" | "unknown";

/** Human label + where that file is imported, for wrong-file guidance. */
export const BUNDLE_HOME: Record<Exclude<BundleKind, "unknown">, { label: string; where: string }> = {
  scenario: { label: "scenario", where: "the SCENARIOS rail — IMPORT SCENARIO" },
  rules: { label: "ruleset", where: "BUILD TFC → RULESET — IMPORT RULESET" },
  pool: { label: "flight-plan pool", where: "FPLN POOL → POOL — IMPORT POOL" },
  navdata: { label: "navdata", where: "SETUP → NAVDATA — IMPORT NAVDATA" },
};

export function detectBundleKind(parsed: any): BundleKind {
  if (Array.isArray(parsed)) return parsed.length && looksLikeRule(parsed[0]) ? "rules" : "unknown";
  if (!parsed || typeof parsed !== "object") return "unknown";
  switch (parsed.kind) {
    case "sweatbox-scenario":
      return "scenario";
    case "sweatbox-rules":
      return "rules";
    case "sweatbox-pool":
      return "pool";
    case "sweatbox-navdata":
      return "navdata";
  }
  // Untagged fallbacks — a bare rules array wrapper, or a raw scenario object.
  if (Array.isArray(parsed.rules) && parsed.rules.length && looksLikeRule(parsed.rules[0])) {
    return parsed.aircraft || parsed.ils || parsed.controllers ? "scenario" : "rules";
  }
  if (Array.isArray(parsed.pool)) return "pool";
  if (Array.isArray(parsed.waypoints) || Array.isArray(parsed.positions)) return "navdata";
  return "unknown";
}

function looksLikeRule(r: any) {
  return !!r && typeof r === "object" && ("spawnWaypoint" in r || "mode" in r || "rate" in r || "duration" in r);
}

/**
 * Message for an import that received the wrong file. Returns null when the
 * file IS the expected kind (caller proceeds).
 */
export function wrongKindMessage(parsed: any, expected: Exclude<BundleKind, "unknown">): string | null {
  const got = detectBundleKind(parsed);
  if (got === expected) return null;
  if (got === "unknown") return `That file isn't a Sweatbox ${BUNDLE_HOME[expected].label} export.`;
  const home = BUNDLE_HOME[got];
  return `That's a <b>${home.label}</b> file — import it in ${home.where}.`;
}
