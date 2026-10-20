// storage.ts — localStorage wrapper, KEYS, and the usePersist hook.
// Copied VERBATIM from the rc3 shell. localStorage works as-is in the Tauri
// webview, so persistence (settings, saved scenarios) is unchanged.

import { useEffect } from "react";

// A write can fail — localStorage has a hard quota (about 5 million
// characters in Chromium-based webviews) and setItem throws when it is full.
// For years that failure was swallowed here and the app carried on as if it
// had saved: a slot created while storage was full was listed but never
// written, and clicking it later did nothing. set() still returns false, but
// it now also tells whoever subscribed, so the shell can say so.
// The navdata and pool keys, named here (above their use in storageUsage);
// the public KEYS object below carries the same strings.
const KEYS_NAV = {
  waypoints: "sb:wpts",
  airports: "sb:apts",
  positions: "sb:pos",
  runways: "sb:rwy",
  stars: "sb:stars",
  copx: "sb:copx",
  firBounds: "sb:firbounds",
  gates: "sb:gates",
  navMeta: "sb:meta",
  pool: "sb:pool",
};

type FailureListener = (key: string, error: unknown) => void;
const failureListeners = new Set<FailureListener>();

export const storage = {
  get(k: string) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  /** The stored string itself (null when absent) — for telling "missing" from "unreadable". */
  raw(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: any) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      for (const cb of failureListeners) {
        try {
          cb(k, e);
        } catch {}
      }
      return false;
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
  /** Be told when a write fails. Returns the unsubscribe. */
  onFailure(cb: FailureListener) {
    failureListeners.add(cb);
    return () => {
      failureListeners.delete(cb);
    };
  },
  /** Every key currently stored (the app's own and anything else on the origin). */
  keys(): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== null) out.push(k);
      }
    } catch {}
    return out;
  },
};

/** Was this refusal the quota (storage FULL), as opposed to storage being unavailable? */
export function isQuotaError(e: unknown): boolean {
  const err = e as any;
  const name = String(err?.name || "");
  const code = Number(err?.code);
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

/** What the app's storage holds, in characters (what the quota counts), by what it is for. */
export type StorageUsage = {
  total: number;
  navdata: number;
  scenarios: number;
  snapshots: number;
  pool: number;
  other: number;
  slots: number; // number of saved scenarios
  snapshotKeys: number; // slots that have a REWIND ring
};

const NAVDATA_KEYS = new Set([
  KEYS_NAV.waypoints,
  KEYS_NAV.airports,
  KEYS_NAV.positions,
  KEYS_NAV.runways,
  KEYS_NAV.stars,
  KEYS_NAV.copx,
  KEYS_NAV.firBounds,
  KEYS_NAV.gates,
  KEYS_NAV.navMeta,
]);

export function storageUsage(): StorageUsage {
  const u: StorageUsage = {
    total: 0,
    navdata: 0,
    scenarios: 0,
    snapshots: 0,
    pool: 0,
    other: 0,
    slots: 0,
    snapshotKeys: 0,
  };
  for (const k of storage.keys()) {
    const n = (storage.raw(k) || "").length + k.length;
    u.total += n;
    if (k.startsWith("sb:sc:")) {
      u.scenarios += n;
      u.slots++;
    } else if (k.startsWith("sb:snap:")) {
      u.snapshots += n;
      u.snapshotKeys++;
    } else if (NAVDATA_KEYS.has(k)) u.navdata += n;
    else if (k === KEYS_NAV.pool) u.pool += n;
    else u.other += n;
  }
  return u;
}

export const KEYS = {
  waypoints: "sb:wpts",
  airports: "sb:apts",
  positions: "sb:pos",
  runways: "sb:rwy",
  stars: "sb:stars",
  copx: "sb:copx",
  firBounds: "sb:firbounds",
  gates: "sb:gates",
  navMeta: "sb:meta",
  current: "sb:cur",
  list: "sb:list",
  sbUser: "sb:sbuser",
  pool: "sb:pool",
  navAirac: "sb:navairac",
  poolAirac: "sb:poolairac",
  rampAgent: "sb:rampagent",
  rampConfig: "sb:rampconfig",
  exportPrefs: "sb:export",
  // Version the user chose to skip in the update dialog, and the personal
  // access token used to publish shared pools. The token is the one value in
  // here that is a credential: keep it under its own key so a diagnostics dump
  // can exclude it by name.
  updateSkip: "sb:updateskip",
  ghToken: "sb:ghtoken",
  poolShare: "sb:poolshare",
};

// Persist a value to localStorage and (optionally) mirror to a side effect.
export function usePersist(value: any, key: string, loaded: boolean, mirror?: (v: any) => void) {
  useEffect(() => {
    if (!loaded) return;
    if (value === undefined || value === null) {
      storage.del(key);
    } else {
      storage.set(key, value);
    }
    if (mirror) mirror(value);
  }, [value, loaded]);
}
