// oracle.test.ts
//
// Guards the harness itself: re-runs the ORACLE (original rc3 code in a VM) for
// each case and asserts it still produces the committed golden .scn. If the
// reference HTML, a plugin, or a fixture definition changes, this fails — a
// signal to review and regenerate goldens via `npm run fixtures`.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { CASES } from "./fixtures.def.mjs";
import { driveCase } from "./harness.mjs";
import { oracleApi } from "./oracle/buildGolden.mjs";

const FIX = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("oracle self-check — original rc3 code still matches goldens", () => {
  for (const c of CASES) {
    it(`${c.name} (oracle == golden)`, () => {
      const got = driveCase(oracleApi(c), c);
      const want = readFileSync(resolve(FIX, `${c.name}.scn`), "utf8");
      expect(got).toBe(want);
    });
  }
});
