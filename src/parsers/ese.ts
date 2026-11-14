// ese.ts — EuroScope ESE parser (POSITIONS / SIDSSTARS / COPX / FREETEXT gates),
// copied VERBATIM from the rc3 shell.
import { parseDMS } from "../core/geo";
import { GATE_DENYLIST } from "../core/tables";

// "no upper limit" as a plain number so it survives JSON round-trips.
export const NO_CEILING = 999999;

export function detectIaf(name: string, waypoints: string[]) {
  let lastMatch: string | null = null;
  for (const part of (name || "").split(/x/i)) {
    const m = part.match(/^([A-Z]+)\d[A-Z]?$/i);
    if (!m) continue;
    const prefix = m[1].toUpperCase();
    const exact = waypoints.find((w) => w.toUpperCase() === prefix);
    if (exact) {
      lastMatch = exact;
      continue;
    }
    const prefixMatch = waypoints.find((w) => w.toUpperCase().startsWith(prefix));
    if (prefixMatch) lastMatch = prefixMatch;
  }
  return lastMatch;
}

export function parseESE(text: string) {
  const positions: any[] = [],
    stars: any[] = [],
    copx: any[] = [],
    gates: any[] = [];
  const seen = new Set<string>();
  let section: string | null = null;
  // [AIRSPACE] geometry — SECTORLINE:<id> + COORD: lines are polylines, and
  // SECTOR:<FIR>·<name>·… + BORDER:<id>:<id>… says which polylines bound which
  // sector. Every ESE has this, so FIR boundaries are derivable even when a
  // file carries no FIR_COPX gates at all.
  const sectorLines = new Map<string, number[][]>(); // id -> [[lat,lon], …]
  // FIR -> sectorline id -> [lowest floor, highest ceiling] of the sectors of
  // that FIR bounded by the line. Sector blocks carry their band in feet
  // ("SECTOR:LFBB·P1 1 UAC·195·265:19500:26500"), and most sectorlines are
  // low-level TMA/CTR edges a UAC-level flight never crosses — so the band
  // travels with the line and the crossing scan can ignore the irrelevant ones.
  const firLineBands = new Map<string, Map<string, [number, number]>>();
  // v10: which sectors each line bounds, so "is this point inside the FIR"
  // can be answered per sector (stacked sectors share an outline, and the
  // internal splits break a single ray cast over every line). A sector gets a
  // per-FIR ordinal in reading order; whether it takes part is decided once
  // the whole file is read, because its lines may be defined after it.
  const firSectorCount = new Map<string, number>();
  const sectors: { fir: string; ord: number; ids: Set<string> }[] = [];
  let curSector: { fir: string; ord: number; ids: Set<string> } | null = null;
  let curLine: string | null = null;
  let curSectorFir: string | null = null;
  let curSectorBand: [number, number] = [0, NO_CEILING];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/;.*$/, "").trim();
    if (!line) continue;
    const s = line.match(/^\[([A-Z]+)\]/i);
    if (s) {
      section = s[1].toUpperCase();
      continue;
    }
    if (section === "POSITIONS") {
      const parts = line.split(":");
      if (parts.length < 3) continue;
      let callsign,
        name,
        freq,
        type = "";
      if (/^\d+\.\d+$/.test(parts[2])) {
        callsign = parts[0].trim();
        name = parts[1].trim();
        freq = parts[2].trim();
        type = (parts[3] || "").trim();
      } else if (parts.length >= 4 && /^\d+\.\d+$/.test(parts[3])) {
        callsign = parts[0].trim();
        name = (parts[1] + " " + parts[2]).trim();
        freq = parts[3].trim();
        type = (parts[4] || "").trim();
      } else continue;
      if (!callsign || !freq) continue;
      const key = callsign + ":" + freq;
      if (seen.has(key)) continue;
      seen.add(key);
      positions.push({ callsign, name, freq, type });
    }
    if (section === "SIDSSTARS") {
      const p = line.split(":");
      if (p[0].toUpperCase() === "STAR" && p.length >= 5) {
        const wpts = p[4].trim().split(/\s+/).filter(Boolean);
        if (wpts.length > 0) {
          const starName = p[3].trim();
          const iaf = detectIaf(starName, wpts);
          if (iaf)
            stars.push({
              airport: p[1].trim().toUpperCase(),
              runway: p[2].trim().toUpperCase(),
              name: starName,
              waypoints: wpts,
              iaf,
            });
        }
      }
    }
    if (line.startsWith("SECTORLINE:")) {
      curLine = line.slice(11).trim();
      curSectorFir = null;
      curSector = null;
      if (!sectorLines.has(curLine)) sectorLines.set(curLine, []);
      continue;
    }
    if (line.startsWith("CIRCLE_SECTORLINE:")) {
      // circular sectorlines carry no COORD list — nothing to trace
      curLine = null;
      curSectorFir = null;
      curSector = null;
      continue;
    }
    if (line.startsWith("COORD:") && curLine) {
      const p = line.split(":");
      const c = parseDMS(`${(p[1] || "").trim()} ${(p[2] || "").trim()}`);
      if (c) sectorLines.get(curLine)!.push([c.lat, c.lon]);
      continue;
    }
    if (line.startsWith("SECTOR:")) {
      // "SECTOR:LFBB·BIARRITZ CTR·000·003:00000:00300" — the FIR is the
      // leading ICAO prefix of the sector name (same encoding caveat as COPX).
      curLine = null;
      const sp = line.split(":");
      curSectorFir =
        (sp[1] || "")
          .trim()
          .toUpperCase()
          .match(/^([A-Z]{4})/)?.[1] || null;
      const lo = (sp[2] || "").trim();
      const hi = (sp[3] || "").trim();
      curSectorBand = [/^\d+$/.test(lo) ? +lo : 0, /^\d+$/.test(hi) ? +hi : NO_CEILING];
      curSector = null;
      if (curSectorFir) {
        const ord = firSectorCount.get(curSectorFir) || 0;
        firSectorCount.set(curSectorFir, ord + 1);
        curSector = { fir: curSectorFir, ord, ids: new Set() };
        sectors.push(curSector);
      }
      continue;
    }
    if (line.startsWith("BORDER:") && curSectorFir) {
      const ids = line
        .split(":")
        .slice(1)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!firLineBands.has(curSectorFir)) firLineBands.set(curSectorFir, new Map());
      const bands = firLineBands.get(curSectorFir)!;
      if (curSector) for (const id of ids) curSector.ids.add(id);
      for (const id of ids) {
        const b = bands.get(id);
        if (b) {
          b[0] = Math.min(b[0], curSectorBand[0]);
          b[1] = Math.max(b[1], curSectorBand[1]);
        } else bands.set(id, [curSectorBand[0], curSectorBand[1]]);
      }
      continue;
    }

    // COPX / FIR_COPX — coordination points. Real ESE files carry these
    // INSIDE [AIRSPACE] (there is no [COPX] section; the rc3 prototype looked
    // for one, which is why no COPX ever loaded from a real file), so they are
    // matched by line prefix instead of by section.
    //
    // EuroScope's format is positional, 11 fields:
    //   COPX:dep:depRwy:COP FIX:arr:arrRwy:sectorBefore:sectorAfter:climbLvl:descendLvl:name
    // Field 1 is the departure point and often looks like a fix (VANAD), so the
    // old "first token that looks like a fix wins" heuristic picked the wrong
    // one — the crossing point is always field 3.
    const copxKind = /^(FIR_)?COPX:/i.exec(line);
    if (copxKind) {
      const p = line.split(":");
      if (p.length < 10) continue;
      const kind = p[0].trim().toUpperCase() === "FIR_COPX" ? "fir" : "copx";
      let fix = (p[3] || "").trim().toUpperCase();
      const apt = (p[4] || "").trim().toUpperCase();
      // Field 1 is the departure airport whenever it is one — in both shapes
      // below. Climb-out lines ("Nantes departures via TUPAR are handed over
      // climbing FL230") are keyed on it.
      const d1 = (p[1] || "").trim().toUpperCase();
      const depApt = /^[A-Z]{4}$/.test(d1) ? d1 : "";
      // The fix the route must continue to after the COP, when the arrival
      // slot names one instead of an airport:
      //   FIR_COPX:LFRS:*:TUPAR:CNA:*:…:23000:*:TUPAR   (via TUPAR then CNA → FL230)
      let nextFix = "";
      // Departure-flow lines leave the COP slot empty and carry the crossing
      // point in the arrival slot instead:
      //   FIR_COPX:LFPG:*:*:AGOPA:*:LFFF·DG2 UAC·195·265:LFBB·P1 2 UAC·265·295:26000:*:UP
      // These lines hold the departure climb levels, so they belong in the
      // gate set.
      if (fix === "*" && /^[A-Z0-9]{2,6}$/.test(apt) && apt.length !== 4) {
        fix = apt;
      } else if (
        apt !== "*" &&
        apt !== fix &&
        !/^[A-Z]{4}$/.test(apt) &&
        /^[A-Z0-9]{2,6}$/.test(apt)
      ) {
        nextFix = apt;
      }
      if (!/^[A-Z0-9]{2,6}$/.test(fix)) continue; // no named crossing point at all
      const destApt = apt !== fix && /^[A-Z]{4}$/.test(apt) ? apt : "";
      // Sector fields are "<FIR>·<sector>·<lowFL>·<highFL>", e.g.
      // "LFRR·ZS UAC·295·345". The separator is a Latin-1 middle dot (0xB7),
      // which becomes U+FFFD when the file is read as UTF-8 — so the FIR is
      // taken as the leading four letters and the band from the last two
      // numeric segments, either way. FIR boundaries are LEVEL-DEPENDENT: the
      // same fix can be a gate in one band and sit inside a neighbour's
      // airspace in another, so the band travels with the entry.
      const sectorOf = (f: string) => {
        const t = String(f || "")
          .trim()
          .toUpperCase();
        const fir = (t.match(/^([A-Z]{4})/) || [])[1] || "";
        const nums = t
          .split(/[\u00B7\uFFFD]/)
          .map((x) => x.trim())
          .filter((x) => /^\d{2,3}$/.test(x));
        const lower = nums.length >= 2 ? +nums[nums.length - 2] * 100 : 0;
        const upper = nums.length >= 2 ? +nums[nums.length - 1] * 100 : NO_CEILING;
        return { fir, lower, upper };
      };
      const from = sectorOf(p[6]);
      const to = sectorOf(p[7]);
      const fromFir = from.fir;
      const toFir = to.fir;
      // "FL230" / "230" / "23000" → 23000; "*" or anything else → null.
      const lvl = (raw: string | undefined): number | null => {
        const m = (raw || "").trim().match(/^(?:FL)?(\d{2,5})$/i);
        if (!m) return null;
        const n = +m[1];
        return (raw || "").trim().toUpperCase().startsWith("FL") || n < 1000 ? n * 100 : n;
      };
      const climbLevel = lvl(p[8]);
      const descendLevel = lvl(p[9]);
      // Descend level if set, else climb level (matches the old right-to-left
      // scan) — the STAR reqAlt auto-fill reads this one.
      const level: number | null = descendLevel ?? climbLevel;
      // A gate with no published climb/descend level is still a gate — keep it
      // (consumers that need a level, i.e. the STAR reqAlt auto-fill, ask for
      // one explicitly). Dropping these lost real crossing points: DEKOD's
      // FL195-265 line into LFBB publishes no level at all.
      copx.push({
        fix,
        level,
        destApt,
        depApt,
        nextFix,
        climbLevel,
        descendLevel,
        kind,
        fromFir,
        toFir,
        fromLower: from.lower,
        fromUpper: from.upper,
        toLower: to.lower,
        toUpper: to.upper,
      });
      continue;
    }

    if (section === "FREETEXT") {
      const p = line.split(":");
      if (p.length < 4) continue;
      const groupMatch = (p[2] || "").match(
        /^([A-Z]{4})[\s_\/\-]+(?:Gates?|Stands?|Parking|Apron)/i,
      );
      if (!groupMatch) continue;
      const label = (p[3] || "").trim();
      if (!label || GATE_DENYLIST.some((re) => re.test(label))) continue;
      const coord = parseDMS(p[0] + " " + p[1]);
      if (!coord) continue;
      gates.push({ icao: groupMatch[1].toUpperCase(), label, lat: coord.lat, lon: coord.lon });
    }
  }
  // FIR boundary = every segment of every sectorline the FIR's sectors use.
  // Internal splits are included on purpose: an aircraft arriving from outside
  // necessarily crosses the perimeter first, so "first crossing along the
  // route" is the entry point, and keeping every line means no perimeter gap
  // where a neighbouring FIR happens to be undefined in the file.
  // Segments are [lat1, lon1, lat2, lon2, floorFt, ceilingFt, s1, s2, …]: the
  // trailing numbers are the per-FIR ordinals of the sectors the line bounds
  // (v10, for insideFir). A sector takes part only if every one of its border
  // lines has a traced outline — a CIRCLE_SECTORLINE border has none, so that
  // sector's polygon is open. A 4-number segment (navdata saved before bands
  // existed) applies at every level; a 6-number one has no sector ordinals.
  // Stacked sectors with the same BORDER set have the same outline, hence the
  // same even-odd parity: only the first one's ordinal is kept, so a deep
  // stack does not multiply the stored segments (firBounds lives in the
  // localStorage quota).
  const lineOrds = new Map<string, Set<number>>(); // `${fir}\n${id}` -> ordinals
  const outlines = new Set<string>(); // `${fir}\n${sorted ids}` already represented
  for (const sec of sectors) {
    if (!sec.ids.size) continue;
    let closed = true;
    for (const id of sec.ids) if ((sectorLines.get(id) || []).length < 2) closed = false;
    if (!closed) continue;
    const outline = `${sec.fir}\n${[...sec.ids].sort().join("\n")}`;
    if (outlines.has(outline)) continue;
    outlines.add(outline);
    for (const id of sec.ids) {
      const k = `${sec.fir}\n${id}`;
      if (!lineOrds.has(k)) lineOrds.set(k, new Set());
      lineOrds.get(k)!.add(sec.ord);
    }
  }
  const firBounds: Record<string, number[][]> = {};
  const r5 = (n: number) => Math.round(n * 1e4) / 1e4; // ~11 m, plenty for a 1 NM spawn offset
  for (const [fir, bands] of firLineBands) {
    const segs: number[][] = [];
    for (const [id, band] of bands) {
      const pts = sectorLines.get(id) || [];
      const ords = [...(lineOrds.get(`${fir}\n${id}`) || [])].sort((a, b) => a - b);
      for (let i = 0; i < pts.length - 1; i++)
        segs.push([
          r5(pts[i][0]),
          r5(pts[i][1]),
          r5(pts[i + 1][0]),
          r5(pts[i + 1][1]),
          band[0],
          band[1],
          ...ords,
        ]);
    }
    if (segs.length) firBounds[fir] = segs;
  }

  return { positions, stars, copx, gates, firBounds };
}
