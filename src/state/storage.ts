// storage.ts — localStorage wrapper, KEYS, and the usePersist hook.
// Copied VERBATIM from the rc3 shell. localStorage works as-is in the Tauri
// webview, so persistence (settings, saved scenarios) is unchanged.

import { useEffect } from "react";

export const storage = {
  get(k: string) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: any) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

export const KEYS = {
  waypoints: "sb:wpts",
  airports: "sb:apts",
  positions: "sb:pos",
  runways: "sb:rwy",
  stars: "sb:stars",
  copx: "sb:copx",
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
};

// Persist a value to localStorage and (optionally) mirror to a side effect.
export function usePersist(
  value: any,
  key: string,
  loaded: boolean,
  mirror?: (v: any) => void,
) {
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
