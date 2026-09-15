// naming.test.ts — export filename convention.
import { describe, it, expect } from "vitest";
import { buildExportName } from "../src/io/fileSave";

describe("export naming convention ICAO_X.Y_CONFIGYY", () => {
  const tokens = { icao: "lfbo", version: "3.3", config: "config", configNum: "32" };

  it("scenario -> ICAO_X.Y_CONFIGYY.txt (CONFIG uppercased)", () => {
    expect(buildExportName(tokens, "scenario")).toBe("LFBO_3.3_CONFIG32.txt");
  });

  it("ruleset -> ICAO_X.Y_CONFIGYY_RULESET.json", () => {
    expect(buildExportName(tokens, "ruleset")).toBe("LFBO_3.3_CONFIG32_RULESET.json");
  });

  it("uppercases ICAO and config token", () => {
    expect(
      buildExportName(
        { icao: "lfpg", version: "3.3", config: "west", configNum: "27" },
        "scenario",
      ),
    ).toBe("LFPG_3.3_WEST27.txt");
  });
});

describe("custom export names (7.8.0)", () => {
  const custom = (customName: string) => ({
    nameMode: "custom",
    customName,
    icao: "",
    version: "",
    config: "",
    configNum: "",
  });

  it("uses the typed name, with our own extension", () => {
    expect(buildExportName(custom("LFBB north session 3"), "scenario")).toBe(
      "LFBB north session 3.txt",
    );
    expect(buildExportName(custom("LFBB north session 3"), "ruleset")).toBe(
      "LFBB north session 3_RULESET.json",
    );
  });

  it("drops an extension the user typed rather than doubling it", () => {
    expect(buildExportName(custom("evening rush.txt"), "scenario")).toBe("evening rush.txt");
    expect(buildExportName(custom("evening rush.scn"), "scenario")).toBe("evening rush.txt");
  });

  it("strips path separators and characters Windows rejects", () => {
    expect(buildExportName(custom("../../etc/passwd"), "scenario")).toBe("etcpasswd.txt");
    expect(buildExportName(custom('a:b*c?d"e<f>g|h'), "scenario")).toBe("abcdefgh.txt");
    expect(buildExportName(custom("  spaced  "), "scenario")).toBe("spaced.txt");
  });

  it("falls back to the convention when the custom name is empty or unusable", () => {
    const tokens = { icao: "LFBO", version: "3.3", config: "CONFIG", configNum: "32" };
    expect(buildExportName({ ...tokens, nameMode: "custom", customName: "" }, "scenario")).toBe(
      "LFBO_3.3_CONFIG32.txt",
    );
    expect(buildExportName({ ...tokens, nameMode: "custom", customName: "///" }, "scenario")).toBe(
      "LFBO_3.3_CONFIG32.txt",
    );
  });

  it("the convention is untouched when nameMode is absent or 'tokens'", () => {
    const tokens = { icao: "lfbo", version: "3.3", config: "config", configNum: "32" };
    expect(buildExportName(tokens, "scenario")).toBe("LFBO_3.3_CONFIG32.txt");
    expect(
      buildExportName({ ...tokens, nameMode: "tokens", customName: "ignored" }, "scenario"),
    ).toBe("LFBO_3.3_CONFIG32.txt");
  });
});
