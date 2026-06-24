// fileSave.ts — native Save-As + the export naming convention.
//
// Naming convention (tokens collected at save time, per the user's choice):
//   scenario : ICAO_X.Y_CONFIGYY            (e.g. LFBO_3.3_CONFIG32.scn)
//   ruleset  : ICAO_X.Y_CONFIGYY_RULESET.json
// "CONFIG" (the config token) is always uppercased. The four tokens — ICAO,
// version (X.Y), config, configNum (YY) — are entered in the Export UI, which
// shows a live filename preview so the exact composition is visible before save.
//
// Desktop (Tauri): native Save-As via @tauri-apps/plugin-dialog `save`, then the
// file is written directly with @tauri-apps/plugin-fs `writeTextFile` — so the
// file lands correctly named with no post-export rename. Write scopes are
// allow-listed in src-tauri/capabilities/default.json ($HOME and the common
// export folders).
//
// Web (fallback): the original browser blob download.

import { isTauri } from "../env";

export type ExportKind = "scenario" | "ruleset";

export interface NameTokens {
  icao: string;
  version: string; // "X.Y", e.g. "3.3"
  config: string; // config token, uppercased in the output
  configNum: string; // "YY", e.g. "32"
}

/** Build the export filename from the four tokens. */
export function buildExportName(t: NameTokens, kind: ExportKind): string {
  const icao = (t.icao || "").toUpperCase().trim();
  const version = String(t.version ?? "").trim();
  const config = (t.config || "").toUpperCase().trim();
  const configNum = String(t.configNum ?? "").trim();
  const base = `${icao}_${version}_${config}${configNum}`;
  return kind === "ruleset" ? `${base}_RULESET.json` : `${base}.scn`;
}

function blobDownload(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface SaveResult {
  saved: boolean; // false when the user cancelled the native dialog
  path?: string; // absolute path written (desktop only)
  viaFallback?: boolean; // true when the blob download path was used (web)
}

/**
 * Show a native Save-As dialog (desktop) pre-filled with `suggestedName`, then
 * write `contents` to the chosen path. Falls back to a browser blob download in
 * the web build. `kind` only selects the dialog's file-type filter.
 */
export async function saveTextFile(
  suggestedName: string,
  contents: string,
  kind: ExportKind,
): Promise<SaveResult> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const filters =
      kind === "ruleset"
        ? [{ name: "Ruleset JSON", extensions: ["json"] }]
        : [{ name: "EuroScope scenario", extensions: ["scn", "txt"] }];
    const path = await save({ defaultPath: suggestedName, filters });
    if (!path) return { saved: false };
    await writeTextFile(path, contents);
    return { saved: true, path };
  }
  const mime = kind === "ruleset" ? "application/json" : "text/plain";
  blobDownload(suggestedName, contents, mime);
  return { saved: true, viaFallback: true };
}
