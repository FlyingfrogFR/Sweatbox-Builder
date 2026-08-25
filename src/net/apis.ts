// apis.ts — SimBrief / VATSIM (and any FlightPlanDatabase) calls.
// Ported from the rc3 shell; fetch() is replaced with httpFetch()
// (net/http.ts), which uses the Tauri HTTP plugin on desktop —
// native requests that bypass CORS in dev and prod, so no proxy is needed.

import { httpFetch } from "./http";
import { matchesEndpoint } from "../core/icaoRegions";

export async function fetchSimbrief(u: string) {
  const p = /^\d+$/.test(u.trim())
    ? `userid=${u.trim()}`
    : `username=${encodeURIComponent(u.trim())}`;
  const r = await httpFetch(`https://www.simbrief.com/api/xml.fetcher.php?${p}&json=1`);
  if (!r.ok) throw new Error(`SimBrief ${r.status}`);
  return r.json();
}

export function parseSimbriefOFP(d: any) {
  const origin = (d.origin?.icao_code || d.params?.orig_icao || "").toUpperCase();
  const dest = (d.destination?.icao_code || d.params?.dest_icao || "").toUpperCase();
  const callsign = (
    d.atc?.callsign ||
    (d.general?.icao_airline || "") + (d.general?.flight_number || "") ||
    ""
  ).toUpperCase();
  const type = (d.aircraft?.icaocode || d.aircraft?.base_type || "").toUpperCase();
  const cruiseFL = Math.round((+d.general?.initial_altitude || 35000) / 100);
  const route = (d.atc?.route || d.general?.route || "")
    .replace(origin, "")
    .replace(dest, "")
    .trim();
  return {
    origin,
    dest,
    callsign,
    type,
    cruiseFL,
    route,
    squawk: d.atc?.sqwk || "2000",
  };
}

export async function fetchVatsimData() {
  const r = await httpFetch("https://data.vatsim.net/v3/vatsim-data.json");
  if (!r.ok) throw new Error(`VATSIM ${r.status}`);
  return r.json();
}

export function filterVatsimPilots(data: any, icao: string, mode: string) {
  const uc = icao.toUpperCase();
  return vatsimRows(data, (fp) => {
    if (mode === "dep") return fp.departure === uc;
    if (mode === "arr") return fp.arrival === uc;
    return fp.departure === uc || fp.arrival === uc;
  });
}

/**
 * Live traffic on a city pair, where either end may be a single airport
 * ("LFPG"), a whole country ("LE**" / "LE") or anywhere (""). Lets a session be
 * stocked with, say, everything Spain → France rather than one airport's
 * arrivals.
 */
export function filterVatsimRoutes(data: any, from: string, to: string) {
  return vatsimRows(
    data,
    (fp) => matchesEndpoint(fp.departure, from) && matchesEndpoint(fp.arrival, to),
  );
}

function vatsimRows(data: any, keep: (fp: any) => boolean) {
  return [...(data.pilots || []), ...(data.prefiles || [])]
    .filter((p) => {
      const fp = p.flight_plan;
      if (!fp) return false;
      return keep(fp);
    })
    .map((p) => ({
      callsign: p.callsign,
      type: p.flight_plan?.aircraft_short || "",
      dep: p.flight_plan?.departure || "",
      arr: p.flight_plan?.arrival || "",
      route: p.flight_plan?.route || "",
      squawk: p.flight_plan?.assigned_transponder || p.transponder || "2000",
      isPrefiled: !p.latitude,
      cruiseFL: Math.round(parseInt(p.flight_plan?.altitude || 0) / 100) || 0,
    }));
}
