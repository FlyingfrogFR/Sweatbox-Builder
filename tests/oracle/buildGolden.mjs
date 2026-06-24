// buildGolden.mjs
//
// Regenerate the golden .scn fixtures from the ORACLE (original rc3 code).
// Run via `npm run fixtures`. Each case loads a fresh oracle seeded with the
// case's seed so the RNG stream is independent and reproducible.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadOracle } from "./loadOracle.mjs";
import { driveCase } from "../harness.mjs";
import { CASES } from "../fixtures.def.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_DIR = resolve(__dirname, "..", "fixtures");

export function oracleApi(c) {
  const { SB, loadPlugin } = loadOracle(c.seed);
  if (c.plugin) loadPlugin(c.plugin);
  return {
    setStars: (s) => {
      SB.stars = s;
    },
    generateFromRule: (rule, waypoints, used, pool) =>
      SB.generateFromRule(rule, waypoints, used, pool),
    generateSweatbox: (scenario, waypoints, opts) => SB.generateSweatbox(scenario, waypoints, opts),
    buildGroundAircraft: (cfg, gates, pool, rampAgent) => {
      if (typeof SB.__buildGroundAircraft !== "function")
        throw new Error("buildGroundAircraft not exposed — plugin not loaded?");
      return SB.__buildGroundAircraft(cfg, gates, pool, rampAgent);
    },
  };
}

function main() {
  mkdirSync(FIX_DIR, { recursive: true });
  let n = 0;
  for (const c of CASES) {
    const scn = driveCase(oracleApi(c), c);
    const file = resolve(FIX_DIR, `${c.name}.scn`);
    writeFileSync(file, scn, "utf8");
    console.log(`✓ ${c.name}.scn  (${scn.length} bytes, ${scn.split("\n").length} lines)`);
    n++;
  }
  console.log(`\nWrote ${n} golden fixture(s) to tests/fixtures/`);
}

// Only run when invoked directly (not when imported by the parity test).
if (import.meta.url === `file://${process.argv[1]}`) main();
