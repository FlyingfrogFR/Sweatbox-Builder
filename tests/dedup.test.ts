// dedup.test.ts — PORT-ONLY tests for the C1 core patches. These cover
// behavior that intentionally diverges from (or was never reachable in) the
// rc3 oracle, so there are no goldens here: the parity suite stays the
// authority for legacy inputs, and these lock the new behavior down.
//
//   P1 — pool-sourced callsign dedup (deliberate bug-fix divergence from rc3)
//   P2 — blank homeIcao = overflight (both ends drawn from pools)
//   P3 — spawnAltMode "poolCruise" (per-aircraft spawn at filed cruise FL)

import { describe, it, expect, beforeEach } from "vitest";

import { mulberry32 } from "./prng.mjs";
import { setRng } from "../src/core/rng";
import { setStars } from "../src/core/stars";
import { generateFromRule } from "../src/core/generateFromRule";
import { emptyRule } from "../src/core/model";
import { machToTas } from "../src/core/speed";

// OKABO gives every route a resolvable downstream fix — app-shaped rules
// (spawnMode present) enforce the never-on-fix invariant and exclude aircraft
// whose inbound leg can't be derived at all.
const WPTS = [
  { name: "RENSA", lat: 49.6, lon: 3.4, type: "FIXES" },
  { name: "OKABO", lat: 49.05, lon: 2.7, type: "FIXES" },
];

const POOL = [
  {
    callsign: "KLM44",
    type: "B738",
    origin: "EHAM",
    dest: "LIRF",
    route: "EHAM RENSA OKABO LIRF",
    cruiseFL: 340,
    squawk: "1000",
  },
  {
    callsign: "BAW12",
    type: "A320",
    origin: "EGLL",
    dest: "LIRF",
    route: "EGLL RENSA OKABO LIRF",
    cruiseFL: 360,
    squawk: "1000",
  },
  {
    callsign: "DLH99",
    type: "A359",
    origin: "EDDF",
    dest: "LIRF",
    route: "EDDF RENSA OKABO LIRF",
    cruiseFL: 380,
    squawk: "1000",
  },
];

// A C1-transit-shaped pool rule: empty DEP/ARR filters, routeContains doing
// the discriminating — exactly the overlap pattern P1 exists for.
const poolRule = (over: any = {}) => ({
  ...emptyRule(),
  name: "transit",
  mode: "C1",
  poolSource: true,
  poolDep: "",
  poolArr: "",
  routeContains: "RENSA",
  spawnWaypoint: "RENSA",
  rate: 8,
  duration: 30,
  ...over,
});

beforeEach(() => {
  setRng(mulberry32(7));
  setStars([]);
});

describe("P1 — pool callsign dedup across overlapping rules", () => {
  it("two rules with overlapping pool filters emit zero duplicate callsigns", () => {
    const used = new Set<string>();
    const a = generateFromRule(poolRule({ id: "r1" }), WPTS, used, POOL);
    const b = generateFromRule(poolRule({ id: "r2" }), WPTS, used, POOL);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    const all = [...a.aircraft, ...b.aircraft].map((x: any) => x.callsign);
    expect(all.length).toBe(6);
    expect(new Set(all).size).toBe(all.length);
  });

  it("collisions take A/B… suffixes on the original callsign", () => {
    const used = new Set<string>();
    generateFromRule(poolRule({ id: "r1" }), WPTS, used, POOL);
    const b = generateFromRule(poolRule({ id: "r2" }), WPTS, used, POOL);
    expect(b.aircraft.map((x: any) => x.callsign)).toEqual(["KLM44A", "BAW12A", "DLH99A"]);
    // and a third pass suffixes B
    const c = generateFromRule(poolRule({ id: "r3" }), WPTS, used, POOL);
    expect(c.aircraft.map((x: any) => x.callsign)).toEqual(["KLM44B", "BAW12B", "DLH99B"]);
  });

  it("single rule with unique pool callsigns is unchanged (parity shape)", () => {
    const used = new Set<string>();
    const a = generateFromRule(poolRule(), WPTS, used, POOL);
    expect(a.aircraft.map((x: any) => x.callsign)).toEqual(["KLM44", "BAW12", "DLH99"]);
  });

  it("beyond 26 collisions the numeric fallback still guarantees uniqueness", () => {
    const used = new Set<string>();
    const all: string[] = [];
    for (let i = 0; i < 30; i++) {
      const r = generateFromRule(poolRule({ id: `r${i}` }), WPTS, used, POOL);
      expect(r.error).toBeNull();
      all.push(...r.aircraft.map((x: any) => x.callsign));
    }
    expect(all.length).toBe(90);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain("KLM44Z"); // 27th pass exhausts A-Z…
    expect(all).toContain("KLM442"); // …then numeric suffixes take over
  });
});

describe("P2 — blank homeIcao draws both ends from pools (overflight)", () => {
  const tmplRule = (over: any = {}) => ({
    ...emptyRule(),
    name: "overflight",
    mode: "C1",
    poolSource: false,
    spawnWaypoint: "RENSA",
    originPool: "EGLL",
    destPool: "LIRF",
    fpRouteTemplate: "EGLL RENSA OKABO LIRF",
    rate: 8,
    duration: 30,
    ...over,
  });

  it("arrival with homeIcao '' — origin from originPool, dest from destPool", () => {
    const r = generateFromRule(tmplRule({ homeIcao: "", isDeparture: false }), WPTS, new Set(), []);
    expect(r.error).toBeNull();
    expect(r.aircraft.length).toBeGreaterThan(0);
    for (const ac of r.aircraft) {
      expect(ac.origin).toBe("EGLL");
      expect(ac.dest).toBe("LIRF");
    }
  });

  it("departure with homeIcao '' — origin from originPool, dest from destPool", () => {
    const r = generateFromRule(tmplRule({ homeIcao: "", isDeparture: true }), WPTS, new Set(), []);
    expect(r.error).toBeNull();
    for (const ac of r.aircraft) {
      expect(ac.origin).toBe("EGLL");
      expect(ac.dest).toBe("LIRF");
    }
  });

  it("legacy rule (no homeIcao key) still gets LFPG on the home side", () => {
    const legacyArr: any = tmplRule({ isDeparture: false });
    delete legacyArr.homeIcao;
    const a = generateFromRule(legacyArr, WPTS, new Set(), []);
    for (const ac of a.aircraft) {
      expect(ac.origin).toBe("EGLL");
      expect(ac.dest).toBe("LFPG");
    }
    const legacyDep: any = tmplRule({ isDeparture: true });
    delete legacyDep.homeIcao;
    const d = generateFromRule(legacyDep, WPTS, new Set(), []);
    for (const ac of d.aircraft) {
      expect(ac.origin).toBe("LFPG");
      expect(ac.dest).toBe("LIRF");
    }
  });
});

describe("P3 — spawnAltMode 'poolCruise' spawns each aircraft at its filed FL", () => {
  const cruiseRule = (over: any = {}) =>
    poolRule({
      gsMode: "fixed",
      speedType: "mach",
      assignedSpeed: 0.78,
      spawnAlt: 13000,
      ...over,
    });

  it("poolCruise: alt = cruiseFL*100 and gs = Mach TAS at each aircraft's own level", () => {
    const r = generateFromRule(cruiseRule({ spawnAltMode: "poolCruise" }), WPTS, new Set(), POOL);
    expect(r.error).toBeNull();
    expect(r.aircraft.length).toBe(3);
    for (let i = 0; i < r.aircraft.length; i++) {
      const ac: any = r.aircraft[i];
      expect(ac.alt).toBe(POOL[i].cruiseFL * 100);
      expect(ac.gs).toBe(Math.round(machToTas(0.78, POOL[i].cruiseFL * 100)));
    }
    // The FL band produces genuinely different spawn speeds (same Mach,
    // different ISA temperature). NB: below the tropopause TAS at constant
    // Mach DECREASES as the air gets colder with altitude — the point is
    // per-aircraft coherence, not a monotonic climb.
    const speeds = new Set(r.aircraft.map((x: any) => x.gs));
    expect(speeds.size).toBeGreaterThan(1);
  });

  it("spawnAltMode 'fixed' (and absent) reproduce the rule-level spawnAlt exactly", () => {
    for (const shape of [{ spawnAltMode: "fixed" }, {}]) {
      const base: any = cruiseRule(shape);
      if (!("spawnAltMode" in shape)) delete base.spawnAltMode;
      const r = generateFromRule(base, WPTS, new Set(), POOL);
      expect(r.error).toBeNull();
      for (const ac of r.aircraft) {
        expect(ac.alt).toBe(13000);
        expect(ac.gs).toBe(Math.round(machToTas(0.78, 13000)));
      }
    }
  });
});
