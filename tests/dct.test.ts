// dct.test.ts — PORT-ONLY tests for removing DCT tokens from routes (7.10.0).
// Removal is an explicit action (editor, board, pool); nothing here touches
// the generators, and a route without DCT must come back untouched so the
// action can never reformat what it does not change.

import { describe, it, expect } from "vitest";

import { countDct, stripDct } from "../src/core/route";
import { stripDctFromPool } from "../src/core/pool";

describe("stripDct / countDct", () => {
  it("drops every DCT token and nothing else", () => {
    expect(stripDct("EHAM DCT RENSA VEBEK DCT OKABO LFPG")).toBe("EHAM RENSA VEBEK OKABO LFPG");
    expect(countDct("EHAM DCT RENSA VEBEK DCT OKABO LFPG")).toBe(2);
  });
  it("is case-insensitive and treats a suffixed DCT as DCT", () => {
    expect(stripDct("EHAM dct RENSA Dct/N0450F350 OKABO")).toBe("EHAM RENSA OKABO");
    expect(countDct("EHAM dct RENSA Dct/N0450F350 OKABO")).toBe(2);
  });
  it("keeps fix suffixes, airways and case exactly as filed", () => {
    expect(stripDct("ETAMO/N0453F370 DCT UT163 lmg DCT")).toBe("ETAMO/N0453F370 UT163 lmg");
  });
  it("never touches a token that merely contains DCT", () => {
    expect(stripDct("DCTAB DCT ABDCT")).toBe("DCTAB ABDCT");
    expect(countDct("DCTAB ABDCT")).toBe(0);
  });
  it("a route with no DCT comes back untouched — whitespace included", () => {
    const r = "  EHAM   RENSA\nOKABO ";
    expect(stripDct(r)).toBe(r);
    expect(countDct(r)).toBe(0);
  });
  it("collapses the whitespace it has to touch, and only then", () => {
    expect(stripDct("EHAM  DCT   RENSA")).toBe("EHAM RENSA");
  });
  it("blank, null and all-DCT routes", () => {
    expect(stripDct("")).toBe("");
    expect(stripDct(null)).toBe("");
    expect(stripDct(undefined)).toBe("");
    expect(stripDct("DCT")).toBe("");
    expect(stripDct("DCT DCT")).toBe("");
    expect(stripDct("DCT LFBO")).toBe("LFBO"); // the ground generator's placeholder
    expect(countDct(null)).toBe(0);
  });
  it("is idempotent", () => {
    const once = stripDct("A DCT B DCT C");
    expect(stripDct(once)).toBe(once);
  });
});

describe("stripDctFromPool — the pool footer action", () => {
  const entry = (id: string, route: string) => ({
    id,
    callsign: id.toUpperCase(),
    route,
    type: "A320",
  });
  it("strips only the named entries and reports how many changed", () => {
    const pool = [entry("a", "X DCT Y"), entry("b", "P DCT Q"), entry("c", "M N")];
    const r = stripDctFromPool(pool, ["a", "c"]);
    expect(r.changed).toBe(1);
    expect(r.pool.map((p) => p.route)).toEqual(["X Y", "P DCT Q", "M N"]);
    expect(r.pool[1]).toBe(pool[1]); // not named: same object
    expect(r.pool[2]).toBe(pool[2]); // named but DCT-free: same object
    expect(r.pool[0]).not.toBe(pool[0]);
    expect(r.pool[0]).toEqual({ ...pool[0], route: "X Y" });
  });
  it("returns the same array when nothing changes", () => {
    const pool = [entry("a", "X Y"), entry("b", "P Q")];
    const r = stripDctFromPool(pool, ["a", "b", "nope"]);
    expect(r.pool).toBe(pool);
    expect(r.changed).toBe(0);
  });
  it("copes with entries that have no route", () => {
    const pool = [{ id: "a", callsign: "A" }];
    const r = stripDctFromPool(pool, ["a"]);
    expect(r.pool).toBe(pool);
    expect(r.changed).toBe(0);
  });
});
