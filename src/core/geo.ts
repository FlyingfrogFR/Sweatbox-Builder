// geo.ts — coordinate + bearing helpers, copied VERBATIM from the rc3 shell
// (distanceNm and the preEntryOffset airway-walk are post-rc3 additions).

import { nearestResolvableIdx } from "./route";

export function parseDMS(str: string) {
  const m = str.match(
    /([NS])(\d{1,3})\.(\d{1,2})\.(\d{1,2})\.?(\d{0,3})\s+([EW])(\d{1,3})\.(\d{1,2})\.(\d{1,2})\.?(\d{0,3})/,
  );
  if (!m) return null;
  const [, nsh, nd, nm, ns, nms, ewh, ed, em, es, ems] = m;
  let lat = +nd + +nm / 60 + (+ns + (+nms || 0) / 1000) / 3600;
  if (nsh === "S") lat = -lat;
  let lon = +ed + +em / 60 + (+es + (+ems || 0) / 1000) / 3600;
  if (ewh === "W") lon = -lon;
  return { lat: +lat.toFixed(7), lon: +lon.toFixed(7) };
}

export function bearingBetween(la1: number, lo1: number, la2: number, lo2: number) {
  const φ1 = (la1 * Math.PI) / 180,
    φ2 = (la2 * Math.PI) / 180,
    Δλ = ((lo2 - lo1) * Math.PI) / 180;
  return (
    ((Math.atan2(
      Math.sin(Δλ) * Math.cos(φ2),
      Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ),
    ) *
      180) /
      Math.PI +
      360) %
    360
  );
}

export function destinationPoint(lat: number, lon: number, brg: number, nm: number) {
  const R = 3440.065,
    d = nm / R,
    φ1 = (lat * Math.PI) / 180,
    λ1 = (lon * Math.PI) / 180,
    θ = (brg * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: (φ2 * 180) / Math.PI, lon: (((λ2 * 180) / Math.PI + 540) % 360) - 180 };
}

export function distanceNm(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 3440.065,
    φ1 = (la1 * Math.PI) / 180,
    φ2 = (la2 * Math.PI) / 180,
    Δφ = ((la2 - la1) * Math.PI) / 180,
    Δλ = ((lo2 - lo1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// preEntryOffset: place the aircraft `nm` NM upstream from `wptName`.
// Tries simRoute, fpRoute, starRoute in that order to find an upstream
// fix to bearing-back from. Falls back to bearing-forward (downstream fix
// reversed) if no upstream fix is available.
export function preEntryOffset(
  wptName: string,
  simRoute: string,
  nm: number,
  wpts: any[],
  fpRoute?: string,
  starRoute?: string,
) {
  if (!nm || nm <= 0) return null;
  const wp = wpts.find((w) => w.name === wptName);
  if (!wp) return null;
  const tok = (s: any) =>
    String(s || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.split("/")[0].toUpperCase());
  const target = wptName.toUpperCase();
  let brg: number | undefined, fallback: number | undefined;
  for (const route of [simRoute, fpRoute, starRoute]) {
    if (!route) continue;
    const toks = tok(route);
    const idx = toks.findIndex((t) => t === target);
    if (idx < 0) continue;
    // Walk past airway designators (UN858, UT191…) — real filed routes
    // interleave them with fixes and they never resolve in navdata. When the
    // immediate neighbour resolves (all golden fixtures) the walk lands on the
    // same token, so legacy output is byte-identical.
    if (idx > 0) {
      const pi = nearestResolvableIdx(toks, idx - 1, -1, wpts);
      if (pi >= 0) {
        const p = wpts.find((w) => w.name === toks[pi]);
        brg = bearingBetween(p.lat, p.lon, wp.lat, wp.lon);
        break;
      }
    }
    if (fallback === undefined && idx < toks.length - 1) {
      const ni = nearestResolvableIdx(toks, idx + 1, 1, wpts);
      if (ni >= 0) {
        const n = wpts.find((w) => w.name === toks[ni]);
        fallback = bearingBetween(wp.lat, wp.lon, n.lat, n.lon);
      }
    }
  }
  if (brg === undefined) brg = fallback;
  if (brg === undefined) return null;
  return destinationPoint(wp.lat, wp.lon, (brg + 180) % 360, nm);
}
