// naming.test.ts — export filename convention.
import { describe, it, expect } from "vitest";
import { buildExportName } from "../src/io/fileSave";

describe("export naming convention ICAO_X.Y_CONFIGYY", () => {
  const tokens = { icao: "lfbo", version: "3.3", config: "config", configNum: "32" };

  it("scenario -> ICAO_X.Y_CONFIGYY.scn (CONFIG uppercased)", () => {
    expect(buildExportName(tokens, "scenario")).toBe("LFBO_3.3_CONFIG32.scn");
  });

  it("ruleset -> ICAO_X.Y_CONFIGYY_RULESET.json", () => {
    expect(buildExportName(tokens, "ruleset")).toBe("LFBO_3.3_CONFIG32_RULESET.json");
  });

  it("uppercases ICAO and config token", () => {
    expect(buildExportName({ icao: "lfpg", version: "3.3", config: "west", configNum: "27" }, "scenario")).toBe(
      "LFPG_3.3_WEST27.scn",
    );
  });
});
