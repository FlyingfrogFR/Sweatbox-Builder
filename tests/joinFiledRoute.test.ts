// joinFiledRoute.test.ts — PORT-ONLY tests for two 7.11.0 route behaviours.
//
//   P1 — joinFiledRoute: a pool departure's sim route is the shared SID
//        template, then its OWN filed route from the exit fix onward. Opt-in
//        per rule; absent/false reproduces rc3 (template only).
//   P2 — the export-time pre-entry offset also reads the aircraft's STAR
//        template (rc3 never passed it), so an arrival spawned on an IAF sits
//        on the STAR's inbound track rather than on the reverse of the next
//        leg. The goldens do not exercise this and stay byte-identical.

import { describe, it, expect, beforeEach } from "vitest";

import { mulberry32 } from "./prng.mjs";
import { setRng } from "../src/core/rng";
import { setStars } from "../src/core/stars";
import { generateFromRule } from "../src/core/generateFromRule";
import { generateSweatbox } from "../src/core/generateSweatbox";
import { emptyRule } from "../src/core/model";
import { bearingBetween, distanceNm } from "../src/core/geo";

// A west-bound SID family out of LFPG 26R and the fixes the filed routes
// continue on. Coordinates are plausible, not real.
const WPTS = [
  { name: "PG263", lat: 49.02, lon: 2.45, type: "FIXES" },
  { name: "PG264", lat: 49.05, lon: 2.3, type: "FIXES" },
  { name: "PG265", lat: 49.1, lon: 2.1, type: "FIXES" },
  { name: "PIVER", lat: 49.2, lon: 1.8, type: "FIXES" },
  { name: "CLM", lat: 49.3, lon: 1.5, type: "FIXES" },
  { name: "BEKOS", lat: 49.4, lon: 1.2, type: "FIXES" },
  { name: "BUBLI", lat: 49.5, lon: 0.9, type: "FIXES" },
  { name: "LUVAL", lat: 49.7, lon: 0.4, type: "FIXES" },
];
const SID = "PG263 PG264 PG265 PIVER CLM";

const depRule = (over: any = {}) => ({
  ...emptyRule(),
  id: "dep-w",
  name: "26R west",
  mode: "S3",
  isDeparture: true,
  poolSource: true,
  poolDep: "LFPG",
  poolArr: "",
  routeContains: "BUBLI",
  spawnWaypoint: "PG263",
  simRouteTemplate: SID,
  preEntryNm: 2,
  rate: 8,
  duration: 30,
  ...over,
});
const plan = (callsign: string, route: string, dest = "EGLL") => ({
  callsign,
  type: "A320",
  origin: "LFPG",
  dest,
  route,
  cruiseFL: 350,
  squawk: "1000",
});
const simOf = (r: any, cs: string) => r.aircraft.find((a: any) => a.callsign === cs).simRoute;

beforeEach(() => {
  setRng(mulberry32(7));
  setStars([]);
});

describe("P1 — joinFiledRoute", () => {
  it("joins at the routeContains exit fix and continues down the filed route", () => {
    const r = generateFromRule(depRule({ joinFiledRoute: true }), WPTS, new Set(), [
      plan("AFR1", "BUBLI DCT LUVAL UN491 EGLL"),
    ]);
    expect(r.error).toBeNull();
    expect(simOf(r, "AFR1")).toBe("PG263 PG264 PG265 PIVER CLM BUBLI LUVAL");
    expect(r.aircraft[0].fpRoute).toBe("BUBLI DCT LUVAL UN491 EGLL"); // FP RTE untouched
    expect(r.aircraft[0].spawnDebug).toContain("join-filed@BUBLI");
    expect(r.warning).toBeNull();
  });
  it("absent or false: the template is the whole sim route (rc3)", () => {
    for (const over of [{}, { joinFiledRoute: false }, { joinFiledRoute: "yes" }]) {
      const r = generateFromRule(depRule(over), WPTS, new Set(), [
        plan("AFR1", "BUBLI DCT LUVAL UN491 EGLL"),
      ]);
      expect(simOf(r, "AFR1")).toBe(SID);
      expect(r.warning).toBeNull();
    }
  });
  it("drops DCT, the destination and tokens navdata does not know, keeps fixes in filed order", () => {
    const r = generateFromRule(depRule({ joinFiledRoute: true }), WPTS, new Set(), [
      plan("AFR1", "BUBLI/N0450F350 DCT NOWHERE UN491 LUVAL DCT EGLL"),
    ]);
    expect(simOf(r, "AFR1")).toBe("PG263 PG264 PG265 PIVER CLM BUBLI LUVAL");
  });
  // Without routeContains the rule's own non-routing filter would drop these
  // plans (their FP never names the synthetic spawn fix), so it is off here —
  // the documented setting for a shared sim-route override.
  it("without a routeContains hit, joins at the last template fix found in the filed route — once", () => {
    const r = generateFromRule(
      depRule({ joinFiledRoute: true, routeContains: "", excludeNonRouting: false }),
      WPTS,
      new Set(),
      [plan("AFR1", "LFPG CLM BEKOS BUBLI EGLL")],
    );
    expect(simOf(r, "AFR1")).toBe("PG263 PG264 PG265 PIVER CLM BEKOS BUBLI"); // CLM not doubled
  });
  it("no join point: head only, and the rule's warning counts it", () => {
    const r = generateFromRule(
      depRule({ joinFiledRoute: true, routeContains: "", excludeNonRouting: false }),
      WPTS,
      new Set(),
      [plan("AFR1", "XYZ DCT LUVAL EGLL"), plan("AFR2", "CLM BUBLI EGLL")],
    );
    expect(simOf(r, "AFR1")).toBe(SID);
    expect(simOf(r, "AFR2")).toBe("PG263 PG264 PG265 PIVER CLM BUBLI");
    expect(r.warning).toMatch(/^1 aircraft: no join point/);
    expect(r.aircraft.find((a: any) => a.callsign === "AFR1").spawnDebug).toContain("no-join");
  });
  it("a join fix that never resolves still anchors the join; only resolvable tail fixes are kept", () => {
    const r = generateFromRule(
      depRule({ joinFiledRoute: true, routeContains: "LANVI" }),
      WPTS,
      new Set(),
      [plan("AFR1", "LANVI UN491 LUVAL EGLL")],
    );
    expect(simOf(r, "AFR1")).toBe("PG263 PG264 PG265 PIVER CLM LUVAL");
  });
  it("the head is cut at the join fix wherever it sits — the SID points past an exit are not flown", () => {
    const r = generateFromRule(
      depRule({ joinFiledRoute: true, routeContains: "PIVER" }),
      WPTS,
      new Set(),
      [plan("AFR1", "PIVER UN123 BUBLI LUVAL EGLL")],
    );
    expect(simOf(r, "AFR1")).toBe("PG263 PG264 PG265 PIVER BUBLI LUVAL"); // no CLM, no doubling back
  });
  it("departures only: an arrival rule carrying the flag keeps its template (and no warning)", () => {
    const r = generateFromRule(
      depRule({
        joinFiledRoute: true,
        isDeparture: false,
        poolDep: "",
        poolArr: "EGLL",
        routeContains: "BUBLI",
      }),
      WPTS,
      new Set(),
      [{ ...plan("AFR1", "BUBLI DCT LUVAL UN491 EGLL"), origin: "LFPG", dest: "EGLL" }],
    );
    expect(r.aircraft).toHaveLength(1);
    expect(simOf(r, "AFR1")).toBe(SID);
    expect(r.warning).toBeNull();
  });
  it("the never-on-fix check sees the joined route, so a template with no resolvable next fix still spawns", () => {
    const r = generateFromRule(
      depRule({ joinFiledRoute: true, simRouteTemplate: "PG263 NOPE", routeContains: "BUBLI" }),
      WPTS,
      new Set(),
      [plan("AFR1", "BUBLI DCT LUVAL EGLL")],
    );
    expect(r.aircraft).toHaveLength(1);
    expect(simOf(r, "AFR1")).toBe("PG263 NOPE BUBLI LUVAL");
  });
  it("needs a sim template: without one the filed route is already the sim route", () => {
    const r = generateFromRule(
      depRule({ joinFiledRoute: true, simRouteTemplate: "" }),
      WPTS,
      new Set(),
      [plan("AFR1", "PG263 BUBLI LUVAL EGLL")],
    );
    expect(simOf(r, "AFR1")).toBe("PG263 BUBLI LUVAL EGLL");
    expect(r.warning).toBeNull();
  });
});

describe("P2 — pre-entry offset reads the STAR template at export", () => {
  // A STAR with a turn at the IAF, so "reverse of the next leg" and "inbound
  // STAR track" point different ways.
  const STAR_WPTS = [
    { name: "TRO", lat: 48.0, lon: 4.0, type: "FIXES" },
    { name: "URELO", lat: 48.5, lon: 3.5, type: "FIXES" }, // NW-bound leg into OKIPA
    { name: "OKIPA", lat: 49.0, lon: 3.0, type: "FIXES" },
    { name: "PG522", lat: 49.0, lon: 2.4, type: "FIXES" }, // then due west
  ];
  const ac = (over: any = {}) => ({
    id: "x1",
    callsign: "AFR9",
    squawk: "1000",
    type: "A320",
    origin: "LIRF",
    dest: "LFPG",
    cruiseAlt: 35000,
    lat: 49.0,
    lon: 3.0,
    alt: 18000,
    gs: 420,
    runway: "26L",
    spawnWaypoint: "OKIPA",
    spawnMode: "waypoint",
    preEntryNm: 12,
    fpRoute: "LIRF OKIPA LFPG", // the real FPL ends at the STAR entry: no fix before OKIPA
    simRoute: "OKIPA PG522",
    starRoute: "TRO URELO OKIPA PG522",
    start: "",
    reqAltWpt: "",
    reqAltVal: "",
    isDeparture: false,
    ruleId: null,
    ...over,
  });
  const spawnOf = (a: any) => {
    const scn = generateSweatbox(
      { name: "T", airportAlt: 0, ils: [], controllers: [], holdings: [], aircraft: [a] },
      STAR_WPTS,
      {},
    );
    const atN = scn.split("\n").find((l) => l.startsWith("@N:AFR9"))!;
    return { lat: +atN.split(":")[4], lon: +atN.split(":")[5] };
  };
  const okipa = STAR_WPTS[2];
  const urelo = STAR_WPTS[1];

  it("places the aircraft 12 NM before the IAF on the STAR's inbound track", () => {
    const p = spawnOf(ac());
    const inbound = bearingBetween(urelo.lat, urelo.lon, okipa.lat, okipa.lon);
    const got = bearingBetween(p.lat, p.lon, okipa.lat, okipa.lon);
    expect(Math.abs(((got - inbound + 540) % 360) - 180)).toBeLessThan(2);
    expect(Math.abs(distanceNm(p.lat, p.lon, okipa.lat, okipa.lon) - 12)).toBeLessThan(0.1);
  });
  it("without a STAR template the rc3 fallback stands: reverse of the next leg", () => {
    const p = spawnOf(ac({ starRoute: "" }));
    const nextLeg = bearingBetween(okipa.lat, okipa.lon, STAR_WPTS[3].lat, STAR_WPTS[3].lon);
    const got = bearingBetween(okipa.lat, okipa.lon, p.lat, p.lon);
    expect(Math.abs(((got - (nextLeg + 180) + 540) % 360) - 180)).toBeLessThan(2);
  });
  it("a filed fix before the IAF still wins over the STAR (sim, then FP, then STAR)", () => {
    // SOUTH sits due south of OKIPA, well off the URELO→OKIPA line, so the
    // two candidate bearings differ by far more than the tolerance.
    const south = { name: "SOUTH", lat: 48.0, lon: 3.0, type: "FIXES" };
    const scn = generateSweatbox(
      {
        name: "T",
        airportAlt: 0,
        ils: [],
        controllers: [],
        holdings: [],
        aircraft: [ac({ fpRoute: "LIRF SOUTH OKIPA LFPG" })],
      },
      [...STAR_WPTS, south],
      {},
    );
    const atN = scn.split("\n").find((l) => l.startsWith("@N:AFR9"))!;
    const p = { lat: +atN.split(":")[4], lon: +atN.split(":")[5] };
    const fromFp = bearingBetween(south.lat, south.lon, okipa.lat, okipa.lon);
    const fromStar = bearingBetween(urelo.lat, urelo.lon, okipa.lat, okipa.lon);
    expect(Math.abs(((fromFp - fromStar + 540) % 360) - 180)).toBeGreaterThan(10); // the test can fail
    const got = bearingBetween(p.lat, p.lon, okipa.lat, okipa.lon);
    expect(Math.abs(((got - fromFp + 540) % 360) - 180)).toBeLessThan(2);
  });
  it("the non-pool template branch keeps an aircraft whose only inbound leg comes from the STAR template", () => {
    const r = generateFromRule(
      {
        ...emptyRule(),
        id: "arr-t",
        isDeparture: false,
        poolSource: false,
        spawnWaypoint: "OKIPA",
        simRouteTemplate: "TRO URELO OKIPA PG522",
        fpRouteTemplate: "",
        preEntryNm: 12,
        rate: 4,
        duration: 15,
        originPool: "LIRF",
        homeIcao: "LFPG",
      },
      STAR_WPTS,
      new Set(),
      [],
    );
    expect(r.aircraft.length).toBeGreaterThan(0);
    expect(r.aircraft[0].starRoute).toBe("TRO URELO OKIPA PG522");
  });
});
