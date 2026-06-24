// generateSweatbox.ts
//
// Copied VERBATIM from the rc3 shell (function generateSweatbox). This is the
// EuroScope .scn serializer — output parity is the top priority, so nothing here
// is reinterpreted. Preserves: AIRPORT_ALT formatting, ILS lines, the
// HOLDING:<fix>:<inbound>:<-1|1> directive, per-controller PSEUDOPILOT:ALL, the
// @N line with heading encoded as round(heading*2.88)*4 (fields 8 and 10 literal
// zeros), $FP / SIMDATA:...:0.010:0.0 / $ROUTE, optional START, DELAY:3:7,
// optional REQALT:<wpt>:<alt>, and optional INITIALPSEUDOPILOT.

import { preEntryOffset, bearingBetween } from "./geo";

export function generateSweatbox(s: any, waypoints: any[] = [], opts: any = {}) {
  const initPP = (opts.initPseudoPilot || "").trim();
  const L = ["PSEUDOPILOT:ALL", "", `AIRPORT_ALT:${(+s.airportAlt).toFixed(1)}`, ""];
  for (const ils of s.ils)
    L.push(
      `ILS${ils.name}:${(+ils.lat1).toFixed(7)}:${(+ils.lon1).toFixed(7)}:${(+ils.lat2).toFixed(7)}:${(+ils.lon2).toFixed(7)}`,
    );
  // HOLDING:<fix>:<inbound>:<-1|1>   (−1 = left, 1 = right)
  for (const h of s.holdings || [])
    if (h.fix) L.push(`HOLDING:${h.fix}:${+h.inboundCourse || 0}:${h.turn === "L" ? -1 : 1}`);
  L.push("");
  for (const c of s.controllers) {
    L.push("PSEUDOPILOT:ALL");
    L.push(`CONTROLLER:${c.callsign}:${c.freq}`);
  }
  for (const a of s.aircraft) {
    let sLat = +a.lat,
      sLon = +a.lon;
    if ((+a.preEntryNm || 0) > 0 && a.spawnWaypoint && waypoints.length > 0) {
      const off = preEntryOffset(a.spawnWaypoint, a.simRoute, +a.preEntryNm, waypoints, a.fpRoute);
      if (off) {
        sLat = off.lat;
        sLon = off.lon;
      }
    }
    // Initial heading — encoded into @N's 9th field per EuroScope's
    // scenario file docs (https://www.euroscope.hu/wp/scenario-file/).
    // The documented format is:
    //   @<flag>:<cs>:<sqk>:1:<lat>:<lon>:<alt>:0:<encoded_heading>:0
    // Fields 8 and 10 are LITERAL ZEROS. Field 9 is heading encoded as:
    //   ((int)(heading * 2.88 + 0.5)) << 2     ≡   round(h * 2.88) * 4
    //
    // Previous code wrote `gs` into field 9 (treating it as groundspeed,
    // which @N has no field for) and computed heading into field 8
    // (which is a static 0). EuroScope was decoding the `gs` value as an
    // encoded heading: gs of 0–280 decodes to 0°–26°, which is exactly
    // the "every aircraft spawns pointing north" symptom we started from.
    //
    // Heading computation:
    // - Primary: bearing from the (post-offset) spawn position to the
    //   immediate next route token. Walking further when it's not in
    //   navdata can pick a far waypoint in a misleading direction.
    // - Departure fallback: runway heading × 10 when the next-token
    //   lookup fails. SIDs typically hold runway heading on the first
    //   leg, so this beats defaulting to 0.
    let hdg: number | null = null;
    if (a.simRoute && waypoints.length > 0) {
      const toks = String(a.simRoute)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => t.split("/")[0].toUpperCase());
      const spawnWpt = (a.spawnWaypoint || "").toUpperCase();
      const targetIdx = toks[0] === spawnWpt ? 1 : 0;
      if (targetIdx < toks.length) {
        const target = waypoints.find((w) => w.name === toks[targetIdx]);
        if (target) hdg = Math.round(bearingBetween(sLat, sLon, target.lat, target.lon));
      }
    }
    if (hdg === null && a.isDeparture && a.runway) {
      const m = String(a.runway).match(/^(\d{1,2})/);
      if (m) hdg = +m[1] * 10;
    }
    if (hdg === null) hdg = 0;
    const encodedHdg = Math.round(hdg * 2.88) * 4;
    L.push("", "PSEUDOPILOT:ALL");
    L.push(
      `@N:${a.callsign}:${a.squawk}:1:${sLat.toFixed(7)}:${sLon.toFixed(7)}:${a.alt}:0:${encodedHdg}:0`,
    );
    L.push(
      `$FP${a.callsign}:*A:I:${a.type}:420:${a.origin}:0000:0000:${a.cruiseAlt}:${a.dest}:00:00:0:0::/v/:${a.fpRoute}`,
    );
    L.push(`SIMDATA:${a.callsign}:*:*:25:1:0.010:0.0`);
    L.push(`$ROUTE:${a.simRoute}`);
    if (a.start !== "" && a.start != null && +a.start > 0) L.push(`START:${a.start}`);
    L.push("DELAY:3:7");
    if (a.reqAltWpt && a.reqAltVal) L.push(`REQALT:${a.reqAltWpt}:${a.reqAltVal}`);
    if (initPP) L.push(`INITIALPSEUDOPILOT:${initPP}`);
  }
  L.push("");
  return L.join("\n");
}
