// ground.ts
//
// S1 Ground generation, copied VERBATIM from scenario-s1-ground.js (the static
// airport data, stand-source resolution, and buildGroundAircraft). Mechanical
// changes only: Math.random() -> rng(), and the helpers the plugin pulled off
// window.SB (uid, emptyAc, genCS, pickStand, standFitsType, aircraftFootprint)
// are now explicit imports. The UI panel is ported separately and calls
// buildGroundAircraft from here.

import { uid } from "./uid";
import { emptyAc } from "./model";
import { genCS } from "./callsign";
import { pickStand } from "./ramp";
import { rng } from "./rng";

// ───────────────────────────────────────────────────────────────────────
// Per-airport scenario data (runways, exits, VFR neighbours).
// Stand data here is the LAST-RESORT fallback only — RampAgent supersedes
// it when loaded, and ESE [FREETEXT] gates supersede the hardcoded list.
// ───────────────────────────────────────────────────────────────────────
export const AIRPORTS: Record<string, any> = {
  LFLL: {
    name: "Lyon Saint-Exupéry",
    icao: "LFLL",
    elevation: 821,
    runways: ["35L", "35R", "17L", "17R"],
    defaultDepRwy: "35R",
    defaultArrRwy: "35L",
    fallbackStands: [
      { label: "A1", lat: 45.7242, lon: 5.089 }, { label: "A2", lat: 45.7247, lon: 5.0892 },
      { label: "A3", lat: 45.7252, lon: 5.0894 }, { label: "B1", lat: 45.7242, lon: 5.0908 },
      { label: "B2", lat: 45.7247, lon: 5.091 }, { label: "B3", lat: 45.7252, lon: 5.0912 },
      { label: "C1", lat: 45.7237, lon: 5.0922 }, { label: "C2", lat: 45.7242, lon: 5.0924 },
      { label: "GA1", lat: 45.722, lon: 5.0935 }, { label: "GA2", lat: 45.7223, lon: 5.0938 },
    ],
    rwyExits: {
      "35L": { lat: 45.7295, lon: 5.0855, gs: 30 }, "35R": { lat: 45.7298, lon: 5.095, gs: 30 },
      "17L": { lat: 45.7155, lon: 5.095, gs: 30 }, "17R": { lat: 45.7152, lon: 5.0855, gs: 30 },
    },
    vfrNearby: ["LFLY", "LFLB", "LFHP"],
  },
  LFBO: {
    name: "Toulouse-Blagnac",
    icao: "LFBO",
    elevation: 499,
    runways: ["14L", "14R", "32L", "32R"],
    defaultDepRwy: "14R",
    defaultArrRwy: "14L",
    fallbackStands: [
      { label: "A1", lat: 43.633, lon: 1.368 }, { label: "A2", lat: 43.6334, lon: 1.3683 },
      { label: "A3", lat: 43.6338, lon: 1.3686 }, { label: "B1", lat: 43.6325, lon: 1.3695 },
      { label: "B2", lat: 43.6329, lon: 1.3698 }, { label: "B3", lat: 43.6333, lon: 1.3701 },
      { label: "C1", lat: 43.632, lon: 1.3712 }, { label: "C2", lat: 43.6324, lon: 1.3715 },
      { label: "GA1", lat: 43.631, lon: 1.3725 }, { label: "GA2", lat: 43.6313, lon: 1.3728 },
    ],
    rwyExits: {
      "14L": { lat: 43.637, lon: 1.37, gs: 30 }, "14R": { lat: 43.636, lon: 1.368, gs: 30 },
      "32L": { lat: 43.624, lon: 1.355, gs: 30 }, "32R": { lat: 43.623, lon: 1.353, gs: 30 },
    },
    vfrNearby: ["LFCL", "LFBF", "LFDB"],
  },
  LFML: {
    name: "Marseille-Provence",
    icao: "LFML",
    elevation: 73,
    runways: ["13L", "13R", "31L", "31R"],
    defaultDepRwy: "31R",
    defaultArrRwy: "31L",
    fallbackStands: [
      { label: "A1", lat: 43.4435, lon: 5.215 }, { label: "A2", lat: 43.4439, lon: 5.2153 },
      { label: "A3", lat: 43.4443, lon: 5.2156 }, { label: "B1", lat: 43.443, lon: 5.2168 },
      { label: "B2", lat: 43.4434, lon: 5.2171 }, { label: "B3", lat: 43.4438, lon: 5.2174 },
      { label: "C1", lat: 43.4425, lon: 5.2185 }, { label: "C2", lat: 43.4429, lon: 5.2188 },
      { label: "GA1", lat: 43.4415, lon: 5.22 }, { label: "GA2", lat: 43.4418, lon: 5.2203 },
    ],
    rwyExits: {
      "13L": { lat: 43.447, lon: 5.208, gs: 30 }, "13R": { lat: 43.4465, lon: 5.2095, gs: 30 },
      "31L": { lat: 43.4395, lon: 5.227, gs: 30 }, "31R": { lat: 43.439, lon: 5.2285, gs: 30 },
    },
    vfrNearby: ["LFMQ", "LFTH", "LFNH"],
  },
};

export const IFR_TYPES = ["A320", "A321", "A20N", "A319", "B738", "E190", "E195", "AT76", "CRJ9", "A21N"];
export const VFR_TYPES = ["C172", "C152", "PA28", "DR40", "TB20", "BE36", "SR22", "SR20", "DA40", "C182"];
export const VFR_PFX = ["F-G", "F-H", "F-B", "D-E", "HB-", "OO-"];
export const DOMESTIC_DESTS = [
  "LFPG", "LFPO", "LFML", "LFLL", "LFMN", "LFBO", "LFBD", "LFRS", "LFST", "EGLL", "EHAM", "EDDF", "LIRF", "LEMD",
];

export function defaultGroundConfig() {
  const apt = AIRPORTS.LFLL;
  return {
    mode: "S1",
    airport: "LFLL",
    depRwy: apt.defaultDepRwy,
    arrRwy: apt.defaultArrRwy,
    total: 12,
    initialPopulated: 4,
    sessionLen: 30,
    vfrCount: 2,
    depRatio: 0.8,
    minArrSpacing: 3.0,
    twoGateSpacing: false,
  };
}

function genVfrCs(used: Set<string>) {
  for (let t = 0; t < 60; t++) {
    const pfx = VFR_PFX[Math.floor(rng() * VFR_PFX.length)];
    const tail =
      String.fromCharCode(65 + Math.floor(rng() * 26)) +
      String.fromCharCode(65 + Math.floor(rng() * 26)) +
      String.fromCharCode(65 + Math.floor(rng() * 26));
    const cs = pfx + tail;
    if (!used.has(cs)) {
      used.add(cs);
      return cs;
    }
  }
  const fb = VFR_PFX[0] + Date.now().toString(36).slice(-3).toUpperCase();
  used.add(fb);
  return fb;
}
const pickArr = (arr: any[], i: number) => arr[i % arr.length];
const pickRand = (arr: any[]) => arr[Math.floor(rng() * arr.length)];

// Resolve which stand source to use for a given airport.
// Returns { source: 'rampagent'|'ese'|'fallback', stands, supportsFitness }
export function resolveStandSource(apt: any, gates: any[], rampAgent: any) {
  const ra = rampAgent?.[apt.icao];
  if (ra && ra.stands && ra.stands.length) {
    return { source: "rampagent", stands: ra.stands, supportsFitness: true };
  }
  const eseGates = (gates || []).filter((g) => g.icao === apt.icao);
  if (eseGates.length) {
    return {
      source: "ese",
      stands: eseGates.map((g) => ({
        label: g.label, lat: g.lat, lon: g.lon, code: null, wingspan: null,
        use: null, priority: 5, callsigns: [], block: [], remark: null,
      })),
      supportsFitness: false,
    };
  }
  return {
    source: "fallback",
    stands: apt.fallbackStands.map((s: any) => ({
      label: s.label, lat: s.lat, lon: s.lon, code: null, wingspan: null,
      use: null, priority: 5, callsigns: [], block: [], remark: null,
    })),
    supportsFitness: false,
  };
}

// Pick a stand for an aircraft. Uses RampAgent fitness checks when available,
// otherwise round-robins through whatever list we have.
function pickStandForAircraft(
  standCtx: any,
  type: string,
  callsignPrefix: string | null,
  useFilter: string | null,
  occupied: Set<string>,
  fallbackIdx: number,
  twoHop: boolean,
) {
  if (standCtx.supportsFitness) {
    let occ = occupied;
    if (twoHop && occupied.size > 0) {
      occ = new Set(occupied);
      const standByLabel = new Map(standCtx.stands.map((s: any) => [s.label, s]));
      for (const lbl of occupied) {
        const s: any = standByLabel.get(lbl);
        if (!s) continue;
        for (const b of s.block) {
          occ.add(b);
          const bs: any = standByLabel.get(b);
          if (!bs) continue;
          for (const bb of bs.block) occ.add(bb);
        }
      }
    }
    const stand = pickStand(standCtx.stands, type, { occupied: occ, callsignPrefix, useFilter });
    if (stand) return { stand, reason: "fit" };
    return { stand: null, reason: "no-fit" };
  }
  if (occupied.size >= standCtx.stands.length) return { stand: null, reason: "no-fit" };
  let idx = fallbackIdx % standCtx.stands.length;
  let probes = 0;
  while (occupied.has(standCtx.stands[idx].label) && probes < standCtx.stands.length) {
    idx = (idx + 1) % standCtx.stands.length;
    probes++;
  }
  if (probes >= standCtx.stands.length) return { stand: null, reason: "no-fit" };
  return { stand: standCtx.stands[idx], reason: "roundrobin" };
}

// ───────────────────────────────────────────────────────────────────────
// Generation
// ───────────────────────────────────────────────────────────────────────
export function buildGroundAircraft(cfg: any, gates: any[], pool: any[], rampAgent: any) {
  const apt = AIRPORTS[cfg.airport];
  const warnings: string[] = [],
    errors: string[] = [];
  if (!apt) {
    return { aircraft: [], warnings, errors: ["Unknown airport: " + cfg.airport] };
  }

  const total = Math.max(0, +cfg.total || 0);
  const sessionLen = Math.max(1, +cfg.sessionLen || 30);
  const vfrCount = Math.max(0, +cfg.vfrCount || 0);
  const depRatio = Math.max(0, Math.min(1, +cfg.depRatio || 0.8));
  const minSpacing = Math.max(0, +cfg.minArrSpacing || 0);
  const ifrTotal = Math.max(0, total - vfrCount);
  const numDep = Math.round(ifrTotal * depRatio);
  const numArr = ifrTotal - numDep;

  const initialReq = Math.max(0, +cfg.initialPopulated || 0);
  const initialDepCount = Math.min(initialReq, numDep);
  if (initialReq > numDep) {
    warnings.push(
      `Initial population reduced from ${initialReq} to ${numDep} (only departures pre-populate gates).`,
    );
  }
  const sessionDepCount = numDep - initialDepCount;

  if (numArr > 0 && minSpacing > 0 && numArr * minSpacing > sessionLen) {
    warnings.push(
      `${numArr} arrivals × ${minSpacing} min spacing = ${(numArr * minSpacing).toFixed(1)} min, exceeds session length ${sessionLen} min — last arrivals will overflow the session window.`,
    );
  }

  if (cfg.mode === "S2") {
    warnings.push("S2 Tower mode is not yet implemented — generating S1 ground traffic only.");
  }

  // Pool filtering — pull routes/types/dests from matching pool entries.
  const poolDeps = (pool || []).filter((p) => p.origin === apt.icao && p.route);
  const poolArrs = (pool || []).filter((p) => p.dest === apt.icao && p.route);
  const pickDepTmpl = (i: number) => (poolDeps.length > 0 ? poolDeps[i % poolDeps.length] : null);
  const pickArrTmpl = (i: number) => (poolArrs.length > 0 ? poolArrs[i % poolArrs.length] : null);
  let usedPoolDeps = 0,
    usedPoolArrs = 0;

  if (numDep > 0 && poolDeps.length === 0) {
    warnings.push(
      `No pool departures from ${apt.icao} — generated routes use placeholder "DCT <dest>". Import flights from the Plans tab for realistic routes.`,
    );
  }
  if (numArr > 0 && poolArrs.length === 0) {
    warnings.push(
      `No pool arrivals to ${apt.icao} — generated routes use placeholder "<origin> DCT". Import flights from the Plans tab for realistic routes.`,
    );
  }

  // Resolve stand source.
  const standCtx = resolveStandSource(apt, gates, rampAgent);
  if (!standCtx.stands.length) {
    errors.push(`No stands available for ${apt.icao}.`);
    return { aircraft: [], warnings, errors, standSource: standCtx.source, standCount: 0 };
  }
  if (standCtx.source === "fallback") {
    warnings.push(
      `Using ${standCtx.stands.length} hardcoded fallback stands for ${apt.icao}. Load RampAgent JSON for realistic stand assignment.`,
    );
  }
  if (standCtx.source === "ese") {
    warnings.push(
      `Using ${standCtx.stands.length} ESE-parsed stands for ${apt.icao} — no wingspan/code-letter check. Load RampAgent JSON for fitness-aware assignment.`,
    );
  }
  if (numDep > standCtx.stands.length) {
    warnings.push(
      `Need up to ${numDep} stands but only ${standCtx.stands.length} available — stands will be reused (later session departures will reuse stands vacated by earlier departures).`,
    );
  }

  const depRwyExit =
    apt.rwyExits[cfg.depRwy] || apt.rwyExits[apt.defaultDepRwy] || Object.values(apt.rwyExits)[0];
  const arrRwyExit =
    apt.rwyExits[cfg.arrRwy] || apt.rwyExits[apt.defaultArrRwy] || Object.values(apt.rwyExits)[0];
  if (!depRwyExit || !arrRwyExit) {
    errors.push("Could not resolve runway exit positions.");
    return {
      aircraft: [],
      warnings,
      errors,
      standSource: standCtx.source,
      standCount: standCtx.stands.length,
    };
  }

  const used = new Set<string>();
  const aircraft: any[] = [];
  const elev = apt.elevation;
  const meta = { source: "S1", mode: cfg.mode, airport: apt.icao, generatedAt: Date.now() };

  const standOccupied = new Set<string>();
  const twoHop = !!cfg.twoGateSpacing;
  let nofit = 0,
    nofitTypes = new Set<string>();

  // ── Initial departures (already on field at T0) ───────────────────────
  for (let i = 0; i < initialDepCount; i++) {
    const tmpl = pickDepTmpl(i);
    const dest = tmpl?.dest || pickRand(DOMESTIC_DESTS.filter((d) => d !== apt.icao));
    const type = tmpl?.type || pickArr(IFR_TYPES, i);
    const route = tmpl?.route || `DCT ${dest}`;
    const cruiseAlt = tmpl?.cruiseFL ? tmpl.cruiseFL * 100 : 35000;
    const cs = genCS(dest, used, { heavy: false });
    const callsignPrefix = cs.replace(/\d+$/, ""); // strip trailing digits

    const { stand, reason } = pickStandForAircraft(
      standCtx, type, callsignPrefix, "A", standOccupied, i, twoHop,
    );
    if (!stand) {
      nofit++;
      nofitTypes.add(type);
      continue;
    }
    standOccupied.add(stand.label);
    if (tmpl) usedPoolDeps++;
    aircraft.push({
      ...emptyAc(true),
      id: uid(),
      callsign: cs,
      squawk: "2000",
      type,
      origin: apt.icao,
      dest,
      cruiseAlt,
      lat: stand.lat,
      lon: stand.lon,
      alt: elev,
      gs: 0,
      runway: cfg.depRwy,
      spawnWaypoint: "",
      preEntryNm: 0,
      fpRoute: route,
      simRoute: route,
      start: Math.round(i * 0.3 * 10) / 10,
      isDeparture: true,
      ruleId: null,
      groundMeta: { ...meta, kind: "initial-dep", stand: stand.label, routeSource: tmpl ? "pool" : "placeholder", standMatch: reason },
    });
  }

  // ── Session departures (uniformly distributed across session) ─────────
  for (let i = 0; i < sessionDepCount; i++) {
    const tmpl = pickDepTmpl(initialDepCount + i);
    const dest = tmpl?.dest || pickRand(DOMESTIC_DESTS.filter((d) => d !== apt.icao));
    const type = tmpl?.type || pickArr(IFR_TYPES, initialDepCount + i);
    const route = tmpl?.route || `DCT ${dest}`;
    const cruiseAlt = tmpl?.cruiseFL ? tmpl.cruiseFL * 100 : 35000;
    const cs = genCS(dest, used, { heavy: false });
    const callsignPrefix = cs.replace(/\d+$/, "");

    const { stand, reason } = pickStandForAircraft(
      standCtx, type, callsignPrefix, "A", standOccupied, initialDepCount + i, twoHop,
    );
    if (!stand) {
      nofit++;
      nofitTypes.add(type);
      continue;
    }
    standOccupied.add(stand.label);
    const startMin = (sessionLen * (i + 0.5)) / Math.max(sessionDepCount, 1);
    if (tmpl) usedPoolDeps++;
    aircraft.push({
      ...emptyAc(true),
      id: uid(),
      callsign: cs,
      squawk: "2000",
      type,
      origin: apt.icao,
      dest,
      cruiseAlt,
      lat: stand.lat,
      lon: stand.lon,
      alt: elev,
      gs: 0,
      runway: cfg.depRwy,
      spawnWaypoint: "",
      preEntryNm: 0,
      fpRoute: route,
      simRoute: route,
      start: Math.round(startMin * 10) / 10,
      isDeparture: true,
      ruleId: null,
      groundMeta: { ...meta, kind: "session-dep", stand: stand.label, routeSource: tmpl ? "pool" : "placeholder", standMatch: reason },
    });
  }

  // ── Session arrivals (uniformly distributed, then forward-pass spaced) ─
  if (numArr > 0) {
    const arrTimes = [];
    for (let i = 0; i < numArr; i++) {
      arrTimes.push((sessionLen * (i + 0.5)) / numArr);
    }
    for (let i = 1; i < arrTimes.length; i++) {
      if (arrTimes[i] - arrTimes[i - 1] < minSpacing) {
        arrTimes[i] = arrTimes[i - 1] + minSpacing;
      }
    }
    for (let i = 0; i < numArr; i++) {
      const tmpl = pickArrTmpl(i);
      const origin = tmpl?.origin || pickRand(DOMESTIC_DESTS.filter((d) => d !== apt.icao));
      const type = tmpl?.type || pickArr(IFR_TYPES, i + numDep);
      const route = tmpl?.route || `${origin} DCT`;
      const cruiseAlt = tmpl?.cruiseFL ? tmpl.cruiseFL * 100 : 35000;
      if (tmpl) usedPoolArrs++;
      aircraft.push({
        ...emptyAc(false),
        id: uid(),
        callsign: genCS(apt.icao, used, { heavy: false }),
        squawk: "1000",
        type,
        origin,
        dest: apt.icao,
        cruiseAlt,
        lat: arrRwyExit.lat,
        lon: arrRwyExit.lon,
        alt: elev,
        gs: arrRwyExit.gs || 30,
        runway: cfg.arrRwy,
        spawnWaypoint: "",
        preEntryNm: 0,
        fpRoute: route,
        simRoute: route,
        start: Math.round(arrTimes[i] * 10) / 10,
        isDeparture: false,
        ruleId: null,
        groundMeta: { ...meta, kind: "session-arr", rwyExit: cfg.arrRwy, routeSource: tmpl ? "pool" : "placeholder" },
      });
    }
  }

  // ── VFR (half circuit, half local hop) ────────────────────────────────
  const vfrCircuit = Math.ceil(vfrCount / 2);
  const vfrLocal = Math.floor(vfrCount / 2);
  for (let i = 0; i < vfrCircuit + vfrLocal; i++) {
    const isCircuit = i < vfrCircuit;
    const type = pickRand(VFR_TYPES);
    const cs = genVfrCs(used);
    const dest = isCircuit ? apt.icao : apt.vfrNearby[i % apt.vfrNearby.length] || apt.icao;
    const route = isCircuit ? `${apt.icao}` : `DCT ${dest}`;
    const startMin = (sessionLen * (i + 0.5)) / Math.max(vfrCount, 1);

    const tryP = pickStandForAircraft(standCtx, type, null, "P", standOccupied, numDep + i, twoHop);
    const stand =
      tryP.stand ||
      pickStandForAircraft(standCtx, type, null, null, standOccupied, numDep + i, twoHop).stand;
    if (!stand) {
      nofit++;
      nofitTypes.add(type);
      continue;
    }
    standOccupied.add(stand.label);

    aircraft.push({
      ...emptyAc(true),
      id: uid(),
      callsign: cs,
      squawk: "7000",
      type,
      origin: apt.icao,
      dest,
      cruiseAlt: 3500,
      lat: stand.lat,
      lon: stand.lon,
      alt: elev,
      gs: 0,
      runway: cfg.depRwy,
      spawnWaypoint: "",
      preEntryNm: 0,
      fpRoute: route,
      simRoute: route,
      start: Math.round(startMin * 10) / 10,
      isDeparture: true,
      ruleId: null,
      groundMeta: { ...meta, kind: isCircuit ? "vfr-circuit" : "vfr-local", stand: stand.label, routeSource: "placeholder" },
    });
  }

  // Surface stand-fitness skips.
  if (nofit > 0) {
    warnings.push(
      `⚠ Skipped ${nofit} aircraft because no compatible stand was free at ${apt.icao}${twoHop ? " (with 2-gate spacing enforced)" : ""} (types: ${[...nofitTypes].join(", ")}).`,
    );
  }
  if (usedPoolDeps > 0 || usedPoolArrs > 0) {
    warnings.unshift(`✓ Pool used: ${usedPoolDeps}/${numDep} departures · ${usedPoolArrs}/${numArr} arrivals.`);
  }
  if (twoHop && standCtx.supportsFitness) {
    warnings.unshift(`✓ 2-gate spacing enforced: aircraft assigned with at least one empty stand between them.`);
  }
  if (standCtx.source === "rampagent") {
    warnings.unshift(`✓ RampAgent active: stand assignment is wingspan- and code-letter-aware.`);
  }

  return { aircraft, warnings, errors, standSource: standCtx.source, standCount: standCtx.stands.length };
}
