// boundary.test.ts — PORT-ONLY tests for the C1 auto-boundary patches (v4):
//   P5 — airway-designator walks (preEntryOffset + @N heading) and the
//        never-on-fix invariant (min 1 NM, exclusion instead of on-fix spawns)
//   P6 — spawnAnchor "priorFix" (spawn one filed fix before the boundary)
//   P7 — spawnMode "autoBoundary" + scenario FIR (FIR_COPX gates)
// No goldens here: the parity suite stays the authority for raw legacy rules
// (which carry none of the new keys and generate byte-identically).

import { describe, it, expect, beforeEach } from "vitest";

import { mulberry32 } from "./prng.mjs";
import { setRng } from "../src/core/rng";
import { setStars } from "../src/core/stars";
import { generateFromRule } from "../src/core/generateFromRule";
import { generateSweatbox } from "../src/core/generateSweatbox";
import { emptyRule } from "../src/core/model";
import { preEntryOffset, bearingBetween, distanceNm } from "../src/core/geo";
import { parseESE } from "../src/parsers/ese";

// DGO → VANAD → BAMES is a real-shaped airway route; UN858/UT191/PODEM never
// resolve. ALPHA/BRAVO are FIR gates north/south of their centroid (49, 3).
const WPTS = [
  { name: "DGO", lat: 47.0, lon: 1.0, type: "FIXES" },
  { name: "VANAD", lat: 47.5, lon: 2.0, type: "FIXES" },
  { name: "BAMES", lat: 48.0, lon: 3.0, type: "FIXES" },
  { name: "ALPHA", lat: 50.0, lon: 3.0, type: "FIXES" },
  { name: "BRAVO", lat: 48.0, lon: 3.0, type: "FIXES" },
  { name: "MIDCO", lat: 49.5, lon: 2.5, type: "FIXES" },
  { name: "CHARL", lat: 51.0, lon: 1.0, type: "FIXES" },
];

const AIRWAY_ROUTE = "DGO UN858 VANAD UN874 BAMES UT191 PODEM";

const COPX = [
  { fix: "ALPHA", level: 19500, destApt: "LFBO", kind: "fir", fromFir: "LFRR", toFir: "LFBB" },
  { fix: "BRAVO", level: 24500, destApt: "", kind: "fir", fromFir: "LFMM", toFir: "LFBB" },
  // internal sector split — never a boundary gate
  { fix: "MIDCO", level: 15000, destApt: "", kind: "copx", fromFir: "LFBB", toFir: "LFBB" },
  // gate into a NEIGHBOURING FIR — must be ignored even when earlier in a route
  { fix: "CHARL", level: 28500, destApt: "", kind: "fir", fromFir: "EGTT", toFir: "LFRR" },
];

const poolRule = (over: any = {}) => ({
  ...emptyRule(),
  name: "boundary",
  mode: "C1",
  poolSource: true,
  poolDep: "",
  poolArr: "",
  excludeNonRouting: false,
  spawnWaypoint: "VANAD",
  routeContains: "",
  rate: 8,
  duration: 30,
  ...over,
});

const entry = (callsign: string, route: string, dest = "LFBO", cruiseFL = 350) => ({
  callsign,
  type: "A320",
  origin: "EGLL",
  dest,
  route,
  cruiseFL,
  squawk: "1000",
});

beforeEach(() => {
  setRng(mulberry32(9));
  setStars([]);
});

describe("P5 — airway walks + never-on-fix invariant", () => {
  it("preEntryOffset walks past airway designators to the prior fix (DGO→VANAD bearing)", () => {
    const off = preEntryOffset("VANAD", AIRWAY_ROUTE, 20, WPTS);
    expect(off).not.toBeNull();
    const dgo = WPTS[0],
      vanad = WPTS[1];
    const legBrg = bearingBetween(dgo.lat, dgo.lon, vanad.lat, vanad.lon);
    const offBrg = bearingBetween(off!.lat, off!.lon, vanad.lat, vanad.lon);
    const raw = Math.abs(offBrg - legBrg) % 360;
    expect(Math.min(raw, 360 - raw)).toBeLessThanOrEqual(2);
    expect(distanceNm(off!.lat, off!.lon, vanad.lat, vanad.lon)).toBeCloseTo(20, 0);
  });

  it("serialized @N heading is VANAD-ward, not 0, on an airway-formatted route", () => {
    const r = generateFromRule(poolRule({ preEntryNm: 20 }), WPTS, new Set(), [
      entry("KLM1", AIRWAY_ROUTE),
    ]);
    expect(r.error).toBeNull();
    expect(r.aircraft.length).toBe(1);
    const scn = generateSweatbox(
      { name: "T", airportAlt: 0, ils: [], controllers: [], holdings: [], aircraft: r.aircraft },
      WPTS,
      {},
    );
    const atN = scn.split("\n").find((l) => l.startsWith("@N:KLM1"))!;
    const enc = +atN.split(":")[8];
    expect(enc).toBeGreaterThan(0);
    const hdg = enc / 4 / 2.88;
    const off = preEntryOffset("VANAD", "VANAD UN874 BAMES UT191 PODEM", 20, WPTS, AIRWAY_ROUTE)!;
    const want = bearingBetween(off.lat, off.lon, 47.5, 2.0);
    expect(Math.abs(hdg - want)).toBeLessThanOrEqual(2);
  });

  it("raw preEntryNm 0 on an app-shaped rule is clamped to 1 NM (never on the fix)", () => {
    const r = generateFromRule(poolRule({ preEntryNm: 0 }), WPTS, new Set(), [
      entry("KLM2", AIRWAY_ROUTE),
    ]);
    expect(r.error).toBeNull();
    expect(r.aircraft[0].preEntryNm).toBe(1);
    const scn = generateSweatbox(
      { name: "T", airportAlt: 0, ils: [], controllers: [], holdings: [], aircraft: r.aircraft },
      WPTS,
      {},
    );
    const atN = scn.split("\n").find((l) => l.startsWith("@N:KLM2"))!;
    const [lat, lon] = [+atN.split(":")[4], +atN.split(":")[5]];
    expect(distanceNm(lat, lon, 47.5, 2.0)).toBeGreaterThanOrEqual(0.9);
  });

  it("underivable inbound bearing in waypoint mode excludes the aircraft (with warning), never on-fix", () => {
    const r: any = generateFromRule(
      poolRule({ preEntryNm: 10 }),
      WPTS,
      new Set(),
      [entry("KLM3", "ZZZZZ VANAD")], // nothing resolvable before or after
    );
    expect(r.error).toBeNull();
    expect(r.aircraft.length).toBe(0);
    expect(r.warning).toMatch(/skipped/);
  });

  it("legacy rule (no new keys) generates identically with 4-arg and 6-arg calls", () => {
    const legacy: any = { ...poolRule({ preEntryNm: 0 }) };
    delete legacy.spawnMode;
    delete legacy.entryDirection;
    delete legacy.spawnAnchor;
    delete legacy.priorFixMaxNm;
    setRng(mulberry32(42));
    const a = generateFromRule(legacy, WPTS, new Set(), [entry("KLM4", AIRWAY_ROUTE)]);
    setRng(mulberry32(42));
    const b = generateFromRule(
      legacy,
      WPTS,
      new Set(),
      [entry("KLM4", AIRWAY_ROUTE)],
      COPX,
      "LFBB",
    );
    const strip = (list: any[]) => list.map(({ id, ...rest }: any) => rest);
    expect(strip(b.aircraft)).toEqual(strip(a.aircraft));
    expect(a.aircraft[0].preEntryNm).toBe(0); // legacy keeps rc3 behavior
    expect(a.aircraft[0].spawnMode).toBeUndefined();
  });
});

describe("P6 — spawnAnchor priorFix", () => {
  it("spawns at the previous resolvable filed fix; simRoute is the real filed leg", () => {
    const r = generateFromRule(
      poolRule({ spawnAnchor: "priorFix", preEntryNm: 5 }),
      WPTS,
      new Set(),
      [entry("KLM5", "DGO UN858 VANAD UN874 BAMES")],
    );
    expect(r.error).toBeNull();
    const ac: any = r.aircraft[0];
    expect(ac.spawnWaypoint).toBe("DGO");
    expect(ac.simRoute.startsWith("DGO UN858 VANAD")).toBe(true);
    expect(ac.lat).toBeCloseTo(47.0, 5);
    expect(ac.lon).toBeCloseTo(1.0, 5);
  });

  it("priorFixMaxNm too small → falls back to the entry fix + offset", () => {
    const r = generateFromRule(
      poolRule({ spawnAnchor: "priorFix", priorFixMaxNm: 10, preEntryNm: 5 }),
      WPTS,
      new Set(),
      [entry("KLM6", "DGO UN858 VANAD UN874 BAMES")], // DGO is ~51 NM from VANAD
    );
    expect(r.error).toBeNull();
    const ac: any = r.aircraft[0];
    expect(ac.spawnWaypoint).toBe("VANAD");
    expect(ac.preEntryNm).toBeGreaterThanOrEqual(1);
  });
});

describe("P7 — autoBoundary + scenario FIR", () => {
  const autoRule = (over: any = {}) =>
    poolRule({ spawnMode: "autoBoundary", spawnWaypoint: "", preEntryNm: 10, ...over });
  const POOL2 = [
    // crosses the neighbouring-FIR gate CHARL and the internal split MIDCO
    // BEFORE its LFBB gate ALPHA — both must be ignored
    entry("NORTH1", "EGLL CHARL MIDCO ALPHA BAMES LFBO", "LFBO"),
    entry("SOUTH1", "LIRF BRAVO MIDCO BAMES LFBO", "LFBO"),
  ];

  it("each aircraft spawns at ITS OWN gate with simRoute trimmed there, fpRoute untouched", () => {
    const r = generateFromRule(autoRule(), WPTS, new Set(), POOL2, COPX, "LFBB");
    expect(r.error).toBeNull();
    expect(r.aircraft.length).toBe(2);
    const north: any = r.aircraft.find((a: any) => a.callsign === "NORTH1");
    const south: any = r.aircraft.find((a: any) => a.callsign === "SOUTH1");
    expect(north.spawnWaypoint).toBe("ALPHA");
    expect(south.spawnWaypoint).toBe("BRAVO");
    expect(north.simRoute).toBe("ALPHA BAMES LFBO");
    expect(south.simRoute).toBe("BRAVO MIDCO BAMES LFBO");
    expect(north.fpRoute).toBe("EGLL CHARL MIDCO ALPHA BAMES LFBO");
    expect(north.preEntryNm).toBeGreaterThanOrEqual(1);
    expect(south.preEntryNm).toBeGreaterThanOrEqual(1);
  });

  it('entryDirection "N" keeps only the northern gate; funnel text when zero survive', () => {
    const n = generateFromRule(
      autoRule({ entryDirection: "N" }),
      WPTS,
      new Set(),
      POOL2,
      COPX,
      "LFBB",
    );
    expect(n.error).toBeNull();
    expect(n.aircraft.map((a: any) => a.callsign)).toEqual(["NORTH1"]);
    const z = generateFromRule(
      autoRule({ entryDirection: "E" }),
      WPTS,
      new Set(),
      POOL2,
      COPX,
      "LFBB",
    );
    expect(z.aircraft.length).toBe(0);
    expect(z.error).toMatch(/Auto-boundary: 2 matched DEP\/ARR · 2 cross the LFBB boundary/);
  });

  it("blank FIR or missing copx → the explicit setup error, no throw", () => {
    const a = generateFromRule(autoRule(), WPTS, new Set(), POOL2, COPX, "");
    expect(a.error).toMatch(/set the scenario FIR/);
    const b = generateFromRule(autoRule(), WPTS, new Set(), POOL2, undefined, "LFBB");
    expect(b.error).toMatch(/set the scenario FIR/);
  });

  it("no route crosses the boundary → funnel error, not an on-fix spawn", () => {
    const r = generateFromRule(
      autoRule(),
      WPTS,
      new Set(),
      [entry("KLM7", "DGO VANAD BAMES")],
      COPX,
      "LFBB",
    );
    expect(r.aircraft.length).toBe(0);
    expect(r.error).toMatch(/0 cross the LFBB boundary/);
  });

  it("last-resort radial: gate with no derivable inbound leg spawns outside the FIR, heading at the gate", () => {
    const r = generateFromRule(
      autoRule({ preEntryNm: 10 }),
      WPTS,
      new Set(),
      [entry("KLM8", "ZZZZZ ALPHA")], // nothing resolvable around the gate
      COPX,
      "LFBB",
    );
    expect(r.error).toBeNull();
    const ac: any = r.aircraft[0];
    expect(ac.spawnWaypoint).toBe("ALPHA");
    expect(ac.preEntryNm).toBe(0); // position already offset — serializer must not re-offset
    // centroid of ALPHA+BRAVO is (49, 3); ALPHA is due north → radial continues north
    expect(ac.lat).toBeGreaterThan(50.0);
    expect(distanceNm(ac.lat, ac.lon, 50.0, 3.0)).toBeCloseTo(10, 0);
    const scn = generateSweatbox(
      { name: "T", airportAlt: 0, ils: [], controllers: [], holdings: [], aircraft: r.aircraft },
      WPTS,
      {},
    );
    const atN = scn.split("\n").find((l) => l.startsWith("@N:KLM8"))!;
    const hdg = +atN.split(":")[8] / 4 / 2.88;
    expect(Math.abs(hdg - 180)).toBeLessThanOrEqual(2); // pointing back at the gate
  });

  it("prefers the earliest gate whose FIR_COPX destApt matches the aircraft's destination", () => {
    // BRAVO comes first in the route, but ALPHA's gate entry names LFBO —
    // destination match wins over route order.
    const r = generateFromRule(
      autoRule(),
      WPTS,
      new Set(),
      [entry("KLM9", "EGLL BRAVO ALPHA BAMES LFBO", "LFBO")],
      COPX,
      "LFBB",
    );
    expect(r.error).toBeNull();
    expect((r.aircraft[0] as any).spawnWaypoint).toBe("ALPHA");
  });
});

describe("P7 — ESE parser ingests FIR_COPX", () => {
  // Shapes taken verbatim from a real CoFrance LFXX.ese. Three things this
  // locks down, each of which broke against the real file:
  //   1. COPX/FIR_COPX live in [AIRSPACE] — there is no [COPX] section
  //   2. fields are positional: the crossing point is field 3, NOT the first
  //      token that happens to look like a fix (field 1 is the departure point)
  //   3. the sector separator is a Latin-1 middle dot; read as UTF-8 it becomes
  //      U+FFFD, and the FIR must still be recoverable
  const REPL = "\uFFFD"; // what 0xB7 decodes to when the file is read as UTF-8

  it("reads COPX and FIR_COPX out of [AIRSPACE], positionally", () => {
    const ese = [
      "[AIRSPACE]",
      "SECTORLINE:LFBBL1",
      "COORD:N044.00.00.000:E000.00.00.000",
      `COPX:MINSO:*:NARAK:LFBO:*:LFBB${REPL}L1 UAC${REPL}195${REPL}295:LFBB${REPL}X1 UAC${REPL}195${REPL}295:*:29000:TFL`,
      `FIR_COPX:VANAD:*:VADOM:EBKT:*:LFRR${REPL}XS2 UAC${REPL}305${REPL}345:LFFF${REPL}UZ3 UAC${REPL}285${REPL}295:*:30000:VADOM`,
    ].join("\n");
    const { copx } = parseESE(ese);
    expect(copx.length).toBe(2);

    const internal: any = copx.find((c: any) => c.fix === "NARAK");
    expect(internal.kind).toBe("copx");
    expect(internal.fromFir).toBe("LFBB");
    expect(internal.toFir).toBe("LFBB");
    expect(internal.destApt).toBe("LFBO");
    expect(internal.level).toBe(29000);

    const gate: any = copx.find((c: any) => c.fix === "VADOM");
    expect(gate.kind).toBe("fir");
    expect(gate.fromFir).toBe("LFRR");
    expect(gate.toFir).toBe("LFFF");
    expect(gate.level).toBe(30000);
    // field 1 (VANAD) is the departure point, never the crossing point
    expect(copx.some((c: any) => c.fix === "VANAD")).toBe(false);
  });

  it("still works with the middle dot intact and with a legacy [COPX] header", () => {
    const ese = [
      "[COPX]",
      "FIR_COPX:*:*:SOPIL:LFBO:*:LFRR·V U·133.725·1:LFBB·L1 UAC·195·295:*:19500:SOPIL LFBO",
    ].join("\n");
    const { copx } = parseESE(ese);
    expect(copx.length).toBe(1);
    expect(copx[0]).toMatchObject({
      fix: "SOPIL",
      kind: "fir",
      fromFir: "LFRR",
      toFir: "LFBB",
      destApt: "LFBO",
      level: 19500,
    });
  });

  it("skips lines with no named crossing point and no level", () => {
    const ese = [
      "[AIRSPACE]",
      "COPX:*:*:*:LFRL:*:LFRR·JS UAC·195·325:LFRR·KS UAC·195·355:*:28000:TFL",
      "FIR_COPX:*:*:BOKNO:*:*:LFRR·N·128.1·1:EGTT·S·132.2·1:*:*:no level",
    ].join("\n");
    expect(parseESE(ese).copx.length).toBe(0);
  });
});
