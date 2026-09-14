// poolShare.test.ts — PORT-ONLY tests for pool sharing (7.7.0).
//
// The parsing and normalisation here is a trust boundary: a shared pool comes
// from a stranger's gist or a pasted URL, so these lock down that nothing but
// the seven known fields ever reaches the board, and that a share code is
// recognised in every form a user might paste.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  looksLikeToken,
  normalizeSharedPool,
  parseShareCode,
  shareCodeFor,
  sharePayload,
} from "../src/core/poolShare";

const ID = "8f3a21c9b4e7d6a5f0c1";

describe("parseShareCode — every form a user might paste", () => {
  it("accepts the sbx: code, a bare id, and gist URLs", () => {
    expect(parseShareCode(`sbx:${ID}`)).toBe(ID);
    expect(parseShareCode(`SBX:${ID}`)).toBe(ID);
    expect(parseShareCode(`  sbx:${ID}  `)).toBe(ID);
    expect(parseShareCode(ID)).toBe(ID);
    expect(parseShareCode(`https://gist.github.com/someone/${ID}`)).toBe(ID);
    expect(parseShareCode(`https://gist.github.com/${ID}`)).toBe(ID);
    expect(parseShareCode(`https://gist.githubusercontent.com/someone/${ID}/raw/pool.json`)).toBe(
      ID,
    );
  });

  it("rejects anything that is not a gist id", () => {
    expect(parseShareCode("")).toBeNull();
    expect(parseShareCode("   ")).toBeNull();
    expect(parseShareCode("sbx:")).toBeNull();
    expect(parseShareCode("not-hex-at-all")).toBeNull();
    expect(parseShareCode("https://example.com/pool.json")).toBeNull();
    expect(parseShareCode("deadbeef")).toBeNull(); // too short to be a gist id
  });

  it("round-trips with shareCodeFor", () => {
    expect(parseShareCode(shareCodeFor(ID))).toBe(ID);
  });
});

describe("normalizeSharedPool — untrusted JSON is rebuilt, never spread", () => {
  const entry = (over: any = {}) => ({
    callsign: "AFR123",
    type: "A320",
    origin: "LFPG",
    dest: "LFBO",
    route: "OKABO UT163 LMG",
    cruiseFL: 350,
    squawk: "1000",
    ...over,
  });

  it("accepts a sweatbox-pool bundle and a bare array alike", () => {
    expect(normalizeSharedPool({ kind: "sweatbox-pool", pool: [entry()] })!.pool.length).toBe(1);
    expect(normalizeSharedPool([entry()])!.pool.length).toBe(1);
  });

  it("drops every field the app does not read", () => {
    const hostile = entry({
      id: "../../etc/passwd",
      source: "vatsim",
      __proto__: { polluted: true },
      onclick: "alert(1)",
      nested: { deep: true },
    });
    const out = normalizeSharedPool([hostile])!.pool[0];
    expect(Object.keys(out).sort()).toEqual(
      ["callsign", "cruiseFL", "dest", "origin", "route", "squawk", "type"].sort(),
    );
    expect((out as any).onclick).toBeUndefined();
    expect((out as any).id).toBeUndefined();
  });

  it("coerces and bounds the numeric and pattern fields", () => {
    const out = normalizeSharedPool([
      entry({ cruiseFL: 99999, squawk: "not-a-squawk" }),
      entry({ callsign: "KLM1", cruiseFL: -5, squawk: "7000" }),
      entry({ callsign: "BAW2", cruiseFL: "330" }),
    ])!.pool;
    expect(out[0].cruiseFL).toBe(700); // clamped to the top of the range
    expect(out[0].squawk).toBe("1000"); // non-numeric falls back
    expect(out[1].cruiseFL).toBe(350); // a nonsense level becomes the default
    expect(out[1].squawk).toBe("7000");
    expect(out[2].cruiseFL).toBe(330); // a numeric string is fine
  });

  it("uppercases identifiers and truncates absurd strings", () => {
    const out = normalizeSharedPool([
      entry({ callsign: "afr123", origin: "lfpg", route: "x".repeat(5000) }),
    ])!.pool[0];
    expect(out.callsign).toBe("AFR123");
    expect(out.origin).toBe("LFPG");
    expect(out.route.length).toBe(2000);
  });

  it("skips entries with no callsign, and rejects a pool with nothing left", () => {
    const out = normalizeSharedPool([entry(), entry({ callsign: "" }), null, "nope", 42]);
    expect(out!.pool.length).toBe(1);
    expect(normalizeSharedPool([{ type: "A320" }])).toBeNull();
    expect(normalizeSharedPool([])).toBeNull();
    expect(normalizeSharedPool({})).toBeNull();
    expect(normalizeSharedPool(null)).toBeNull();
    expect(normalizeSharedPool("a string")).toBeNull();
  });

  it("carries the pool's name and AIRAC when present", () => {
    const out = normalizeSharedPool({ pool: [entry()], airac: "2509", name: "LFBB rush" })!;
    expect(out.airac).toBe("2509");
    expect(out.name).toBe("LFBB rush");
    expect(normalizeSharedPool({ pool: [entry()], description: "from a gist" })!.name).toBe(
      "from a gist",
    );
  });
});

describe("sharePayload — publishes the pool and nothing else", () => {
  it("strips local bookkeeping (ids, source, addedAt) from every entry", () => {
    const payload = sharePayload(
      [
        {
          id: "local-uid-1",
          addedAt: 1234567890,
          source: "vatsim",
          callsign: "AFR123",
          type: "A320",
          origin: "LFPG",
          dest: "LFBO",
          route: "OKABO",
          cruiseFL: 350,
          squawk: "1000",
        },
      ],
      "2509",
      "LFBB rush",
    );
    expect(payload.kind).toBe("sweatbox-pool");
    expect(payload.airac).toBe("2509");
    expect(Object.keys(payload.pool[0]).sort()).toEqual(
      ["callsign", "cruiseFL", "dest", "origin", "route", "squawk", "type"].sort(),
    );
    const json = JSON.stringify(payload);
    expect(json).not.toContain("local-uid-1");
    expect(json).not.toContain("addedAt");
  });

  it("round-trips through normalizeSharedPool unchanged", () => {
    const original = [
      {
        callsign: "AFR123",
        type: "A320",
        origin: "LFPG",
        dest: "LFBO",
        route: "OKABO",
        cruiseFL: 350,
        squawk: "1000",
      },
    ];
    const back = normalizeSharedPool(
      JSON.parse(JSON.stringify(sharePayload(original, "2509", "x"))),
    );
    expect(back!.pool).toEqual(original);
  });
});

describe("looksLikeToken — catch an obviously wrong paste before a round trip", () => {
  it("accepts the real prefixes and rejects everything else", () => {
    expect(looksLikeToken("ghp_" + "A".repeat(36))).toBe(true);
    expect(looksLikeToken("github_pat_" + "B".repeat(40))).toBe(true);
    expect(looksLikeToken("  ghp_" + "A".repeat(36) + "  ")).toBe(true);
    expect(looksLikeToken("")).toBe(false);
    expect(looksLikeToken("hunter2")).toBe(false);
    expect(looksLikeToken("ghp_")).toBe(false);
    expect(looksLikeToken("sbx:8f3a21c9b4e7d6a5f0c1")).toBe(false);
  });
});

describe("fetchSharedPool — the network paths", () => {
  let calls: string[];
  beforeEach(() => {
    calls = [];
    vi.stubGlobal("window", { fetch: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads a gist anonymously and normalises its file content", async () => {
    const { fetchSharedPool } = await import("../src/core/poolShare");
    const http = await import("../src/net/http");
    vi.spyOn(http, "httpFetch").mockImplementation(async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          description: "Sweatbox Builder pool — LFBB rush",
          files: {
            "pool.json": {
              content: JSON.stringify({
                pool: [
                  {
                    callsign: "AFR1",
                    type: "A320",
                    origin: "LFPG",
                    dest: "LFBO",
                    route: "OKABO",
                    cruiseFL: 350,
                  },
                ],
              }),
            },
          },
        }),
      } as any;
    });
    const out = await fetchSharedPool(`sbx:${ID}`);
    expect(calls[0]).toBe(`https://api.github.com/gists/${ID}`);
    expect(out.pool[0].callsign).toBe("AFR1");
    expect(out.pool[0].squawk).toBe("1000"); // defaulted, not inherited
    expect(out.name).toBe("Sweatbox Builder pool — LFBB rush");
  });

  it("rejects a non-https link rather than fetching it", async () => {
    const { fetchSharedPool } = await import("../src/core/poolShare");
    await expect(fetchSharedPool("http://insecure.example/pool.json")).rejects.toThrow(
      /share code or an https link/,
    );
    await expect(fetchSharedPool("file:///etc/passwd")).rejects.toThrow(
      /share code or an https link/,
    );
  });
});
