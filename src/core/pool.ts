// pool.ts — aircraft-pool helpers + source labels, copied VERBATIM from the rc3
// shell. uid()/Date.now() do not affect .scn output.

import { uid } from "./uid";
import { emptyAc } from "./model";

export function addToPool(pool: any[], items: any[], source: string) {
  const map = new Map(pool.map((p) => [p.callsign || p.id, p]));
  for (const item of items) {
    const key = item.callsign || uid();
    const existing: any = map.get(key);
    map.set(key, {
      id: existing?.id || uid(),
      addedAt: existing?.addedAt || Date.now(),
      ...(existing || {}),
      ...item,
      source,
    });
  }
  return Array.from(map.values());
}

export function poolToAc(e: any, dep = false) {
  return {
    ...emptyAc(dep),
    callsign: e.callsign || "",
    type: e.type || "",
    origin: e.origin || "",
    dest: e.dest || "",
    cruiseAlt: (e.cruiseFL || 350) * 100,
    fpRoute: e.route || "",
    simRoute: e.route || "",
    squawk: e.squawk || "1000",
  };
}

export const SRC_LABELS: Record<string, { label: string; color: string }> = {
  vatsim: { label: "VATSIM", color: "text-emerald-400 bg-emerald-900/30" },
  simbrief: { label: "SimBrief", color: "text-blue-400 bg-blue-900/30" },
  manual: { label: "Manual", color: "text-slate-400 bg-slate-800" },
};
