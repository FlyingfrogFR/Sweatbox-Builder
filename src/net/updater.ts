// updater.ts — the in-app update check, wrapped so the rest of the app never
// imports the Tauri plugin directly.
//
// The desktop build checks a signed latest.json published on the GitHub release
// (see src-tauri/tauri.conf.json → plugins.updater). Everything here is a no-op
// in the browser build, which has no updater runtime: checkForUpdate() resolves
// to null and the dialog never mounts.
//
// Two deliberate behaviours:
//   - A failed check is NOT an error the user sees. Being offline, a rate limit,
//     or a release published as a draft (the "latest" endpoint then 404s) all
//     land here, and none of them is worth a dialog on launch. It is logged and
//     swallowed.
//   - SKIP is remembered per version, so skipping 7.7.0 stays quiet until 7.7.1
//     exists. LATER is remembered for nothing — the next launch asks again.

import { isTauri } from "../env";
import { storage, KEYS } from "../state/storage";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes: string;
  date: string;
  /** The plugin's Update handle — opaque to callers, passed back to installUpdate. */
  handle: any;
}

export interface DownloadProgress {
  /** 0–1, or null while the server sends no content-length. */
  fraction: number | null;
  downloaded: number;
  total: number;
}

/**
 * Look for a newer released version. Resolves null when there is nothing to
 * offer — no update, the user skipped this version, the browser build, or any
 * failure at all.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 30_000 });
    if (!update) return null;
    if (storage.get(KEYS.updateSkip) === update.version) return null;
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: String(update.body || "").trim(),
      date: String(update.date || ""),
      handle: update,
    };
  } catch (e) {
    // Offline, no release yet, a draft/prerelease at the endpoint, a proxy in
    // the way — none of these deserve a launch-time dialog.
    console.warn("update check failed:", e);
    return null;
  }
}

/**
 * Download and install, reporting progress. On Windows the installer runs and
 * kills the app, so code after this may never execute; on macOS and Linux the
 * new version is staged and relaunch() swaps it in.
 */
export async function installUpdate(
  info: UpdateInfo,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  let downloaded = 0;
  let total = 0;
  await info.handle.downloadAndInstall((event: any) => {
    switch (event.event) {
      case "Started":
        total = event.data?.contentLength || 0;
        break;
      case "Progress":
        downloaded += event.data?.chunkLength || 0;
        break;
      case "Finished":
        downloaded = total || downloaded;
        break;
    }
    onProgress?.({
      downloaded,
      total,
      fraction: total > 0 ? Math.min(1, downloaded / total) : null,
    });
  });
  await relaunch();
}

/** Stay quiet about this version until a newer one ships. */
export function skipVersion(version: string) {
  storage.set(KEYS.updateSkip, version);
}

/** The running app version, for the dialog's "7.6.0 → 7.7.0" line. */
export async function currentVersion(): Promise<string> {
  if (!isTauri()) return "";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "";
  }
}
