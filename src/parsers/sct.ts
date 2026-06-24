// sct.ts — EuroScope sector (.sct) parser, copied VERBATIM from the rc3 shell.
import { parseDMS } from "../core/geo";

export function parseSectorFile(text: string) {
  const waypoints: any[] = [],
    airports: any[] = [],
    runways: any[] = [],
    seen = new Set<string>();
  let section: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/;.*$/, "").trim();
    if (!line) continue;
    const s = line.match(/^\[([A-Z]+)\]/);
    if (s) {
      section = s[1];
      continue;
    }
    if (!section) continue;
    if (section === "RUNWAY") {
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;
      const [id1, id2, h1, h2, lat1s, lon1s, lat2s, lon2s, apt] = parts;
      const c1 = parseDMS(lat1s + " " + lon1s);
      const c2 = parseDMS(lat2s + " " + lon2s);
      if (!c1 || !c2) continue;
      runways.push({
        ident1: id1,
        ident2: id2,
        hdg1: +h1 || 0,
        hdg2: +h2 || 0,
        lat1: c1.lat,
        lon1: c1.lon,
        lat2: c2.lat,
        lon2: c2.lon,
        airport: (apt || "").toUpperCase(),
      });
      continue;
    }
    const coord = parseDMS(line);
    if (!coord) continue;
    const name = line.split(/\s+/)[0].toUpperCase();
    if (!name || name.length > 10) continue;
    const key = `${section}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = { name, ...coord, type: section };
    if (section === "AIRPORT") airports.push(entry);
    else if (["FIXES", "VOR", "NDB"].includes(section)) waypoints.push(entry);
  }
  return { waypoints, airports, runways };
}
