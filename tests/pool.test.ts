// pool.test.ts — PORT-ONLY tests for editing and copying entries IN the pool
// (7.9.0). None of this reaches the generators: a pool entry is a template,
// and these lock down what the template says after an edit or a copy.
//
//   copyCallsigns        — the A…Z family rule and its cap
//   duplicatePoolEntries — whole-entry copies, placed after their original
//   validatePoolEntry    — normalisation + the duplicate-callsign guard
//   addToPool            — the merge-by-callsign hazard copies must never trip

import { describe, it, expect, vi } from "vitest";

import {
  MAX_COPIES,
  MAX_COPY_BATCH,
  addToPool,
  copyBatchTooLarge,
  copyCallsigns,
  duplicatePoolEntries,
  poolCallsigns,
  updatePoolEntry,
  validatePoolEntry,
} from "../src/core/pool";

const entry = (id: string, callsign: string, extra: any = {}) => ({
  id,
  addedAt: 1000,
  source: "vatsim",
  callsign,
  type: "A320",
  origin: "LFPG",
  dest: "LFBO",
  route: "OKABO UT163 LMG",
  cruiseFL: 350,
  squawk: "1000",
  ...extra,
});

describe("copyCallsigns — swap the last character for A…Z", () => {
  it("a digit-ending callsign gets A, B, C … in order", () => {
    expect(copyCallsigns("AFR1234", new Set(), 3)).toEqual(["AFR123A", "AFR123B", "AFR123C"]);
  });
  it("a letter-ending callsign skips its own letter", () => {
    expect(copyCallsigns("BAW12A", new Set(), 2)).toEqual(["BAW12B", "BAW12C"]);
    expect(copyCallsigns("BAW12C", new Set(), 3)).toEqual(["BAW12A", "BAW12B", "BAW12D"]);
  });
  it("skips callsigns already in the pool, case-insensitively", () => {
    const taken = new Set(["AFR123A", "AFR123C"]);
    expect(copyCallsigns("afr1234", taken, 2)).toEqual(["AFR123B", "AFR123D"]);
  });
  it("never makes more than MAX_COPIES, nor more than the free letters", () => {
    expect(MAX_COPIES).toBe(25);
    expect(copyCallsigns("AFR1234", new Set(), 99)).toHaveLength(25);
    expect(copyCallsigns("AFR1234", new Set(), 25).at(-1)).toBe("AFR123Y");
    const taken = new Set("ABCDEFGHIJKLMNOPQRSTUVW".split("").map((l) => "AFR123" + l));
    expect(copyCallsigns("AFR1234", taken, 10)).toEqual(["AFR123X", "AFR123Y", "AFR123Z"]);
  });
  it("blank, one-character, zero and negative requests yield nothing", () => {
    expect(copyCallsigns("", new Set(), 5)).toEqual([]);
    expect(copyCallsigns("   ", new Set(), 5)).toEqual([]);
    expect(copyCallsigns("A", new Set(), 5)).toEqual([]); // nothing left to keep
    expect(copyCallsigns("A7", new Set(), 2)).toEqual(["AA", "AB"]);
    expect(copyCallsigns("AFR1234", new Set(), 0)).toEqual([]);
    expect(copyCallsigns("AFR1234", new Set(), -3)).toEqual([]);
    expect(copyCallsigns("AFR1234", new Set(), NaN)).toEqual([]);
  });
  it("a fractional count rounds down", () => {
    expect(copyCallsigns("AFR1234", new Set(), 2.9)).toHaveLength(2);
  });
});

describe("duplicatePoolEntries — the WHOLE entry, right after its original", () => {
  it("copies every field verbatim except id, addedAt and callsign", () => {
    const orig = entry("p1", "AFR1234", { remarks: "RMK/TCAS", wtc: "M", extraImported: [1, 2] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
    const before = Date.now();
    const { pool, made, skipped } = duplicatePoolEntries([orig], ["p1"], 2);
    vi.useRealTimers();
    expect(pool).toHaveLength(3);
    expect(pool[0]).toBe(orig);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({
      fromId: "p1",
      from: "AFR1234",
      to: ["AFR123A", "AFR123B"],
      asked: 2,
    });
    expect(made[0].ids).toEqual([pool[1].id, pool[2].id]); // so the UI can select the copies
    expect(skipped).toEqual([]);
    for (const [i, c] of [pool[1], pool[2]].entries()) {
      const { id, addedAt, callsign, ...rest } = c;
      const { id: _i, addedAt: _a, callsign: _c, ...origRest } = orig;
      expect(rest).toEqual(origRest); // route, squawk, type, source, remarks, anything
      expect(callsign).toBe(["AFR123A", "AFR123B"][i]);
      expect(id).not.toBe(orig.id);
      expect(typeof id).toBe("string");
      expect(addedAt).toBe(before); // stamped with the clock at copy time, not the original's
    }
    expect(new Set(pool.map((p) => p.id)).size).toBe(3);
  });
  it("places copies immediately after their original, leaving the rest in order", () => {
    const pool = [entry("p1", "AFR1234"), entry("p2", "KLM44"), entry("p3", "DLH9")];
    const out = duplicatePoolEntries(pool, ["p1", "p3"], 1).pool.map((p) => p.callsign);
    expect(out).toEqual(["AFR1234", "AFR123A", "KLM44", "DLH9", "DLHA"]);
  });
  it("two originals sharing a stem never collide — letters are claimed as they go", () => {
    const pool = [entry("p1", "AFR1234"), entry("p2", "AFR1235")];
    const out = duplicatePoolEntries(pool, ["p1", "p2"], 2).pool.map((p) => p.callsign);
    expect(out).toEqual(["AFR1234", "AFR123A", "AFR123B", "AFR1235", "AFR123C", "AFR123D"]);
    expect(new Set(out).size).toBe(out.length);
  });
  it("respects callsigns already in the pool, including earlier copies", () => {
    const pool = [entry("p1", "AFR1234"), entry("p2", "AFR123A"), entry("p3", "AFR123B")];
    const { pool: out, made } = duplicatePoolEntries(pool, ["p1"], 1);
    expect(made.map((m) => [m.from, m.to])).toEqual([["AFR1234", ["AFR123C"]]]);
    expect(out.map((p) => p.callsign)).toEqual(["AFR1234", "AFR123C", "AFR123A", "AFR123B"]);
  });
  it("an entry without a callsign, or with no letter left, is skipped and reported", () => {
    const full = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l, i) => entry(`f${i}`, "AFR123" + l));
    const pool = [entry("p0", ""), entry("p1", "AFR1234"), ...full];
    const { pool: out, made, skipped } = duplicatePoolEntries(pool, ["p0", "p1"], 3);
    expect(out).toHaveLength(pool.length);
    expect(made).toEqual([]);
    expect(skipped).toEqual(["(no callsign)", "AFR1234"]);
  });
  it("caps at MAX_COPIES per original per request", () => {
    const { pool, made } = duplicatePoolEntries([entry("p1", "AFR1234")], ["p1"], 1000);
    expect(pool).toHaveLength(1 + MAX_COPIES);
    expect(made[0].asked).toBe(MAX_COPIES);
  });
  it("reports a shortfall: asked for more than the letters left", () => {
    const taken = "ABCDEFGHIJKLMNOPQRSTUVW".split("").map((l, i) => entry(`t${i}`, "AFR123" + l));
    const { made } = duplicatePoolEntries([entry("p1", "AFR1234"), ...taken], ["p1"], 10);
    expect(made[0]).toMatchObject({ asked: 10, to: ["AFR123X", "AFR123Y", "AFR123Z"] });
  });
  it("does not mutate its input", () => {
    const pool = [entry("p1", "AFR1234")];
    const snapshot = JSON.stringify(pool);
    duplicatePoolEntries(pool, ["p1"], 3);
    expect(JSON.stringify(pool)).toBe(snapshot);
  });
  it("asking for zero copies is not 'no letter left' — the same pool comes back, nothing reported", () => {
    const pool = [entry("p1", "AFR1234")];
    for (const n of [0, -1, NaN, 0.4]) {
      const r = duplicatePoolEntries(pool, ["p1"], n);
      expect(r.pool).toBe(pool);
      expect(r.made).toEqual([]);
      expect(r.skipped).toEqual([]);
    }
  });
  it("copyBatchTooLarge guards the per-go ceiling the footer enforces", () => {
    expect(MAX_COPY_BATCH).toBe(500);
    expect(copyBatchTooLarge(20, 25)).toBe(false);
    expect(copyBatchTooLarge(21, 25)).toBe(true);
    expect(copyBatchTooLarge(1, 1)).toBe(false);
  });
  it("ids that are not in the pool are ignored; the pool comes back unchanged", () => {
    const pool = [entry("p1", "AFR1234")];
    const r = duplicatePoolEntries(pool, ["nope"], 3);
    expect(r.pool).toEqual(pool);
    expect(r.made).toEqual([]);
    expect(r.skipped).toEqual([]);
  });
});

describe("validatePoolEntry — what SAVE would store, and what it refuses", () => {
  const pool = [entry("p1", "AFR1234"), entry("p2", "KLM44")];

  it("uppercases, drops whitespace in codes and collapses it in the route", () => {
    const { value, errors } = validatePoolEntry(
      {
        callsign: " afr 1234 ",
        type: "a 320",
        origin: "lfpg",
        dest: "lfbo",
        route: "  okabo   ut163\n lmg ",
        cruiseFL: "350",
        squawk: "1000",
      },
      pool,
      "p1",
    );
    expect(errors).toEqual({});
    expect(value).toEqual({
      callsign: "AFR1234",
      type: "A320",
      origin: "LFPG",
      dest: "LFBO",
      route: "OKABO UT163 LMG",
      cruiseFL: 350,
      squawk: "1000",
    });
  });
  it("refuses, rather than silently dropping, a character a code cannot contain", () => {
    expect(validatePoolEntry({ callsign: "AFR-1234" }, pool).errors.callsign).toBe(
      "Letters and digits only",
    );
    expect(validatePoolEntry({ type: "B738/M" }, pool).errors.type).toBe("Letters and digits only");
    expect(validatePoolEntry({ origin: "LF:G" }, pool).errors.origin).toBe(
      "Letters and digits only",
    );
    expect(validatePoolEntry({ dest: "LFBÖ" }, pool).errors.dest).toBe("Letters and digits only");
  });
  it("a route may carry '/' (speed/level suffixes) but never ':' — the .scn field separator", () => {
    expect(
      validatePoolEntry({ route: "ETAMO/N0453F370 UT163 LMG" }, pool).errors.route,
    ).toBeUndefined();
    expect(validatePoolEntry({ route: "OKABO:UT163" }, pool).errors.route).toBeDefined();
    expect(validatePoolEntry({ route: "OKABO \u0007 UT163" }, pool).errors.route).toBeDefined();
  });
  it("refuses a callsign another entry already has, but not the entry's own", () => {
    expect(validatePoolEntry({ callsign: "klm44" }, pool, "p1").errors.callsign).toMatch(
      /KLM44 is already in the pool/,
    );
    expect(validatePoolEntry({ callsign: "AFR1234" }, pool, "p1").errors.callsign).toBeUndefined();
    expect(validatePoolEntry({ callsign: "AFR1234" }, pool).errors.callsign).toBeDefined();
  });
  it("a blank callsign is allowed (the generator invents one)", () => {
    const { value, errors } = validatePoolEntry({ callsign: "" }, pool, "p1");
    expect(errors.callsign).toBeUndefined();
    expect(value.callsign).toBe("");
  });
  it("flight level: blank means unknown (0); plain digits 0–700 only", () => {
    expect(validatePoolEntry({ cruiseFL: "" }, pool).value.cruiseFL).toBe(0);
    expect(validatePoolEntry({ cruiseFL: 350 }, pool).value.cruiseFL).toBe(350);
    expect(validatePoolEntry({ cruiseFL: " 700 " }, pool).value.cruiseFL).toBe(700);
    for (const bad of ["710", "701", "35.5", "FL350", "-5", "0x10", "1e2", "Infinity"])
      expect(validatePoolEntry({ cruiseFL: bad }, pool).errors.cruiseFL, bad).toBeDefined();
  });
  it("squawk: four octal digits or blank", () => {
    expect(validatePoolEntry({ squawk: "7000" }, pool).errors.squawk).toBeUndefined();
    expect(validatePoolEntry({ squawk: "" }, pool).errors.squawk).toBeUndefined();
    expect(validatePoolEntry({ squawk: "1800" }, pool).errors.squawk).toBeDefined();
    expect(validatePoolEntry({ squawk: "100" }, pool).errors.squawk).toBeDefined();
  });
  it("origin and destination are four letters or blank", () => {
    expect(validatePoolEntry({ origin: "LFP" }, pool).errors.origin).toBeDefined();
    expect(validatePoolEntry({ dest: "" }, pool).errors.dest).toBeUndefined();
    expect(validatePoolEntry({ dest: "LFBO" }, pool).errors.dest).toBeUndefined();
  });
  it("over-long codes are refused, not cut — so a stray character past the cap cannot hide", () => {
    expect(validatePoolEntry({ type: "ABCDEFGHIJ" }, pool).errors.type).toBe("Too long (max 8)");
    expect(validatePoolEntry({ callsign: "ABCDEFGHIJKLMNOP" }, pool).errors.callsign).toBe(
      "Too long (max 12)",
    );
    expect(validatePoolEntry({ callsign: "ABCDEFGHIJKL-" }, pool).errors.callsign).toBe(
      "Letters and digits only",
    );
    expect(validatePoolEntry({ type: "ABCDEFGH/M" }, pool).errors.type).toBe(
      "Letters and digits only",
    );
    expect(validatePoolEntry({ callsign: "ABCDEFGHIJKL" }, pool).errors.callsign).toBeUndefined();
    expect(validatePoolEntry({ route: "X".repeat(2001) }, pool).errors.route).toBe(
      "Too long (max 2000)",
    );
  });
});

describe("updatePoolEntry — fields change, identity does not", () => {
  it("a partial value changes only the fields it names", () => {
    const pool = [entry("p1", "AFR1234", { remarks: "RMK/TCAS" })];
    const out = updatePoolEntry(pool, "p1", { callsign: "AFR99" });
    expect(out[0]).toEqual({ ...pool[0], callsign: "AFR99" }); // type, route, squawk… untouched
  });
  it("refuses what validatePoolEntry refuses, and an unknown id — same array back", () => {
    const pool = [entry("p1", "AFR1234"), entry("p2", "KLM44")];
    expect(updatePoolEntry(pool, "p1", { ...pool[0], callsign: "KLM44" })).toBe(pool); // duplicate
    expect(updatePoolEntry(pool, "p1", { ...pool[0], squawk: "1800" })).toBe(pool); // octal
    expect(updatePoolEntry(pool, "nope", { ...pool[0], callsign: "ZZZ1" })).toBe(pool);
    const ok = updatePoolEntry(pool, "p1", { ...pool[0], callsign: "AFR1234" }); // own callsign is fine
    expect(ok).not.toBe(pool);
    expect(ok[0].callsign).toBe("AFR1234");
  });
  it("keeps id, addedAt, source and any field the editor does not own", () => {
    const pool = [entry("p1", "AFR1234", { remarks: "RMK/TCAS" }), entry("p2", "KLM44")];
    const out = updatePoolEntry(pool, "p1", {
      callsign: "afr99",
      type: "b738",
      origin: "LFPG",
      dest: "LFBO",
      route: "x  y",
      cruiseFL: "360",
      squawk: "2000",
    });
    expect(out[1]).toBe(pool[1]);
    expect(out[0]).toEqual({
      ...pool[0],
      callsign: "AFR99",
      type: "B738",
      route: "X Y",
      cruiseFL: 360,
      squawk: "2000",
    });
    expect(out[0].remarks).toBe("RMK/TCAS");
    expect(out[0].id).toBe("p1");
    expect(out[0].addedAt).toBe(1000);
    expect(out[0].source).toBe("vatsim");
  });
});

describe("addToPool merges by callsign — copies must never trip it", () => {
  it("a copied family survives a later add intact", () => {
    const { pool } = duplicatePoolEntries([entry("p1", "AFR1234")], ["p1"], 3);
    const after = addToPool(
      pool,
      [
        {
          callsign: "DLH9",
          type: "A319",
          origin: "EDDF",
          dest: "LFPG",
          route: "",
          cruiseFL: 330,
          squawk: "1000",
        },
      ],
      "manual",
    );
    expect(after.map((p) => p.callsign)).toEqual([
      "AFR1234",
      "AFR123A",
      "AFR123B",
      "AFR123C",
      "DLH9",
    ]);
  });
  it("a later import with a copy's callsign merges INTO the copy — same callsign, same flight", () => {
    // Pins the existing addToPool semantics so nobody "fixes" them for copies:
    // the copy keeps its id and addedAt, the imported fields win.
    const { pool } = duplicatePoolEntries([entry("p1", "AFR1234")], ["p1"], 1);
    const copyId = pool[1].id;
    const after = addToPool(
      pool,
      [
        {
          callsign: "AFR123A",
          type: "A21N",
          origin: "LFPG",
          dest: "LFBO",
          route: "DIRECT",
          cruiseFL: 370,
          squawk: "4321",
        },
      ],
      "vatsim",
    );
    expect(after).toHaveLength(2);
    const merged = after.find((p) => p.callsign === "AFR123A");
    expect(merged.id).toBe(copyId);
    expect(merged.type).toBe("A21N");
    expect(merged.route).toBe("DIRECT");
  });
  it("poolCallsigns is the taken-set the copy rule reads", () => {
    const s = poolCallsigns([entry("p1", "afr1234"), entry("p2", ""), entry("p3", "KLM44")], "p3");
    expect([...s]).toEqual(["AFR1234"]);
  });
});
