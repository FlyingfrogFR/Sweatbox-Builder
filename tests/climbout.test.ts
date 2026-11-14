// climbout.test.ts — PORT-ONLY tests for v10: climbing entries for traffic
// departing close to the session FIR, and "origin inside the FIR" by geometry.
//
//   P14 — the ESE parser keeps the departure airport, the climb / descend
//         levels and the "then via" fix of each COPX line, and tags every
//         boundary segment with the per-FIR ordinals of the sectors it bounds
//   P15 — insideFir: an even-odd ray cast per sector; with airports given,
//         the origin-inside test uses it instead of the destApt heuristic
//   P16 — rule.climbOuts: a nearby departure pops in the climb, ≥15 NM from
//         its airport, cleared (REQALT) to the published transfer level
//
// No goldens: the parity suite stays the authority for legacy inputs, which
// carry none of the new keys and pass no airports.

import { describe, it, expect, beforeEach } from "vitest";

import { mulberry32 } from "./prng.mjs";
import { setRng } from "../src/core/rng";
import { setStars } from "../src/core/stars";
import { generateFromRule } from "../src/core/generateFromRule";
import { generateSweatbox } from "../src/core/generateSweatbox";
import { emptyRule } from "../src/core/model";
import { destinationPoint, distanceNm, insideFir } from "../src/core/geo";
import { climbAlt, pickClimbOut, CLIMB_PROFILE } from "../src/core/climb";
import { parseESE } from "../src/parsers/ese";

beforeEach(() => {
  setRng(mulberry32(11));
  setStars([]);
});

const REPL = "�"; // the Latin-1 middle dot, read as UTF-8

// ===================================================================== P14 ==
describe("P14a — COPX lines keep the departure airport, climb level and next fix", () => {
  const lines = [
    "[AIRSPACE]",
    `FIR_COPX:LFRS:*:TUPAR:CNA:*:LFRR${REPL}NS UAC${REPL}275${REPL}325:LFBB${REPL}R1 UAC${REPL}195${REPL}295:23000:*:TUPAR`,
    `FIR_COPX:LFRS:*:TUPAR:DIDRU:*:LFRR${REPL}NS UAC${REPL}275${REPL}325:LFBB${REPL}R1 UAC${REPL}195${REPL}295:25000:*:TUPAR`,
    `FIR_COPX:LFRS:*:CNA:*:*:LFRR${REPL}NS UAC${REPL}275${REPL}325:LFBB${REPL}R1 UAC${REPL}195${REPL}295:23000:*:CNA`,
    `FIR_COPX:LFPG:*:*:AGOPA:*:LFFF${REPL}DG2 UAC${REPL}195${REPL}265:LFBB${REPL}P1 2 UAC${REPL}265${REPL}295:26000:*:UP`,
  ].join("\n");

  it("the four real departure-flow shapes", () => {
    const { copx } = parseESE(lines);
    expect(
      copx.map((c: any) => ({
        depApt: c.depApt,
        fix: c.fix,
        nextFix: c.nextFix,
        climbLevel: c.climbLevel,
        descendLevel: c.descendLevel,
      })),
    ).toEqual([
      { depApt: "LFRS", fix: "TUPAR", nextFix: "CNA", climbLevel: 23000, descendLevel: null },
      { depApt: "LFRS", fix: "TUPAR", nextFix: "DIDRU", climbLevel: 25000, descendLevel: null },
      { depApt: "LFRS", fix: "CNA", nextFix: "", climbLevel: 23000, descendLevel: null },
      { depApt: "LFPG", fix: "AGOPA", nextFix: "", climbLevel: 26000, descendLevel: null },
    ]);
  });

  it("`level` is unchanged (descend if set, else climb) and destApt logic is untouched", () => {
    const { copx } = parseESE(
      [
        "[AIRSPACE]",
        `COPX:MINSO:*:NARAK:LFBO:*:LFBB${REPL}L1 UAC${REPL}195${REPL}295:LFBB${REPL}X1 UAC${REPL}195${REPL}295:FL310:29000:TFL`,
        ...lines.split("\n").slice(1, 2),
      ].join("\n"),
    );
    const narak: any = copx[0];
    expect(narak).toMatchObject({
      fix: "NARAK",
      destApt: "LFBO",
      nextFix: "",
      depApt: "",
      climbLevel: 31000,
      descendLevel: 29000,
      level: 29000,
    });
    expect(copx[1]).toMatchObject({ destApt: "", level: 23000 }); // CNA is a fix, not an airport
  });

  it("FL / bare-hundreds / feet forms and '*' all parse the way `level` always did", () => {
    const mk = (c: string, d: string) =>
      parseESE(
        `[AIRSPACE]\nFIR_COPX:LFRS:*:TUPAR:*:*:LFRR${REPL}A${REPL}195${REPL}295:LFBB${REPL}B${REPL}195${REPL}295:${c}:${d}:X`,
      ).copx[0];
    expect(mk("FL230", "*")).toMatchObject({ climbLevel: 23000, descendLevel: null });
    expect(mk("230", "*")).toMatchObject({ climbLevel: 23000 });
    expect(mk("23000", "*")).toMatchObject({ climbLevel: 23000 });
    expect(mk("*", "*")).toMatchObject({ climbLevel: null, descendLevel: null, level: null });
  });
});

describe("P14b — boundary segments carry the ordinals of the sectors they bound", () => {
  const ese = [
    "[AIRSPACE]",
    // a sector defined BEFORE its lines still takes part (decided after the read)
    "SECTOR:LFBB·EARLY·000·660:0:66000",
    "BORDER:6:7:8",
    "SECTORLINE:1", // west
    "COORD:N048.00.00.000:E002.00.00.000",
    "COORD:N050.00.00.000:E002.00.00.000",
    "SECTORLINE:2", // north
    "COORD:N050.00.00.000:E002.00.00.000",
    "COORD:N050.00.00.000:E004.00.00.000",
    "SECTORLINE:3", // east
    "COORD:N050.00.00.000:E004.00.00.000",
    "COORD:N048.00.00.000:E004.00.00.000",
    "SECTORLINE:4", // south
    "COORD:N048.00.00.000:E004.00.00.000",
    "COORD:N048.00.00.000:E002.00.00.000",
    "SECTORLINE:5",
    "COORD:N048.00.00.000:E002.00.00.000",
    "COORD:N048.00.00.000:E000.00.00.000",
    "CIRCLE_SECTORLINE:9:LFPG:20",
    "SECTOR:LFBB·A UAC·195·295:19500:29500", // ord 1
    "BORDER:1:2:3:4",
    "SECTOR:LFBB·B UAC·295·660:29500:66000", // ord 2
    "BORDER:1:5:1", // duplicated id — counted once
    "SECTOR:LFBB·C APP·000·195:0:19500", // ord 3: a circle in its border → open outline
    "BORDER:2:9",
    "SECTOR:LFRR·V UAC·195·295:19500:29500", // another FIR counts from 0
    "BORDER:1",
    "SECTORLINE:6",
    "COORD:N045.00.00.000:E000.00.00.000",
    "COORD:N046.00.00.000:E000.00.00.000",
    "SECTORLINE:7",
    "COORD:N046.00.00.000:E000.00.00.000",
    "COORD:N046.00.00.000:E001.00.00.000",
    "SECTORLINE:8",
    "COORD:N046.00.00.000:E001.00.00.000",
    "COORD:N045.00.00.000:E000.00.00.000",
  ].join("\n");
  const ordsOf = (segs: number[][], pred: (s: number[]) => boolean) =>
    segs.filter(pred).map((s) => s.slice(6));

  it("a line shared by two sectors ends with both ordinals; a circle-bordered sector adds none", () => {
    const { firBounds } = parseESE(ese);
    const bb = firBounds.LFBB;
    const west = (s: number[]) => s[1] === 2 && s[3] === 2;
    const north = (s: number[]) => s[0] === 50 && s[2] === 50;
    const fifth = (s: number[]) => s[3] === 0 && s[0] === 48 && s[2] === 48;
    expect(ordsOf(bb, west)).toEqual([[1, 2]]); // A and B
    expect(ordsOf(bb, north)).toEqual([[1]]); // A only — C (circle border) is open
    expect(ordsOf(bb, fifth)).toEqual([[2]]); // B
    expect(ordsOf(bb, (s) => s[0] === 45 && s[1] === 0 && s[2] === 46)).toEqual([[0]]); // EARLY
    expect(firBounds.LFRR.map((s: number[]) => s.slice(6))).toEqual([[0]]);
  });
  it("indices 0–5 are exactly what they were", () => {
    const { firBounds } = parseESE(ese);
    for (const s of firBounds.LFBB) {
      expect(s.length).toBeGreaterThanOrEqual(6);
      expect(typeof s[4]).toBe("number");
      expect(typeof s[5]).toBe("number");
    }
    const west = firBounds.LFBB.find((s: number[]) => s[1] === 2 && s[3] === 2)!;
    expect(west.slice(0, 6)).toEqual([48, 2, 50, 2, 19500, 66000]); // band merged across A and B
  });
  it("stacked sectors with the same BORDER set share the first one's ordinal (storage)", () => {
    const stackedEse = [
      "[AIRSPACE]",
      "SECTORLINE:1", // west
      "COORD:N048.00.00.000:E002.00.00.000",
      "COORD:N050.00.00.000:E002.00.00.000",
      "SECTORLINE:2", // north
      "COORD:N050.00.00.000:E002.00.00.000",
      "COORD:N050.00.00.000:E004.00.00.000",
      "SECTORLINE:3", // east, shared with the sector beside the stack
      "COORD:N050.00.00.000:E004.00.00.000",
      "COORD:N048.00.00.000:E004.00.00.000",
      "SECTORLINE:4", // south
      "COORD:N048.00.00.000:E004.00.00.000",
      "COORD:N048.00.00.000:E002.00.00.000",
      "SECTORLINE:5",
      "COORD:N050.00.00.000:E004.00.00.000",
      "COORD:N050.00.00.000:E006.00.00.000",
      "SECTORLINE:6",
      "COORD:N050.00.00.000:E006.00.00.000",
      "COORD:N048.00.00.000:E006.00.00.000",
      "SECTORLINE:7",
      "COORD:N048.00.00.000:E006.00.00.000",
      "COORD:N048.00.00.000:E004.00.00.000",
      "SECTOR:LFBB·LOW·000·195:0:19500", // ord 0
      "BORDER:1:2:3:4",
      "SECTOR:LFBB·MID·195·295:19500:29500", // ord 1 — same outline, other order
      "BORDER:4:3:2:1",
      "SECTOR:LFBB·TOP·295·660:29500:66000", // ord 2 — same outline
      "BORDER:1:2:3:4",
      "SECTOR:LFBB·EAST·195·295:19500:29500", // ord 3 — beside the stack
      "BORDER:3:5:6:7",
    ].join("\n");
    const { firBounds } = parseESE(stackedEse);
    const bb = firBounds.LFBB;
    expect(ordsOf(bb, (s) => s[1] === 2 && s[3] === 2)).toEqual([[0]]); // west: not [0, 1, 2]
    expect(ordsOf(bb, (s) => s[1] === 4 && s[3] === 4)).toEqual([[0, 3]]); // east: stack + EAST
    expect(ordsOf(bb, (s) => s[1] === 6 && s[3] === 6)).toEqual([[3]]);
    expect(insideFir({ lat: 49, lon: 3 }, bb)).toBe(true);
    expect(insideFir({ lat: 49, lon: 5 }, bb)).toBe(true);
    expect(insideFir({ lat: 49, lon: 7 }, bb)).toBe(false);
  });
});

// ===================================================================== P15 ==
// A square FIR, lat 46.2–48, lon −1…+1.
const square = (
  ord: number,
  lo = 46.2,
  hi = 48,
  w = -1,
  e = 1,
  band: [number, number] = [0, 999999],
) => [
  [lo, w, hi, w, band[0], band[1], ord],
  [hi, w, hi, e, band[0], band[1], ord],
  [hi, e, lo, e, band[0], band[1], ord],
  [lo, e, lo, w, band[0], band[1], ord],
];

describe("P15a — insideFir", () => {
  // two STACKED sectors with the same outline, as separate line copies (their
  // own ordinals), plus an adjacent sector east of them
  const stacked = [
    ...square(0, 46.2, 48, -1, 1, [0, 29500]),
    ...square(1, 46.2, 48, -1, 1, [29500, 66000]),
    ...square(2, 46.2, 48, 1, 3),
  ];

  it("a point in the stacked square is inside — a single cast over all lines would cancel out", () => {
    expect(insideFir({ lat: 47, lon: 0 }, stacked)).toBe(true);
    // the same two copies under ONE ordinal is that single cast: even → outside
    const single = [...square(0), ...square(0)];
    expect(insideFir({ lat: 47, lon: 0 }, single)).toBe(false);
  });
  it("the adjacent sector counts too; points outside are outside", () => {
    expect(insideFir({ lat: 47, lon: 2 }, stacked)).toBe(true);
    expect(insideFir({ lat: 45, lon: 0 }, stacked)).toBe(false);
    expect(insideFir({ lat: 47, lon: 4 }, stacked)).toBe(false);
  });
  it("segments without ordinals (pre-v10 navdata) never make a point inside", () => {
    const old = square(0).map((s) => s.slice(0, 6));
    expect(insideFir({ lat: 47, lon: 0 }, old)).toBe(false);
  });
});

// ------------------------------------------------------- shared fixtures --
const at = (p: { lat: number; lon: number }, brg: number, nm: number) =>
  destinationPoint(p.lat, p.lon, brg, nm);
const O0 = { lat: 45.0, lon: 0.0 }; // the departure airport for the Nantes reproduction
const G = at(O0, 0, 58.5); // the published gate, 58.5 NM north of O
const N = { lat: 46.5, lon: 0.0 }; // next fix, inside the FIR
const D = { lat: 46.6, lon: 0.3 }; // an alternative next fix, inside
const X = { lat: 47.5, lon: 0.0 }; // further on, inside
const WPTS = [
  { name: "G", ...G, type: "FIXES" },
  { name: "N", ...N, type: "FIXES" },
  { name: "D", ...D, type: "FIXES" },
  { name: "X", ...X, type: "FIXES" },
];
const FIRB = { LFBB: square(0) };
const climbRule = (over: any = {}) => ({
  ...emptyRule(),
  id: "r-climb",
  name: "LFBO arrivals",
  mode: "C1",
  poolSource: true,
  poolDep: "",
  poolArr: "LFBO",
  spawnMode: "autoBoundary",
  spawnWaypoint: "",
  entryDirection: "",
  spawnAnchor: "priorFix",
  priorFixMaxNm: 25,
  preEntryNm: 45,
  spawnAltMode: "poolCruise",
  appendStar: false,
  excludeNonRouting: false,
  climbOuts: true,
  rate: 8,
  duration: 30,
  ...over,
});
const plan = (callsign: string, origin: string, route: string, cruiseFL = 290, dest = "LFBO") => ({
  callsign,
  type: "A320",
  origin,
  dest,
  route,
  cruiseFL,
  squawk: "1000",
});
const climbLine = (
  depApt: string,
  fix: string,
  climbLevel: number,
  nextFix = "",
  destApt = "",
) => ({
  fix,
  level: climbLevel,
  destApt,
  depApt,
  nextFix,
  climbLevel,
  descendLevel: null,
  kind: "fir",
  fromFir: "LFRR",
  toFir: "LFBB",
  fromLower: 19500,
  fromUpper: 32500,
  toLower: 19500,
  toUpper: 29500,
});
const run = (rule: any, pool: any[], copx: any[], airports?: any[]) =>
  generateFromRule(
    rule,
    WPTS,
    new Set(),
    pool,
    copx,
    "LFBB",
    FIRB,
    undefined,
    undefined,
    undefined,
    airports,
  ) as any;
const noIds = (r: any) => ({ ...r, aircraft: r.aircraft.map(({ id, ...a }: any) => a) });
const runW = (wpts: any[], rule: any, pool: any[], copx: any[], airports?: any[]) =>
  generateFromRule(
    rule,
    wpts,
    new Set(),
    pool,
    copx,
    "LFBB",
    FIRB,
    undefined,
    undefined,
    undefined,
    airports,
  ) as any;

describe("P15c — origin inside the FIR: geometry when the airports are known", () => {
  const LFBO = { name: "LFBO", lat: 47.0, lon: 0.2 }; // inside the square
  const EGLL = { name: "EGLL", lat: 51.47, lon: -0.45 }; // outside
  // an inbound route that crosses the south edge northbound, so a plan from
  // inside still finds a crossing (its exit would be the "entry")
  const local = plan("TVF51", "LFBO", "G DCT N DCT X", 280, "LFRS");
  const foreign = plan("BAW99", "EGLL", "G DCT N DCT X", 280, "LFRS");
  const rule = climbRule({ poolArr: "", climbOuts: false });

  it("an airport inside the footprint with no climb-out line is skipped", () => {
    const r = run(rule, [local, foreign], [], [LFBO, EGLL]);
    expect(r.aircraft.map((a: any) => a.callsign)).toEqual(["BAW99"]);
    expect(r.warning).toMatch(/1 aircraft skipped — origin inside FIR \(LFBO\)/);
  });
  it("the same airport with a published climb-out is outside by definition — generated", () => {
    const r = run(rule, [local, foreign], [climbLine("LFBO", "G", 23000)], [LFBO, EGLL]);
    expect(r.aircraft.map((a: any) => a.callsign)).toEqual(["TVF51", "BAW99"]);
  });
  it("an origin with no coordinates and not in the old heuristic set is generated", () => {
    const r = run(rule, [{ ...local, origin: "LFZZ" }], [], [LFBO, EGLL]);
    expect(r.aircraft.map((a: any) => a.callsign)).toEqual(["TVF51"]);
  });
  it("geometry overrides the heuristic both ways: LFLL-like fields out, LFBZ-like fields in", () => {
    const LFLL = { name: "LFLL", lat: 45.72, lon: 5.08 }; // outside, but a destApt on an entry gate
    const LFBZ = { name: "LFBZ", lat: 47.5, lon: -0.5 }; // inside, never a destApt
    const copx = [{ ...climbLine("", "G", 0), depApt: "", climbLevel: null, destApt: "LFLL" }];
    const r = run(
      rule,
      [plan("A1", "LFLL", "G DCT N DCT X"), plan("A2", "LFBZ", "G DCT N DCT X")],
      copx,
      [LFLL, LFBZ],
    );
    expect(r.aircraft.map((a: any) => a.callsign)).toEqual(["A1"]);
    expect(r.warning).toMatch(/origin inside FIR \(LFBZ\)/);
    // without airports the old heuristic stands (LFLL skipped, LFBZ generated)
    const h = run(
      rule,
      [plan("A1", "LFLL", "G DCT N DCT X"), plan("A2", "LFBZ", "G DCT N DCT X")],
      copx,
    );
    expect(h.aircraft.map((a: any) => a.callsign)).toEqual(["A2"]);
  });
  it("without sector ordinals (old navdata) the heuristic stands even with airports", () => {
    const old = { LFBB: square(0).map((s) => s.slice(0, 6)) };
    const r = generateFromRule(
      rule,
      WPTS,
      new Set(),
      [local, foreign],
      [],
      "LFBB",
      old,
      undefined,
      undefined,
      undefined,
      [LFBO, EGLL],
    ) as any;
    expect(r.aircraft.map((a: any) => a.callsign)).toEqual(["TVF51", "BAW99"]); // LFBO not a destApt here
  });
});

// ===================================================================== P16 ==
describe("P16 — climb.ts helpers", () => {
  it("climbAlt is piecewise-linear through the profile and clamped at both ends", () => {
    expect(climbAlt(-5)).toBe(0);
    expect(climbAlt(0)).toBe(0);
    expect(climbAlt(15)).toBe(9000);
    expect(climbAlt(27.5)).toBe(14500);
    expect(climbAlt(80)).toBe(30000);
    expect(climbAlt(170)).toBe(40000);
    expect(climbAlt(999)).toBe(40000);
    expect(CLIMB_PROFILE[0]).toEqual([0, 0]);
  });
  it("pickClimbOut: earliest gate, then a specific line, then the lowest level", () => {
    const wp = new Map(WPTS.map((w) => [w.name, w]));
    const toks = ["G", "DCT", "N", "DCT", "X"];
    const copx = [
      climbLine("LFRS", "N", 21000), // later gate — loses to G
      climbLine("LFRS", "G", 27000), // generic
      climbLine("LFRS", "G", 25000, "N"), // specific — wins at G
      climbLine("LFRS", "G", 24000, "D"), // needs D, not in the route
      climbLine("LFRS", "G", 22000, "", "LFML"), // wrong destination
      climbLine("LFRN", "G", 20000), // another airport
      { ...climbLine("LFRS", "G", 0), climbLevel: null }, // no level
      climbLine("LFRS", "X", 19000), // beyond the entry fix N
    ];
    expect(pickClimbOut(copx, "LFBB", "LFRS", "LFBO", toks, wp, "N")).toMatchObject({
      fix: "G",
      climbLevel: 25000,
      nextFix: "N",
    });
    expect(pickClimbOut(copx.slice(0, 2), "LFBB", "LFRS", "LFBO", toks, wp, "N")).toMatchObject({
      fix: "G",
      climbLevel: 27000,
    });
    expect(pickClimbOut(copx, "LFBB", "LFRZ", "LFBO", toks, wp, "N")).toBeNull();
    expect(
      pickClimbOut(
        [climbLine("LFRS", "G", 25000), climbLine("LFRS", "G", 23000)],
        "LFBB",
        "LFRS",
        "LFBO",
        toks,
        wp,
        "N",
      ),
    ).toMatchObject({ climbLevel: 23000 });
  });
});

describe("P16 — the Nantes reproduction (synthetic geometry)", () => {
  const LFRS = { name: "LFRS", ...O0 };
  const LFBO = { name: "LFBO", lat: 47.0, lon: 0.2 };

  it("pops at the published gate, ≥15 NM from the airport, at FL090, REQALT to FL230", () => {
    const r = run(
      climbRule(),
      [plan("VOE5UR", "LFRS", "G DCT N DCT X", 290)],
      [climbLine("LFRS", "G", 23000, "N")],
      [LFRS, LFBO],
    );
    expect(r.error).toBeNull();
    const a = r.aircraft[0];
    expect(a.spawnWaypoint).toBe("G");
    expect(a.preEntryNm).toBeCloseTo(43.5, 6);
    expect(a.alt).toBe(9000);
    expect(a.reqAltWpt).toBe("G");
    expect(a.reqAltVal).toBe("23000");
    expect(a.simRoute.split(" ")[0]).toBe("G");
    expect(a.spawnLabel).toBe("G");
    expect(a.spawnBrg).toBeUndefined(); // a fix anchor now, not a crossing
    expect(a.spawnDebug).toContain("climb-out · LoA FL230 @G");
    expect(a.gs).toBe(Math.round(a.gs)); // a display value at 250 kt IAS
    expect(a.gs).toBeLessThan(300);
    expect(r.warning).toMatch(/1 climbing in from nearby fields \(LFRS\)/);
    // what the .scn actually carries
    const scn = generateSweatbox(
      { name: "T", airportAlt: 0, ils: [], controllers: [], holdings: [], aircraft: r.aircraft },
      WPTS,
      {},
    );
    const atN = scn.split("\n").find((l) => l.startsWith("@N:VOE5UR"))!;
    const pop = { lat: +atN.split(":")[4], lon: +atN.split(":")[5] };
    expect(distanceNm(O0.lat, O0.lon, pop.lat, pop.lon)).toBeGreaterThanOrEqual(14.99);
    expect(+atN.split(":")[6]).toBe(9000);
    expect(scn).toContain("REQALT:G:23000");
  });
  it("the next fix decides the line: via D instead of N clears to FL250", () => {
    const copx = [climbLine("LFRS", "G", 23000, "N"), climbLine("LFRS", "G", 25000, "D")];
    const r = run(climbRule(), [plan("VOE5UR", "LFRS", "G DCT D DCT X", 290)], copx, [LFRS, LFBO]);
    expect(r.aircraft[0].reqAltVal).toBe("25000");
    expect(r.aircraft[0].spawnWaypoint).toBe("G");
  });
  it("the gate re-anchor itself moves it: from the boundary crossing to the gate", () => {
    // spawnAnchor "entry": without the climb-out the anchor is the crossing on G→N
    const pool = [plan("VOE5UR", "LFRS", "G DCT N DCT X", 290)];
    const copx = [climbLine("LFRS", "G", 23000, "N")];
    const off = run(climbRule({ spawnAnchor: "entry", climbOuts: false }), pool, copx, [
      LFRS,
      LFBO,
    ]);
    expect(off.aircraft[0].spawnWaypoint).toBe("N");
    expect(off.aircraft[0].spawnBrg).toBeDefined();
    const on = run(climbRule({ spawnAnchor: "entry" }), pool, copx, [LFRS, LFBO]);
    const a = on.aircraft[0];
    expect(a.spawnWaypoint).toBe("G");
    expect(a.spawnBrg).toBeUndefined();
    expect(a.preEntryNm).toBe(43.5);
    expect(a).toMatchObject({ alt: 9000, reqAltWpt: "G", reqAltVal: "23000" });
    expect(a.spawnDebug).toContain("published-gate");
    expect(a.spawnDebug).not.toContain("boundary-crossing");
  });
  it("a prior fix between the gate and the boundary loses to the gate", () => {
    // P 6 NM before the boundary; Q 10 NM before the gate, so a prior-fix walk
    // from the gate would have somewhere to go
    const P = { name: "P", lat: 46.1, lon: 0, type: "FIXES" };
    const Q = { name: "Q", ...at(G, 180, 10), type: "FIXES" };
    const wpts = [...WPTS, P, Q];
    const pool = [plan("VOE5UR", "LFRS", "Q DCT G DCT P DCT N DCT X", 290)];
    const copx = [climbLine("LFRS", "G", 23000, "N")];
    const off = runW(wpts, climbRule({ climbOuts: false }), pool, copx, [LFRS, LFBO]);
    expect(off.aircraft[0].spawnWaypoint).toBe("P"); // the prior-fix walk
    const a = runW(wpts, climbRule(), pool, copx, [LFRS, LFBO]).aircraft[0];
    expect(a.spawnWaypoint).toBe("G");
    expect(a.simRoute.split(" ")[0]).toBe("G");
    expect(a.spawnDebug).not.toContain("prior-fix");
    expect(a).toMatchObject({ alt: 9000, reqAltWpt: "G", reqAltVal: "23000" });
  });
  it("a rule that sets its own REQALT keeps it", () => {
    const r = run(
      climbRule({ reqAltWpt: "X", reqAltVal: "31000" }),
      [plan("VOE5UR", "LFRS", "G DCT N DCT X", 290)],
      [climbLine("LFRS", "G", 23000, "N")],
      [LFRS, LFBO],
    );
    expect(r.aircraft[0]).toMatchObject({ alt: 9000, reqAltWpt: "X", reqAltVal: "31000" });
  });
});

describe("P16 — level at the transfer level", () => {
  it("origin 150 NM before the gate, cruise FL350, published FL300 → FL300, no REQALT, on the gate", () => {
    const O = at(G, 180, 150);
    const r = run(
      climbRule(),
      [plan("FAR1", "LFRS", "G DCT N DCT X", 350)],
      [climbLine("LFRS", "G", 30000)],
      [{ name: "LFRS", ...O }],
    );
    const a = r.aircraft[0];
    expect(a.alt).toBe(30000);
    expect(a.reqAltWpt).toBe("");
    expect(a.reqAltVal).toBe("");
    expect(a.spawnWaypoint).toBe("G");
    expect(a.preEntryNm).toBe(45);
    expect(a.spawnDebug).toContain("climb-out · LoA FL300 @G");
  });
});

describe("P16 — no published level: climb to cruise from the existing anchor", () => {
  it("origin 30 NM before the crossing → back-off 15 NM, FL090, REQALT to cruise at the first fix inside", () => {
    // the leg G→N crosses the FIR's south edge (lat 46.2) due north
    const cross = { lat: 46.2, lon: 0 };
    const O = at(cross, 180, 30);
    const r = run(
      climbRule({ spawnAnchor: "entry" }),
      [plan("NEAR1", "LFRS", "G DCT N DCT X", 290)],
      [],
      [{ name: "LFRS", ...O }],
    );
    const a = r.aircraft[0];
    expect(a.spawnWaypoint).toBe("N");
    expect(a.preEntryNm).toBeCloseTo(15, 3);
    expect(a.alt).toBe(9000);
    expect(a.reqAltWpt).toBe("N");
    expect(a.reqAltVal).toBe("29000");
    expect(a.spawnBrg).toBeDefined(); // still the crossing anchor
    expect(a.spawnDebug).toContain("climb-out · no published level → cruise");
    const scn = generateSweatbox(
      { name: "T", airportAlt: 0, ils: [], controllers: [], holdings: [], aircraft: r.aircraft },
      WPTS,
      {},
    );
    const atN = scn.split("\n").find((l) => l.startsWith("@N:NEAR1"))!;
    expect(distanceNm(O.lat, O.lon, +atN.split(":")[4], +atN.split(":")[5])).toBeCloseTo(15, 1);
    expect(scn).toContain("REQALT:N:29000");
  });
});

describe("P16 — prior-fix anchor near the field", () => {
  // the crossing sits on the FIR's south edge, due north
  const cross = { lat: 46.2, lon: 0 };
  it("no published level: REQALT on the first fix inside, not on the prior fix outside", () => {
    const P = { name: "P", ...at(cross, 180, 10), type: "FIXES" };
    const O = at(cross, 180, 30.37); // 20.37 NM from P → back-off 5.37, stored as 5.3
    const r = runW(
      [...WPTS, P],
      climbRule(),
      [plan("NEAR2", "LFRS", "P DCT N DCT X", 290)],
      [],
      [{ name: "LFRS", ...O }],
    );
    const a = r.aircraft[0];
    expect(a.spawnWaypoint).toBe("P");
    expect(a.preEntryNm).toBe(5.3);
    expect(a.spawnDebug).toContain("5.3 NM");
    expect(a).toMatchObject({ alt: 9000, reqAltWpt: "N", reqAltVal: "29000" });
  });
  it("a published level not below cruise does not block the climb from an upstream prior fix", () => {
    // gate G2 just inside, prior fix P 20 NM before the crossing, airport 90 NM
    // before it: the gate pop (45.6 NM out) is already at FL210, but the
    // existing anchor P puts the pop 25 NM from the airport.
    const G2 = { name: "G2", lat: 46.21, lon: 0, type: "FIXES" };
    const P = { name: "P", ...at(cross, 180, 20), type: "FIXES" };
    const O = at(cross, 180, 90);
    const pool = [plan("ATR1", "LFRS", "P DCT G2 DCT X", 210)];
    const copx = [climbLine("LFRS", "G2", 23000)];
    const wpts = [...WPTS, G2, P];
    const off = runW(wpts, climbRule({ climbOuts: false }), pool, copx, [{ name: "LFRS", ...O }]);
    expect(off.aircraft[0]).toMatchObject({ spawnWaypoint: "P", alt: 21000 });
    const a = runW(wpts, climbRule(), pool, copx, [{ name: "LFRS", ...O }]).aircraft[0];
    expect(a.spawnWaypoint).toBe("P");
    expect(a.preEntryNm).toBe(45);
    expect(a).toMatchObject({ alt: 13000, reqAltWpt: "G2", reqAltVal: "21000" });
    expect(a.spawnDebug).toContain("climb-out · LoA FL230 @G2 not used → cruise");
  });
});

describe("P16 — untouched cases deep-equal climbOuts: false", () => {
  const same = (rule: any, pool: any[], copx: any[], airports?: any[]) => {
    setRng(mulberry32(5));
    const on = noIds(run(rule, pool, copx, airports));
    setRng(mulberry32(5));
    const off = noIds(run({ ...rule, climbOuts: false }, pool, copx, airports));
    expect(on).toEqual(off);
    return on;
  };
  it("published level not below cruise, origin far → not moved to the gate", () => {
    // boundary-fix anchor, so "moved to the gate" would be visible
    const O = at(G, 180, 400);
    const r = same(
      climbRule({ spawnAnchor: "entry" }),
      [plan("F1", "LFRS", "G DCT N DCT X", 290)],
      [climbLine("LFRS", "G", 35000)],
      [{ name: "LFRS", ...O }],
    );
    expect(r.aircraft[0].spawnWaypoint).toBe("N");
    expect(r.aircraft[0].spawnBrg).toBeDefined(); // still the crossing
    expect(r.aircraft[0].alt).toBe(29000);
  });
  it("a pop that rounds up to cruise is level at cruise, not climbing", () => {
    // gate pop 75 NM out: a climb reaches 28,750 ft, placed at FL290 = cruise
    same(
      climbRule({ spawnAnchor: "entry" }),
      [plan("R1", "LFRS", "G DCT N DCT X", 290)],
      [climbLine("LFRS", "G", 30000)],
      [{ name: "LFRS", ...at(G, 180, 120) }],
    );
  });
  it("published level not below cruise, origin unknown", () => {
    same(
      climbRule(),
      [plan("F1", "LFRS", "G DCT N DCT X", 290)],
      [climbLine("LFRS", "G", 29000)],
      [],
    );
  });
  it("origin 300 NM away, no published level", () => {
    same(
      climbRule({ spawnAnchor: "entry" }),
      [plan("F2", "LFRS", "G DCT N DCT X", 290)],
      [],
      [{ name: "LFRS", ...at({ lat: 46.2, lon: 0 }, 180, 300) }],
    );
  });
  it("origin unknown, no published level", () => {
    same(
      climbRule({ spawnAnchor: "entry" }),
      [plan("F3", "LFRZ", "G DCT N DCT X", 290)],
      [],
      [{ name: "LFRS", ...O0 }],
    );
  });
  it("climbOuts absent behaves as false", () => {
    const { climbOuts, ...absent } = climbRule();
    const pool = [plan("VOE5UR", "LFRS", "G DCT N DCT X", 290)];
    const copx = [climbLine("LFRS", "G", 23000, "N")];
    setRng(mulberry32(5));
    const a = noIds(run(absent, pool, copx, [{ name: "LFRS", ...O0 }]));
    setRng(mulberry32(5));
    const b = noIds(run(climbRule({ climbOuts: false }), pool, copx, [{ name: "LFRS", ...O0 }]));
    expect(a).toEqual(b);
    expect(a.aircraft[0].alt).toBe(29000);
  });
  it('spawnAltMode "fixed" is the author\'s choice — left alone even with a climb-out line', () => {
    const r = same(
      climbRule({ spawnAltMode: "fixed", spawnAlt: 33000 }),
      [plan("VOE5UR", "LFRS", "G DCT N DCT X", 290)],
      [climbLine("LFRS", "G", 23000, "N")],
      [{ name: "LFRS", ...O0 }],
    );
    expect(r.aircraft[0].alt).toBe(33000);
  });
  it("the 4-argument legacy call is unchanged", () => {
    const wr = {
      ...emptyRule(),
      poolSource: true,
      spawnWaypoint: "N",
      excludeNonRouting: false,
      rate: 8,
      duration: 30,
    };
    const pool = [plan("L1", "LFRS", "G DCT N DCT X", 290)];
    setRng(mulberry32(5));
    const a = generateFromRule({ ...wr, climbOuts: true }, WPTS, new Set(), pool) as any;
    setRng(mulberry32(5));
    const b = generateFromRule({ ...wr, climbOuts: false }, WPTS, new Set(), pool) as any;
    expect(noIds(a)).toEqual(noIds(b));
  });
});
