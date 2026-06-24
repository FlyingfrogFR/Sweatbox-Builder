// speed.ts — IAS/Mach→TAS + spawn ground-speed, copied VERBATIM from rc3.

import { GS_BY_WTC, TYPE_CATS } from "./tables";

export function iasToTas(ias: number, alt: number) {
  const sigma = Math.pow(Math.max(0.1, 1 - 6.877e-6 * Math.max(0, alt)), 4.2561);
  return ias / Math.sqrt(sigma);
}

export function machToTas(mach: number, alt: number) {
  const tempK = Math.max(216.65, 288.15 - 0.00198 * Math.max(0, alt));
  return mach * Math.sqrt(1.4 * 287.05 * tempK) * 1.94384;
}

export function computeSpawnGs(rule: any, type: string) {
  const mode = rule.gsMode || "wtc";
  // 'natural' — no speed lock at spawn. Returns 0 so @N writes gs=0; SIMDATA's
  // `0.010:0.0` (accel:initial_speed) then takes over and the aircraft
  // accelerates from rest. Use for departures that should spool up from V2,
  // not appear pinned at a fixed IAS the instant they materialise.
  if (mode === "natural") return 0;
  if (mode === "fixed") {
    const alt = +rule.spawnAlt || 18000;
    const sp = rule.speedType === "mach" ? +rule.assignedSpeed || 0.78 : +rule.assignedSpeed || 280;
    return Math.round(rule.speedType === "mach" ? machToTas(sp, alt) : iasToTas(sp, alt));
  }
  const cat = Object.keys(TYPE_CATS).find((c) =>
    TYPE_CATS[c].types.includes((type || "").toUpperCase()),
  );
  return GS_BY_WTC[cat as string] || GS_BY_WTC.M;
}
