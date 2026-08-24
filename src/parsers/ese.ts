// ese.ts — EuroScope ESE parser (POSITIONS / SIDSSTARS / COPX / FREETEXT gates),
// copied VERBATIM from the rc3 shell.
import { parseDMS } from "../core/geo";
import { GATE_DENYLIST } from "../core/tables";

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
    if (section === "COPX") {
      const p = line.split(":");
      if (p.length < 4) continue;
      // COPX: lines are internal sector splits; FIR_COPX: lines are the
      // cross-FIR gates (in the CoFrance LFXX.ese ALL external gates are
      // FIR_COPX). Both parse identically; `kind` + the FIR prefixes of the
      // two sector fields (text before the first "·", e.g. "LFBB·L1 UAC" →
      // "LFBB") let auto-boundary spawning pick out gates INTO a given FIR.
      const kind = p[0].trim().toUpperCase() === "FIR_COPX" ? "fir" : "copx";
      const firOf = (f: string) => {
        const pre = String(f || "")
          .split("·")[0]
          .trim()
          .toUpperCase();
        return /^[A-Z]{4}$/.test(pre) ? pre : "";
      };
      const fromFir = p.length > 6 ? firOf(p[6]) : "";
      const toFir = p.length > 7 ? firOf(p[7]) : "";
      let level: number | null = null;
      for (let i = p.length - 1; i >= 1; i--) {
        const t = p[i].trim();
        const m = t.match(/^(?:FL)?(\d{2,5})$/i);
        if (m) {
          const n = +m[1];
          level = t.toUpperCase().startsWith("FL") || n < 1000 ? n * 100 : n;
          break;
        }
      }
      if (level === null) continue;
      let fix: string | null = null,
        destApt = "";
      for (const f of p.slice(1)) {
        const t = f.trim();
        if (t === "*" || !t) continue;
        if (/^[A-Z]{4}$/.test(t) && !destApt) {
          destApt = t;
          continue;
        }
        if (/^[A-Z]{2,6}$/.test(t) && !fix) {
          fix = t;
        }
      }
      if (fix)
        copx.push({
          fix: fix.toUpperCase(),
          level,
          destApt: destApt.toUpperCase(),
          kind,
          fromFir,
          toFir,
        });
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
  return { positions, stars, copx, gates };
}
