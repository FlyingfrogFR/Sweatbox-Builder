// rulesImport.test.ts — PORT-ONLY tests for ruleset import normalisation.
// The home-airport rule matters most: a ruleset written before homeIcao
// existed must neither become an overflight (emptyRule's "") nor be stamped
// with a hardcoded LFPG — it takes the scenario's airport, or inherits later.

import { describe, it, expect } from "vitest";
import { extractRules, normalizeRules } from "../src/state/rulesImport";

const legacy = { name: "old arrivals", isDeparture: false, spawnWaypoint: "VEBEK", rate: 6 };

describe("normalizeRules — home airport (7.8.2)", () => {
  it("a legacy rule takes the scenario's airport, explicit and editable", () => {
    const [r] = normalizeRules([legacy], "lfbb");
    expect(r.homeIcao).toBe("LFBB");
    expect(r.mode).toBe("S3");
    expect(r.id).toBeTruthy();
  });

  it("with no scenario airport the key is left ABSENT so the rule inherits later", () => {
    const [r] = normalizeRules([legacy]);
    expect("homeIcao" in r).toBe(false);
    const [r2] = normalizeRules([legacy], "");
    expect("homeIcao" in r2).toBe(false);
  });

  it("never stamps LFPG", () => {
    expect(JSON.stringify(normalizeRules([legacy], "LFBB"))).not.toContain("LFPG");
    expect(JSON.stringify(normalizeRules([legacy]))).not.toContain("LFPG");
  });

  it("an explicit home — including an explicit blank overflight — is preserved verbatim", () => {
    expect(normalizeRules([{ ...legacy, homeIcao: "LFMN" }], "LFBB")[0].homeIcao).toBe("LFMN");
    expect(normalizeRules([{ ...legacy, homeIcao: "" }], "LFBB")[0].homeIcao).toBe("");
  });

  it("still floors preEntryNm at 1 NM", () => {
    expect(normalizeRules([{ ...legacy, preEntryNm: 0 }], "LFBB")[0].preEntryNm).toBe(1);
  });
});

describe("extractRules — every accepted shape", () => {
  it("bare array, rules bundle, scenario bundle, loose object", () => {
    expect(extractRules([legacy]).length).toBe(1);
    expect(extractRules({ kind: "sweatbox-rules", rules: [legacy] }).length).toBe(1);
    expect(extractRules({ kind: "sweatbox-scenario", scenario: { rules: [legacy] } }).length).toBe(
      1,
    );
    expect(extractRules({ rules: [legacy] }).length).toBe(1);
    expect(() => extractRules({ nope: 1 })).toThrow(/rules array/);
  });
});
