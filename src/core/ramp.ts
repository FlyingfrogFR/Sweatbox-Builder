// ramp.ts — RampAgent stand fitness + parsing, copied VERBATIM from the rc3
// shell. aircraftFootprint reads the active RampAgent config; the shell kept it
// on window.SB.rampConfig, the port keeps it behind getRampConfig()/setRampConfig().

import { TYPE_CATS } from "./tables";

let _rampConfig: any = null;
export function setRampConfig(cfg: any): void {
  _rampConfig = cfg || null;
}
export function getRampConfig(): any {
  return _rampConfig;
}

export function wingspanToCode(ws: number) {
  if (!isFinite(ws)) return "C";
  if (ws < 15) return "A";
  if (ws < 24) return "B";
  if (ws < 36) return "C";
  if (ws < 52) return "D";
  if (ws < 65) return "E";
  return "F";
}

export const WTC_FALLBACK: Record<string, number> = { L: 13, M: 36, H: 60, J: 80 };

export function aircraftFootprint(type: string) {
  const t = String(type || "").toUpperCase();
  const cfg = getRampConfig();
  let ws = cfg?.aircraftWingspans?.[t];
  if (!isFinite(ws)) {
    let wtc = "M";
    for (const [cat, info] of Object.entries(TYPE_CATS)) {
      if (info.types.includes(t)) {
        wtc = cat;
        break;
      }
    }
    ws = WTC_FALLBACK[wtc];
  }
  return { code: wingspanToCode(ws), ws };
}

export function standFitsType(stand: any, type: string) {
  const fp = aircraftFootprint(type);
  if (stand.code && !stand.code.includes(fp.code)) return false;
  if (stand.wingspan !== null && fp.ws > stand.wingspan) return false;
  return true;
}

export function pickStand(
  stands: any[],
  type: string,
  { occupied = new Set(), callsignPrefix = null, useFilter = null }: any = {},
) {
  const blocked = new Set();
  for (const lbl of occupied) {
    const s = stands.find((x) => x.label === lbl);
    if (s) for (const b of s.block) blocked.add(b);
  }
  const candidates = stands.filter((s) => {
    if (occupied.has(s.label)) return false;
    if (blocked.has(s.label)) return false;
    if (useFilter && s.use && s.use !== useFilter) return false;
    return standFitsType(s, type);
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const aMatch = callsignPrefix && a.callsigns.includes(callsignPrefix) ? 0 : 1;
    const bMatch = callsignPrefix && b.callsigns.includes(callsignPrefix) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.label.localeCompare(b.label);
  });
  return candidates[0];
}

// ── RampAgent JSON parsing, copied VERBATIM from the rc3 shell ────────────────

export function detectRampFileKind(json: any) {
  if (!json || typeof json !== "object") return null;
  if (json.AircraftWingspans && typeof json.AircraftWingspans === "object") return "config";
  if (json.ICAO && json.Stands && typeof json.Stands === "object") return "airport";
  return null;
}

export function parseRampAirport(json: any) {
  const icao = String(json.ICAO || "").toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(icao)) throw new Error(`Invalid or missing ICAO: "${json.ICAO}"`);
  const stands: any[] = [];
  for (const [label, s] of Object.entries<any>(json.Stands || {})) {
    if (!s || typeof s !== "object") continue;
    const coords = String(s.Coordinates || "")
      .split(":")
      .map((x) => parseFloat(x.trim()));
    if (coords.length < 2 || !isFinite(coords[0]) || !isFinite(coords[1])) continue;
    stands.push({
      label: String(label),
      lat: coords[0],
      lon: coords[1],
      code: s.Code ? String(s.Code).toUpperCase() : null,
      wingspan: typeof s.Wingspan === "number" ? s.Wingspan : null,
      use: s.Use ? String(s.Use).toUpperCase() : null,
      priority: typeof s.Priority === "number" ? s.Priority : 5,
      callsigns: Array.isArray(s.Callsigns) ? s.Callsigns.map((c: any) => String(c).toUpperCase()) : [],
      block: Array.isArray(s.Block) ? s.Block.map(String) : [],
      remark: s.Remark || null,
    });
  }
  return { kind: "airport", icao, version: json.version || null, stands };
}

export function parseRampConfig(json: any) {
  return {
    kind: "config",
    version: json.version || null,
    aircraftWingspans: Object.fromEntries(
      Object.entries<any>(json.AircraftWingspans || {})
        .map(([k, v]) => [k.toUpperCase(), +v])
        .filter(([, v]) => isFinite(v as number)),
    ),
    generalAviation: new Set((json.GeneralAviation || []).map((t: any) => t.toUpperCase())),
    helicopters: new Set((json.Helicopters || []).map((t: any) => t.toUpperCase())),
    cargoOperators: new Set((json.CargoOperator || []).map((c: any) => c.toUpperCase())),
    military: new Set((json.Military || []).map((t: any) => t.toUpperCase())),
    raw: json,
  };
}

export function parseRampAgent(json: any) {
  const kind = detectRampFileKind(json);
  if (kind === "config") return parseRampConfig(json);
  if (kind === "airport") return parseRampAirport(json);
  throw new Error("Unrecognised RampAgent JSON (no AircraftWingspans, no ICAO+Stands)");
}
