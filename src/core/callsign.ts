// callsign.ts — ICAO callsign generation, copied VERBATIM from the rc3 shell.
// Math.random() is routed through rng() (see rng.ts) so the regression suite can
// seed the stream identically to the oracle. Nothing else changes.

import { ICAO_CS, REGION_PFX, LH_CS } from "./tables";
import { rng } from "./rng";

export function poolIcaosByRegion(pool: any[], field: string) {
  const RNAMES: Record<string, string> = {
    eu_legacy: "Europe",
    eu_lcc: "Europe (LCC)",
    middle_east: "Middle East",
    north_am: "North America",
    east_asia: "East Asia",
    se_asia: "SE Asia / Pacific",
    oceania: "Oceania",
    south_am: "South America",
    africa: "Africa",
  };
  const grouped: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const e of pool) {
    const icao = (e[field] || "").toUpperCase();
    if (!icao || seen.has(icao)) continue;
    seen.add(icao);
    const reg = (REGION_PFX[icao.charAt(0)] || ["other"])[0];
    const label = RNAMES[reg] || "Other";
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(icao);
  }
  Object.values(grouped).forEach((a) => a.sort());
  return grouped;
}

export function pickIcao(org: string, { heavy = false }: { heavy?: boolean } = {}) {
  if (heavy) return LH_CS[Math.floor(rng() * LH_CS.length)];
  const pfx = (org || "").charAt(0).toUpperCase();
  const regs = REGION_PFX[pfx] || ["eu_legacy"];
  const r = rng();
  let pool: string[];
  if (r < 0.75 || regs.length === 1) pool = ICAO_CS[regs[0]];
  else if (r < 0.95 && regs[1]) pool = ICAO_CS[regs[1]];
  else pool = Object.values(ICAO_CS).flat();
  return pool[Math.floor(rng() * pool.length)];
}

export function genCS(
  org: string,
  used: Set<string> = new Set(),
  { pfx = null, heavy = false }: { pfx?: string | null; heavy?: boolean } = {},
) {
  for (let t = 0; t < 50; t++) {
    const ic = pfx || pickIcao(org, { heavy });
    const n = Math.floor(rng() * 8999) + 100;
    const cs = `${ic}${n}`;
    if (!used.has(cs)) {
      used.add(cs);
      return cs;
    }
  }
  const fb = `${pickIcao(org, { heavy })}${Date.now().toString().slice(-4)}`;
  used.add(fb);
  return fb;
}
