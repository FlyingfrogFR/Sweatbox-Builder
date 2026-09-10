// exportSettings.test.ts — PORT-ONLY tests for the scenario-owned export plate
// (7.6.0). The plate used to be one global sb:export block that every save
// slot displayed, so switching slots never changed the filename or the mentor
// pseudo-pilot. These lock the precedence down: a pinned block wins, a derived
// one takes its identity from the slot and only mentor-level preferences from
// the global mirror — and generation output never depends on any of it.

import { describe, it, expect } from "vitest";

import {
  EMPTY_EXPORT,
  deriveExportSettings,
  initPseudoPilotFor,
  normalizeExportSettings,
  seedFromName,
} from "../src/core/exportSettings";
import { generateSweatbox } from "../src/core/generateSweatbox";
import { defaultScenario } from "../src/core/model";

const GLOBAL = {
  icao: "LFPG",
  version: "3.3",
  config: "WEST",
  configNum: "26",
  autoAssign: true,
  ppMode: "list",
  ppList: "LFPG_APP",
  ppCustom: "LFPG_M_APP",
};

describe("seedFromName — what a slot name spells out", () => {
  it("convention-shaped names carry all four tokens", () => {
    expect(seedFromName("LFBB_1_1_NORTH32")).toEqual({
      icao: "LFBB",
      version: "1.1",
      config: "NORTH",
      configNum: "32",
    });
    expect(seedFromName("LFPG_3.3_WEST26")).toEqual({
      icao: "LFPG",
      version: "3.3",
      config: "WEST",
      configNum: "26",
    });
    expect(seedFromName("lfbb 1.1 north 32")).toEqual({
      icao: "LFBB",
      version: "1.1",
      config: "NORTH",
      configNum: "32",
    });
  });

  it("a leading four-letter word on its own seeds only the ICAO", () => {
    expect(seedFromName("LFBB north")).toEqual({ icao: "LFBB" });
    expect(seedFromName("LFPG-LFBO")).toEqual({ icao: "LFPG" });
    expect(seedFromName("lfpg")).toEqual({ icao: "LFPG" });
  });

  it("ordinary words are not ICAOs (the classic slice(0,4) said EVEN / UNTI / RECO)", () => {
    expect(seedFromName("Evening rush")).toEqual({});
    expect(seedFromName("Untitled")).toEqual({});
    expect(seedFromName("Recovered")).toEqual({});
    expect(seedFromName("")).toEqual({});
    expect(seedFromName(undefined)).toEqual({});
  });
});

describe("deriveExportSettings — pinned block wins, derived block is slot-identity + mentor prefs", () => {
  const ctrl = (cs: string) => ({ id: cs, callsign: cs, freq: "120.000" });

  it("a pinned block is returned as-is (normalised) and flagged pinned", () => {
    const sc = {
      ...defaultScenario(),
      name: "LFBB north",
      exportSettings: { icao: "lfbd", version: "2.0", config: "east", configNum: "05" },
    };
    const r = deriveExportSettings(sc, GLOBAL);
    expect(r.pinned).toBe(true);
    expect(r.settings).toEqual({
      ...EMPTY_EXPORT,
      icao: "LFBD",
      version: "2.0",
      config: "EAST",
      configNum: "05",
    });
  });

  it("an unpinned slot never inherits another slot's config / number / ICAO from the global mirror", () => {
    const sc = { ...defaultScenario(), name: "Evening rush" };
    const r = deriveExportSettings(sc, GLOBAL);
    expect(r.pinned).toBe(false);
    expect(r.settings.icao).toBe("");
    expect(r.settings.config).toBe("");
    expect(r.settings.configNum).toBe("");
    // mentor-level preferences do carry over
    expect(r.settings.version).toBe("3.3");
    expect(r.settings.autoAssign).toBe(true);
    expect(r.settings.ppMode).toBe("list");
    expect(r.settings.ppCustom).toBe("LFPG_M_APP");
  });

  it("a convention-shaped slot name yields a complete plate with no re-entry", () => {
    const sc = { ...defaultScenario(), name: "LFBB_1_1_NORTH32", controllers: [ctrl("LFBD_APP")] };
    const r = deriveExportSettings(sc, GLOBAL, new Set(["LFBD"]));
    // the name is authoritative — LFBB is a FIR, not a known airport, and
    // still wins over the controller's LFBD
    expect(r.settings).toMatchObject({
      icao: "LFBB",
      version: "1.1",
      config: "NORTH",
      configNum: "32",
    });
  });

  it("ICAO falls back to a controller's station prefix, validated against loaded airports", () => {
    const sc = {
      ...defaultScenario(),
      name: "Evening rush",
      controllers: [ctrl("LFPG_APP"), ctrl("LFPG_TWR")],
    };
    expect(deriveExportSettings(sc, GLOBAL).settings.icao).toBe("LFPG");
    // name seed not a loaded airport → the controller's is
    const named = { ...sc, name: "EGLL arrivals" };
    expect(deriveExportSettings(named, GLOBAL, new Set(["LFPG", "LFPO"])).settings.icao).toBe(
      "LFPG",
    );
    // no airports loaded → the name seed is taken at face value
    expect(deriveExportSettings(named, GLOBAL).settings.icao).toBe("EGLL");
    // nothing matches the loaded list → first candidate rather than nothing
    expect(deriveExportSettings(named, GLOBAL, new Set(["LFBO"])).settings.icao).toBe("EGLL");
  });

  it("the mirrored controller pick only carries over when this slot has that controller", () => {
    const withIt = { ...defaultScenario(), name: "LFPG rush", controllers: [ctrl("LFPG_APP")] };
    const without = { ...defaultScenario(), name: "LFBB north", controllers: [ctrl("LFBB_CTR")] };
    expect(deriveExportSettings(withIt, GLOBAL).settings.ppList).toBe("LFPG_APP");
    expect(deriveExportSettings(without, GLOBAL).settings.ppList).toBe("");
  });

  it("with no global mirror at all the derived plate is the empty block plus the slot's identity", () => {
    const sc = { ...defaultScenario(), name: "LFBB north" };
    expect(deriveExportSettings(sc, undefined).settings).toEqual({ ...EMPTY_EXPORT, icao: "LFBB" });
    expect(deriveExportSettings(sc, null).settings).toEqual({ ...EMPTY_EXPORT, icao: "LFBB" });
  });
});

describe("normalizeExportSettings — stored / imported blocks are coerced, non-blocks rejected", () => {
  it("rejects null, undefined, strings and arrays", () => {
    expect(normalizeExportSettings(null)).toBeNull();
    expect(normalizeExportSettings(undefined)).toBeNull();
    expect(normalizeExportSettings("LFPG")).toBeNull();
    expect(normalizeExportSettings([])).toBeNull();
  });

  it("coerces every field and defaults ppMode to list", () => {
    expect(
      normalizeExportSettings({ icao: " lfpg ", configNum: 26, autoAssign: 1, ppMode: "nope" }),
    ).toEqual({
      ...EMPTY_EXPORT,
      icao: "LFPG",
      configNum: "26",
      autoAssign: true,
      ppMode: "list",
    });
    expect(normalizeExportSettings({ ppMode: "custom", ppCustom: "lfpg_m_app" })).toMatchObject({
      ppMode: "custom",
      ppCustom: "LFPG_M_APP",
    });
  });
});

describe("initPseudoPilotFor — the exact expression the shell always used", () => {
  const base = { ...EMPTY_EXPORT, ppList: "LFPG_APP", ppCustom: "LFPG_M_APP" };
  it("off → none", () => {
    expect(initPseudoPilotFor({ ...base, autoAssign: false })).toBe("");
  });
  it("list → the picked controller", () => {
    expect(initPseudoPilotFor({ ...base, autoAssign: true, ppMode: "list" })).toBe("LFPG_APP");
  });
  it("custom → the typed callsign", () => {
    expect(initPseudoPilotFor({ ...base, autoAssign: true, ppMode: "custom" })).toBe("LFPG_M_APP");
  });
  it("list with nothing picked → none (no INITIALPSEUDOPILOT line)", () => {
    expect(initPseudoPilotFor({ ...base, autoAssign: true, ppMode: "list", ppList: "" })).toBe("");
  });
});

describe("generation never depends on the export block", () => {
  it("generateSweatbox output is identical with and without exportSettings on the scenario", () => {
    const wp = [
      { name: "RENSA", lat: 49.6, lon: 3.4, type: "FIXES" },
      { name: "OKABO", lat: 49.05, lon: 2.7, type: "FIXES" },
    ];
    const ac = {
      id: "a1",
      callsign: "AFR1",
      squawk: "1000",
      type: "A320",
      origin: "EHAM",
      dest: "LFPG",
      cruiseAlt: 35000,
      lat: 49.6,
      lon: 3.4,
      alt: 13000,
      gs: 280,
      spawnWaypoint: "RENSA",
      preEntryNm: 10,
      simRoute: "RENSA OKABO LFPG",
      fpRoute: "EHAM RENSA OKABO LFPG",
      start: "",
      reqAltWpt: "",
      reqAltVal: "",
    };
    const plain: any = {
      name: "LFPG_TEST",
      airportAlt: 392,
      ils: [{ name: "27R", lat1: 49.026638, lon1: 2.5617251, lat2: 49.0247256, lon2: 2.5248595 }],
      controllers: [{ callsign: "LFPG_APP", freq: "126.430" }],
      holdings: [],
      aircraft: [ac],
    };
    const withBlock = { ...plain, exportSettings: { ...GLOBAL } };
    const a = generateSweatbox(plain, wp, { initPseudoPilot: "LFPG_APP" });
    const b = generateSweatbox(withBlock, wp, { initPseudoPilot: "LFPG_APP" });
    expect(b).toBe(a);
    // and a defaultScenario() now carries the key, still generating the same frame
    const d = generateSweatbox({ ...defaultScenario(), ...plain }, wp, {
      initPseudoPilot: "LFPG_APP",
    });
    expect(d).toBe(a);
  });
});
