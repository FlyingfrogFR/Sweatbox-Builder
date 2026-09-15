// exportSettings.ts — the export "plate": the ICAO_X.Y_CONFIGYY filename
// tokens and the mentor pseudo-pilot choice.
//
// Scenario-owned since 7.6.0 so every save slot ships under its own name.
// Before that the block lived only in the global sb:export key, so every slot
// showed whichever plate was edited last — an LFBB slot wearing LFPG_3.3_WEST26
// and a pseudo-pilot "no longer in Setup".
//
// Precedence, in one place:
//   1. scenario.exportSettings when the slot has PINNED one (any plate edit
//      pins the whole block to that slot).
//   2. Otherwise a DERIVED block: the identity tokens (ICAO, config, number)
//      come from the slot itself — its name, its controllers — and never from
//      another slot. Mentor-level preferences (syllabus version, pseudo-pilot
//      on/off, source, typed callsign) come from the global sb:export mirror,
//      which every edit refreshes as "last used".
//
// Field names are the sb:export names verbatim so that key keeps its shape.

export type PpMode = "list" | "custom";
/** How the export filename is built: the vACC convention, or a name you type. */
export type NameMode = "tokens" | "custom";

export interface ExportSettings {
  nameMode: NameMode; // "tokens" = ICAO_X.Y_CONFIGYY, "custom" = customName
  customName: string; // used verbatim (sanitised) when nameMode is "custom"
  icao: string;
  version: string; // "X.Y"
  config: string; // uppercased in the filename
  configNum: string; // "YY"
  autoAssign: boolean; // write INITIALPSEUDOPILOT
  ppMode: PpMode; // pick from Setup controllers, or typed
  ppList: string; // controller callsign picked from the scenario
  ppCustom: string; // typed mentor callsign
}

export const EMPTY_EXPORT: ExportSettings = {
  nameMode: "tokens",
  customName: "",
  icao: "",
  version: "",
  config: "",
  configNum: "",
  autoAssign: false,
  ppMode: "list",
  ppList: "",
  ppCustom: "",
};

const str = (v: any) => (v == null ? "" : String(v));

/** Coerce a stored or imported block to the exact shape; null when it is not one. */
export function normalizeExportSettings(x: any): ExportSettings | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  return {
    nameMode: x.nameMode === "custom" ? "custom" : "tokens",
    customName: sanitiseFileBase(x.customName),
    icao: str(x.icao).trim().toUpperCase(),
    version: str(x.version).trim(),
    config: str(x.config).trim().toUpperCase(),
    configNum: str(x.configNum).trim(),
    autoAssign: !!x.autoAssign,
    ppMode: x.ppMode === "custom" ? "custom" : "list",
    ppList: str(x.ppList).trim(),
    ppCustom: str(x.ppCustom).trim().toUpperCase(),
  };
}

/**
 * Make a typed name safe to hand to a file dialog: no path separators, no
 * characters Windows rejects, no leading dot, and a sane length. The extension
 * is added by buildExportName, so any the user typed is dropped here.
 */
export function sanitiseFileBase(v: any): string {
  return str(v)
    .replace(/\.(txt|json|scn)$/i, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 80);
}

/** Is this plate complete enough to export with? */
export function nameIsReady(s: ExportSettings): boolean {
  return s.nameMode === "custom"
    ? !!sanitiseFileBase(s.customName)
    : !!(s.icao && s.version && s.config && s.configNum);
}

// A slot named after the file convention carries every token:
//   "LFBB_1_1_NORTH32" · "LFPG_3.3_WEST26" · "LFBB 1.1 NORTH 32"
const FULL_NAME = /^([A-Z]{4})[\s_-]+(\d+)[._](\d+)[\s_-]+([A-Z]+)[\s_-]*(\d{1,2})(?![A-Z0-9])/i;
// A leading four-letter word standing on its own — "LFBB north" yes,
// "Untitled" / "Evening rush" no (the classic slice(0,4) seed said EVEN).
const ICAO_WORD = /^([A-Z]{4})(?![A-Z0-9])/i;

/** Tokens a slot name spells out — all four for convention-shaped names, else at most the ICAO. */
export function seedFromName(name: any): Partial<ExportSettings> {
  const n = str(name).trim();
  const full = FULL_NAME.exec(n);
  if (full)
    return {
      icao: full[1].toUpperCase(),
      version: `${full[2]}.${full[3]}`,
      config: full[4].toUpperCase(),
      configNum: full[5],
    };
  const w = ICAO_WORD.exec(n);
  return w ? { icao: w[1].toUpperCase() } : {};
}

/**
 * The plate for a scenario: its pinned block, or one derived from the slot
 * (identity) + the global mirror (mentor preferences).
 * `knownAirports` — SCT airport names when navdata is loaded; a loosely seeded
 * ICAO must be one of them, or the first controller's station prefix is used.
 */
export function deriveExportSettings(
  scenario: any,
  globalPrefs: any,
  knownAirports?: Set<string>,
): { settings: ExportSettings; pinned: boolean } {
  const own = normalizeExportSettings(scenario?.exportSettings);
  if (own) return { settings: own, pinned: true };

  const g = normalizeExportSettings(globalPrefs) || EMPTY_EXPORT;
  const seed = seedFromName(scenario?.name);
  const controllers: string[] = (scenario?.controllers || [])
    .map((c: any) => str(c?.callsign).trim().toUpperCase())
    .filter(Boolean);

  let icao = seed.icao || "";
  if (seed.version === undefined) {
    // Loose seed: the name's leading word, else a controller's station
    // (LFPG_APP → LFPG). With airports loaded, prefer a candidate that is one.
    const cands = [seed.icao, ...controllers.map((c) => (c.match(/^([A-Z]{4})_/) || [])[1])].filter(
      Boolean,
    ) as string[];
    icao =
      (knownAirports && knownAirports.size ? cands.find((c) => knownAirports.has(c)) : undefined) ||
      cands[0] ||
      "";
  }

  return {
    pinned: false,
    settings: {
      // A slot that has never been touched follows the convention; typing a
      // name of your own is an explicit choice, so it is never inherited.
      nameMode: "tokens",
      customName: "",
      icao,
      version: seed.version ?? g.version,
      // Runway configuration is this slot's business — never another slot's.
      config: seed.config ?? "",
      configNum: seed.configNum ?? "",
      autoAssign: g.autoAssign,
      ppMode: g.ppMode,
      // A controller pick only carries over when this slot has that controller.
      ppList: controllers.includes(g.ppList) ? g.ppList : "",
      ppCustom: g.ppCustom,
    },
  };
}

/** The INITIALPSEUDOPILOT value the settings resolve to ("" = none). Same expression the shell always used. */
export function initPseudoPilotFor(s: ExportSettings): string {
  if (!s.autoAssign) return "";
  return s.ppMode === "list" ? s.ppList : s.ppCustom;
}
