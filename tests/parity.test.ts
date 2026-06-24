// parity.test.ts
//
// OUTPUT PARITY (top priority): the ported generation modules must reproduce the
// oracle's golden .scn fixtures byte-for-byte. Each case seeds the port's rng
// with the same mulberry32(seed) the oracle used, then drives the identical
// pipeline (harness.driveCase) and compares against tests/fixtures/<name>.scn.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { CASES } from "./fixtures.def.mjs";
import { driveCase } from "./harness.mjs";
import { mulberry32 } from "./prng.mjs";

import { setRng } from "../src/core/rng";
import { setStars } from "../src/core/stars";
import { setRampConfig } from "../src/core/ramp";
import { generateFromRule } from "../src/core/generateFromRule";
import { generateSweatbox } from "../src/core/generateSweatbox";
import { buildGroundAircraft } from "../src/core/ground";

const FIX = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

const portApi = {
  setStars,
  generateFromRule: (rule: any, waypoints: any[], used: Set<string>, pool: any[]) =>
    generateFromRule(rule, waypoints, used, pool),
  generateSweatbox: (scenario: any, waypoints: any[], opts: any) =>
    generateSweatbox(scenario, waypoints, opts),
  buildGroundAircraft: (cfg: any, gates: any[], pool: any[], rampAgent: any) =>
    buildGroundAircraft(cfg, gates, pool, rampAgent),
};

describe("output parity — port reproduces oracle golden .scn byte-for-byte", () => {
  for (const c of CASES) {
    it(`${c.name} (.scn matches oracle)`, () => {
      setRng(mulberry32(c.seed));
      setRampConfig(null);
      const got = driveCase(portApi, c);
      const want = readFileSync(resolve(FIX, `${c.name}.scn`), "utf8");
      expect(got).toBe(want);
    });
  }
});
