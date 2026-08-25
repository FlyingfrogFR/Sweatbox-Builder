// vatsim-pairing.test.ts — PORT-ONLY. City-pair filtering for the VATSIM
// import: either end may be one airport, a whole country, or anywhere.
import { describe, it, expect } from "vitest";
import { matchesEndpoint, regionLabel, regionValue, endpointLabel } from "../src/core/icaoRegions";
import { filterVatsimPilots, filterVatsimRoutes } from "../src/net/apis";

const fp = (callsign: string, departure: string, arrival: string, prefile = false) => ({
  callsign,
  latitude: prefile ? undefined : 45,
  transponder: "2000",
  flight_plan: {
    departure,
    arrival,
    aircraft_short: "A320",
    route: "DCT",
    altitude: "36000",
    assigned_transponder: "1000",
  },
});

const DATA = {
  pilots: [
    fp("IBE1", "LEMD", "LFPG"), // Spain  -> France
    fp("VLG2", "LEBL", "LFBO"), // Spain  -> France
    fp("AFR3", "LFPG", "LEMD"), // France -> Spain
    fp("BAW4", "EGLL", "LFPG"), // UK     -> France
    fp("DLH5", "EDDF", "EGLL"), // Germany-> UK
    { callsign: "NOFP", latitude: 1 }, // no flight plan at all
  ],
  prefiles: [fp("RYR6", "LEPA", "LFML", true)], // Spain -> France, prefiled
};

const names = (rows: any[]) => rows.map((r) => r.callsign).sort();

describe("endpoint matching", () => {
  it("treats blank as anywhere, 4 letters as one airport, shorter as a country", () => {
    expect(matchesEndpoint("LEMD", "")).toBe(true);
    expect(matchesEndpoint("LEMD", "****")).toBe(true);
    expect(matchesEndpoint("LEMD", "LEMD")).toBe(true);
    expect(matchesEndpoint("LEMD", "LFPG")).toBe(false);
    expect(matchesEndpoint("LEMD", "LE**")).toBe(true);
    expect(matchesEndpoint("LEMD", "LE")).toBe(true);
    expect(matchesEndpoint("LFPG", "LE**")).toBe(false);
    expect(matchesEndpoint("KJFK", "K***")).toBe(true); // single-letter prefixes work
    expect(matchesEndpoint("lemd", "le**")).toBe(true); // case-insensitive
  });

  it("labels regions the way controllers write them", () => {
    expect(regionLabel("LE")).toBe("LE** — Spain");
    expect(regionLabel("K")).toBe("K*** — United States");
    expect(regionValue("LE")).toBe("LE**");
    expect(endpointLabel("")).toBe("anywhere");
    expect(endpointLabel("LFPG")).toBe("LFPG");
    expect(endpointLabel("LE**")).toBe("LE** — Spain");
  });
});

describe("filterVatsimRoutes — city pairs", () => {
  it("country to country, including prefiled flight plans", () => {
    expect(names(filterVatsimRoutes(DATA, "LE**", "LF**"))).toEqual(["IBE1", "RYR6", "VLG2"]);
  });

  it("country to a specific airport, and airport to country", () => {
    expect(names(filterVatsimRoutes(DATA, "LE**", "LFPG"))).toEqual(["IBE1"]);
    expect(names(filterVatsimRoutes(DATA, "LFPG", "LE**"))).toEqual(["AFR3"]);
  });

  it("airport to airport, and one open end", () => {
    expect(names(filterVatsimRoutes(DATA, "EGLL", "LFPG"))).toEqual(["BAW4"]);
    expect(names(filterVatsimRoutes(DATA, "", "LFPG"))).toEqual(["BAW4", "IBE1"]);
    expect(names(filterVatsimRoutes(DATA, "LE**", ""))).toEqual(["IBE1", "RYR6", "VLG2"]);
  });

  it("is direction-sensitive and drops entries with no flight plan", () => {
    expect(names(filterVatsimRoutes(DATA, "LF**", "LE**"))).toEqual(["AFR3"]);
    expect(filterVatsimRoutes(DATA, "LE**", "LF**").some((r: any) => r.callsign === "NOFP")).toBe(
      false,
    );
  });

  it("maps rows the same way the single-airport fetch does", () => {
    const [row]: any = filterVatsimRoutes(DATA, "EGLL", "LFPG");
    const [same]: any = filterVatsimPilots(DATA, "EGLL", "dep");
    expect(row).toEqual(same);
    expect(row).toMatchObject({ dep: "EGLL", arr: "LFPG", type: "A320", cruiseFL: 360 });
  });

  it("single-airport filtering is unchanged", () => {
    expect(names(filterVatsimPilots(DATA, "LFPG", "arr"))).toEqual(["BAW4", "IBE1"]);
    expect(names(filterVatsimPilots(DATA, "LFPG", "dep"))).toEqual(["AFR3"]);
    expect(names(filterVatsimPilots(DATA, "LFPG", "both"))).toEqual(["AFR3", "BAW4", "IBE1"]);
  });
});
