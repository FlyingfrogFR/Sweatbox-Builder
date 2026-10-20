// slots.test.ts — the save-slot layer against a storage that can run out
// (7.11.1). The bug these pin: localStorage refusing a write was swallowed,
// so a slot could be LISTED with nothing saved behind it, and clicking it did
// nothing — "the scenario is frozen". The tests run on a fake localStorage
// with a quota, so the failure path is exercised deterministically.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- a quota-limited localStorage stand-in ----
function fakeStorage(quotaChars: number) {
  const m = new Map<string, string>();
  const used = () => [...m.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const api = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => {
      const next =
        used() - (m.has(k) ? k.length + m.get(k)!.length : 0) + k.length + String(v).length;
      if (next > quotaChars) {
        const e: any = new Error("QuotaExceededError");
        e.name = "QuotaExceededError";
        throw e;
      }
      m.set(k, String(v));
    },
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    _used: used,
  };
  return api;
}

let ls: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  ls = fakeStorage(20_000);
  (globalThis as any).localStorage = ls;
});

// import after the global exists (modules read `localStorage` lazily anyway)
import { storage, storageUsage, KEYS } from "../src/state/storage";
import {
  writeSlot,
  readSlot,
  readSlotStatus,
  listSlots,
  pushSnap,
  listSnaps,
  purgeSnapshots,
  slotSummary,
  renameSlot,
  ensureActiveSlot,
} from "../src/state/slots";
import { rescueBundle } from "../src/deck/CrashScreen";

const scenario = (name: string, n = 0) => ({
  name,
  aircraft: Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    callsign: `AFR${i}`,
    fpRoute: "A B C D E F",
    simRoute: "B C D E",
  })),
  rules: [],
  controllers: [],
});

describe("storage.set — a refused write is reported, not swallowed", () => {
  it("returns true and stores when it fits", () => {
    expect(storage.set("k", { a: 1 })).toBe(true);
    expect(storage.get("k")).toEqual({ a: 1 });
  });
  it("returns false and tells subscribers when the quota is hit", () => {
    const seen: string[] = [];
    const off = storage.onFailure((k) => seen.push(k));
    expect(storage.set("big", "x".repeat(30_000))).toBe(false);
    expect(seen).toEqual(["big"]);
    off();
    expect(storage.set("big2", "x".repeat(30_000))).toBe(false);
    expect(seen).toEqual(["big"]); // unsubscribed
  });
  it("raw() tells missing from present", () => {
    expect(storage.raw("nope")).toBeNull();
    storage.set("yes", 1);
    expect(storage.raw("yes")).toBe("1");
  });
});

describe("writeSlot — the name is listed only once the payload is stored", () => {
  it("lists a slot whose payload fits", () => {
    expect(writeSlot("A", scenario("A", 2))).toBe(true);
    expect(listSlots()).toEqual(["A"]);
    expect(readSlotStatus("A")).toBe("ok");
    expect(readSlot("A").aircraft).toHaveLength(2);
  });
  it("does NOT list a new slot whose payload is refused — no ghost", () => {
    expect(writeSlot("Huge", scenario("Huge", 400))).toBe(false);
    expect(listSlots()).toEqual([]);
    expect(readSlotStatus("Huge")).toBe("missing");
  });
  it("an existing slot keeps its last good payload when a bigger save is refused", () => {
    expect(writeSlot("A", scenario("A", 2))).toBe(true);
    expect(writeSlot("A", scenario("A", 400))).toBe(false);
    expect(listSlots()).toEqual(["A"]);
    expect(readSlot("A").aircraft).toHaveLength(2);
  });
});

describe("readSlotStatus / readSlot — missing vs unreadable", () => {
  it("a listed name with nothing behind it is 'missing' (the pre-7.11.1 ghost)", () => {
    ls.setItem(KEYS.list, JSON.stringify(["Ghost"]));
    expect(readSlotStatus("Ghost")).toBe("missing");
    expect(readSlot("Ghost")).toBeNull();
    expect(slotSummary("Ghost").status).toBe("missing");
  });
  it("unparseable or non-object payloads are 'corrupt' and never opened as a scenario", () => {
    ls.setItem("sb:sc:Bad", '{"name":"Bad","aircraft":[{trunc');
    ls.setItem("sb:sc:Arr", "[1,2,3]");
    ls.setItem("sb:sc:Str", '"hello"');
    for (const n of ["Bad", "Arr", "Str"]) {
      expect(readSlotStatus(n)).toBe("corrupt");
      expect(readSlot(n)).toBeNull();
    }
  });
  it("the active scenario is reported ok even when its last save was refused", () => {
    const live = scenario("Live", 400);
    expect(writeSlot("Live", live)).toBe(false);
    expect(slotSummary("Live", live).status).toBe("ok");
    expect(slotSummary("Live", live).ac).toBe(400);
  });
});

describe("pushSnap — the REWIND ring is capped by size and survives a full store", () => {
  it("keeps the newest and drops the oldest when the ring outgrows its budget", () => {
    (globalThis as any).localStorage = ls = fakeStorage(5_000_000);
    const big = scenario("S", 700).aircraft; // ~700 × ~90 chars ≈ 63k per snapshot → 10 of them > 400k
    for (let i = 0; i < 10; i++) pushSnap("S", `snap ${i}`, big);
    const ring = listSnaps("S");
    expect(ring.length).toBeLessThan(10);
    expect(ring.length).toBeGreaterThan(0);
    expect(ring[0].label).toBe("snap 9"); // newest first, always kept
    expect(JSON.stringify(ring).length).toBeLessThanOrEqual(400_000);
  });
  it("when even the ring does not fit, it shrinks to what does — never throws", () => {
    (globalThis as any).localStorage = ls = fakeStorage(3_000);
    const ac = scenario("S", 20).aircraft;
    expect(() => pushSnap("S", "a", ac)).not.toThrow();
    expect(() => pushSnap("S", "b", ac)).not.toThrow();
    expect(listSnaps("S").length).toBeLessThanOrEqual(2);
  });
  it("purgeSnapshots drops every ring and reports what it freed", () => {
    (globalThis as any).localStorage = ls = fakeStorage(5_000_000);
    pushSnap("A", "x", scenario("A", 5).aircraft);
    pushSnap("B", "y", scenario("B", 5).aircraft);
    writeSlot("A", scenario("A", 1));
    const before = ls._used();
    const freed = purgeSnapshots();
    expect(freed).toBeGreaterThan(0);
    expect(ls._used()).toBe(before - freed);
    expect(listSnaps("A")).toEqual([]);
    expect(listSnaps("B")).toEqual([]);
    expect(readSlotStatus("A")).toBe("ok"); // scenarios untouched
  });
});

describe("storageUsage — what the dialog shows", () => {
  it("groups by what the data is for", () => {
    (globalThis as any).localStorage = ls = fakeStorage(5_000_000);
    writeSlot("A", scenario("A", 3));
    writeSlot("B", scenario("B", 1));
    pushSnap("A", "x", scenario("A", 3).aircraft);
    storage.set(KEYS.waypoints, [{ name: "OKABO", lat: 1, lon: 2 }]);
    storage.set(KEYS.pool, [{ callsign: "AFR1" }]);
    storage.set(KEYS.ghToken, "github_pat_x");
    const u = storageUsage();
    expect(u.slots).toBe(2);
    expect(u.snapshotKeys).toBe(1);
    expect(u.scenarios).toBeGreaterThan(0);
    expect(u.snapshots).toBeGreaterThan(0);
    expect(u.navdata).toBeGreaterThan(0);
    expect(u.pool).toBeGreaterThan(0);
    expect(u.other).toBeGreaterThan(0); // list, meta, token
    expect(u.total).toBe(u.scenarios + u.snapshots + u.navdata + u.pool + u.other);
    expect(u.total).toBe(ls._used());
  });
});

describe("writeSlot — a new name needs the list to grow too", () => {
  it("rolls the payload back when the payload fits but the list write is refused", () => {
    // Leave exactly enough room for the payload and nothing more.
    writeSlot("A", scenario("A", 1));
    const payload = JSON.stringify({ ...scenario("Zed", 1), name: "Zed" });
    const room = payload.length + "sb:sc:Zed".length;
    const fill = 20_000 - ls._used() - room;
    ls.setItem("filler", "x".repeat(fill - "filler".length));
    expect(writeSlot("Zed", scenario("Zed", 1))).toBe(false);
    expect(listSlots()).toEqual(["A"]);
    expect(readSlotStatus("Zed")).toBe("missing"); // no unlisted orphan left behind
  });
});

describe("renameSlot — nothing is removed until the new name is safely stored", () => {
  it("refuses with a reason when the renamed payload does not fit, and leaves everything as it was", () => {
    writeSlot("A", scenario("A", 2));
    ls.setItem("filler", "x".repeat(20_000 - ls._used() - 40));
    const before = ls.getItem("sb:sc:A");
    expect(renameSlot("A", "A renamed")).toMatch(/Storage is full/);
    expect(listSlots()).toEqual(["A"]);
    expect(ls.getItem("sb:sc:A")).toBe(before);
    expect(readSlotStatus("A renamed")).toBe("missing");
  });
  it("refuses to rename an unreadable slot and keeps its bytes", () => {
    ls.setItem(KEYS.list, JSON.stringify(["Bad"]));
    ls.setItem("sb:sc:Bad", "{not json");
    expect(renameSlot("Bad", "Fixed")).toMatch(/unreadable/);
    expect(ls.getItem("sb:sc:Bad")).toBe("{not json");
    expect(listSlots()).toEqual(["Bad"]);
  });
  it("renames a never-saved slot by its list entry alone", () => {
    ls.setItem(KEYS.list, JSON.stringify(["Ghost"]));
    expect(renameSlot("Ghost", "Spirit")).toBeNull();
    expect(listSlots()).toEqual(["Spirit"]);
    expect(readSlotStatus("Spirit")).toBe("missing");
  });
  it("a normal rename moves payload, ring and list, then removes the old keys", () => {
    writeSlot("A", scenario("A", 1));
    pushSnap("A", "s", scenario("A", 1).aircraft);
    expect(renameSlot("A", "B")).toBeNull();
    expect(listSlots()).toEqual(["B"]);
    expect(readSlot("B").name).toBe("B");
    expect(listSnaps("B")).toHaveLength(1);
    expect(readSlotStatus("A")).toBe("missing");
    expect(listSnaps("A")).toEqual([]);
  });
});

describe("ensureActiveSlot — never adopts an unreadable slot", () => {
  it("skips a corrupt active slot for the first readable one", () => {
    ls.setItem(KEYS.list, JSON.stringify(["Bad", "Good"]));
    ls.setItem("sb:sc:Bad", "{trunc");
    writeSlot("Good", scenario("Good", 1));
    ls.setItem("sb:slotmeta", JSON.stringify({ active: "Bad", meta: {} }));
    const r = ensureActiveSlot();
    expect(r.name).toBe("Good");
    expect(ls.getItem("sb:sc:Bad")).toBe("{trunc"); // untouched
  });
  it("prefers a never-saved slot over a corrupt one, opening it empty", () => {
    ls.setItem(KEYS.list, JSON.stringify(["Bad", "Ghost"]));
    ls.setItem("sb:sc:Bad", "{trunc");
    const r = ensureActiveSlot();
    expect(r.name).toBe("Ghost");
    expect(r.scenario.aircraft).toEqual([]);
  });
  it("with only corrupt slots, starts a fresh Untitled instead", () => {
    ls.setItem(KEYS.list, JSON.stringify(["Bad"]));
    ls.setItem("sb:sc:Bad", "{trunc");
    const r = ensureActiveSlot();
    expect(r.name).toBe("Untitled");
    expect(listSlots()).toEqual(["Bad", "Untitled"]);
    expect(ls.getItem("sb:sc:Bad")).toBe("{trunc");
  });
});

describe("shape guards", () => {
  it("a payload whose rules or aircraft are not lists is 'corrupt' (the shell would throw on it)", () => {
    ls.setItem("sb:sc:R", JSON.stringify({ name: "R", rules: { a: 1 } }));
    ls.setItem("sb:sc:C", JSON.stringify({ name: "C", aircraft: "none" }));
    expect(readSlotStatus("R")).toBe("corrupt");
    expect(readSlotStatus("C")).toBe("corrupt");
    expect(readSlot("R")).toBeNull();
  });
  it("a REWIND ring that is not a list reads as empty and is overwritten by the next snapshot", () => {
    ls.setItem("sb:snap:S", "{}");
    expect(listSnaps("S")).toEqual([]);
    expect(() => pushSnap("S", "a", [])).not.toThrow();
    expect(listSnaps("S")).toHaveLength(1);
  });
});

describe("rescueBundle — every sb:* key except the credential", () => {
  it("never carries the GitHub token", () => {
    writeSlot("A", scenario("A", 1));
    storage.set(KEYS.ghToken, "github_pat_SECRET_VALUE_123");
    storage.set(KEYS.pool, [{ callsign: "AFR1" }]);
    const b = JSON.parse(rescueBundle());
    expect(b.kind).toBe("sweatbox-rescue");
    expect(Object.keys(b.data)).toContain("sb:sc:A");
    expect(Object.keys(b.data)).toContain(KEYS.pool);
    expect(Object.keys(b.data)).not.toContain(KEYS.ghToken);
    expect(rescueBundle()).not.toContain("SECRET_VALUE");
  });
});
