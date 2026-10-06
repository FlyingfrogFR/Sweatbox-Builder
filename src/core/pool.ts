// pool.ts — aircraft-pool helpers + source labels, copied VERBATIM from the rc3
// shell. uid()/Date.now() do not affect .scn output.

import { uid } from "./uid";
import { emptyAc } from "./model";

export function addToPool(pool: any[], items: any[], source: string) {
  const map = new Map(pool.map((p) => [p.callsign || p.id, p]));
  for (const item of items) {
    const key = item.callsign || uid();
    const existing: any = map.get(key);
    map.set(key, {
      id: existing?.id || uid(),
      addedAt: existing?.addedAt || Date.now(),
      ...(existing || {}),
      ...item,
      source,
    });
  }
  return Array.from(map.values());
}

export function poolToAc(e: any, dep = false) {
  return {
    ...emptyAc(dep),
    callsign: e.callsign || "",
    type: e.type || "",
    origin: e.origin || "",
    dest: e.dest || "",
    cruiseAlt: (e.cruiseFL || 350) * 100,
    fpRoute: e.route || "",
    simRoute: e.route || "",
    squawk: e.squawk || "1000",
  };
}

export const SRC_LABELS: Record<string, { label: string; color: string }> = {
  vatsim: { label: "VATSIM", color: "text-emerald-400 bg-emerald-900/30" },
  simbrief: { label: "SimBrief", color: "text-blue-400 bg-blue-900/30" },
  manual: { label: "Manual", color: "text-slate-400 bg-slate-800" },
};

// ---------------------------------------------------------------- 7.9.0 ---
// Editing and copying entries IN the pool. Nothing below touches the
// generators: a pool entry is a template, and these only decide what the
// template says before a rule or ADD TO BOARD reads it.

/** The most copies one request may make of an entry — the user's cap. */
export const MAX_COPIES = 25;
/** Most new entries one COPY may add. The pool persists through localStorage,
 *  whose quota failure is silent — the pool would look fine until relaunch. */
export const MAX_COPY_BATCH = 500;
/** Would copying `count` entries `n` times each blow the per-go ceiling? */
export const copyBatchTooLarge = (count: number, n: number) => count * n > MAX_COPY_BATCH;

export type PoolFieldErrors = Partial<
  Record<"callsign" | "type" | "origin" | "dest" | "cruiseFL" | "squawk" | "route", string>
>;

const up = (v: any) => (v == null ? "" : String(v)).toUpperCase();
/** A callsign, type or ICAO as typed: uppercased, whitespace dropped. */
const code = (v: any) => up(v).replace(/\s+/g, "");
// Anything else in a code is refused, not silently dropped: a stray "-" or
// ":" is a typo the mentor should see, and ":" is the .scn field separator.
// Over-long codes are refused the same way rather than cut.
const BAD_CODE = /[^A-Z0-9]/;
const codeError = (v: string, max: number) =>
  BAD_CODE.test(v) ? "Letters and digits only" : v.length > max ? `Too long (max ${max})` : undefined;

/** Callsigns already in the pool (uppercased), optionally leaving one entry out. */
export function poolCallsigns(pool: any[], exceptId?: string): Set<string> {
  const s = new Set<string>();
  for (const p of pool) {
    if (exceptId !== undefined && p?.id === exceptId) continue;
    const cs = up(p?.callsign);
    if (cs) s.add(cs);
  }
  return s;
}

/**
 * Normalise an edited entry and say what is wrong with it. `value` is what
 * SAVE would store; `errors` is keyed by field so the editor can flag the
 * exact box. A callsign another entry already has is an error because
 * addToPool merges BY callsign — two entries sharing one would collapse into
 * each other the next time anything is added to the pool.
 */
export function validatePoolEntry(
  draft: any,
  pool: any[],
  selfId?: string,
): { value: any; errors: PoolFieldErrors } {
  const errors: PoolFieldErrors = {};
  const callsign = code(draft?.callsign);
  const type = code(draft?.type);
  const origin = code(draft?.origin);
  const dest = code(draft?.dest);
  const route = up(draft?.route).replace(/\s+/g, " ").trim();
  for (const [k, v, max] of [
    ["callsign", callsign, 12],
    ["type", type, 8],
    ["origin", origin, 4],
    ["dest", dest, 4],
  ] as const) {
    const e = codeError(v, max);
    if (e) errors[k] = e;
  }
  // Routes carry "/" (ETAMO/N0453F370) but never ":" — that splits .scn lines.
  if (/[:\u0000-\u001f]/.test(route)) errors.route = 'No ":" in a route';
  else if (route.length > 2000) errors.route = "Too long (max 2000)";

  // Plain digits only: Number() would take "0x10" as 16 and "1e2" as 100.
  const flRaw = String(draft?.cruiseFL ?? "").trim();
  let cruiseFL = 0;
  if (flRaw) {
    if (!/^\d{1,3}$/.test(flRaw) || +flRaw > 700) errors.cruiseFL = "Flight level 0–700";
    else cruiseFL = +flRaw;
  }

  const squawk = String(draft?.squawk ?? "").trim();
  if (squawk && !/^[0-7]{4}$/.test(squawk)) errors.squawk = "Four octal digits (0–7)";

  if (!errors.callsign && callsign && poolCallsigns(pool, selfId).has(callsign))
    errors.callsign = `${callsign} is already in the pool`;
  if (!errors.origin && origin && origin.length !== 4) errors.origin = "Four-letter ICAO";
  if (!errors.dest && dest && dest.length !== 4) errors.dest = "Four-letter ICAO";

  return { value: { callsign, type, origin, dest, route, cruiseFL, squawk }, errors };
}

/**
 * Replace the editable fields of one entry; id, addedAt, source and any field
 * the editor does not own stay, and so does any editable field `value` leaves
 * out. Validates against the pool itself, so a caller can never store what
 * validatePoolEntry refuses: an unknown id or a bad value hands back the same
 * array, untouched — callers test for identity to learn whether it saved.
 */
export function updatePoolEntry(pool: any[], id: string, value: any): any[] {
  const i = pool.findIndex((p) => p?.id === id);
  if (i < 0) return pool;
  const { value: v, errors } = validatePoolEntry({ ...pool[i], ...value }, pool, id);
  if (Object.keys(errors).length) return pool;
  const out = pool.slice();
  out[i] = { ...pool[i], ...v };
  return out;
}

/**
 * The callsigns a copy family uses: the base with its LAST character swapped
 * for A, B, C … Z, skipping the base itself and anything already taken.
 * AFR1234 → AFR123A, AFR123B …   BAW12A → BAW12B, BAW12C … (A is the original)
 * At most MAX_COPIES, and never more than the free letters.
 */
export function copyCallsigns(base: any, taken: Set<string>, n: number): string[] {
  const cs = up(base).trim();
  // One character leaves nothing to keep — "A" → "B" is a new callsign, not a copy.
  if (cs.length < 2) return [];
  const want = Math.min(MAX_COPIES, Math.max(0, Math.floor(+n || 0)));
  const stem = cs.slice(0, -1);
  const out: string[] = [];
  for (let i = 0; i < 26 && out.length < want; i++) {
    const cand = stem + String.fromCharCode(65 + i);
    if (cand === cs || taken.has(cand)) continue;
    out.push(cand);
  }
  return out;
}

/**
 * Copy the given entries n times each. A copy is the WHOLE entry — route,
 * squawk, type, source, any field an importer added — under a fresh id and
 * timestamp, with only the callsign changed (copyCallsigns). Copies sit
 * right after their original so a family reads as one block. Letters are
 * claimed as they go, so two originals sharing a stem never collide.
 * `skipped` lists originals that got no copy (blank callsign, or no letter
 * left).
 */
export interface CopyFamily {
  fromId: string;
  from: string;
  to: string[]; // callsigns minted, in order
  ids: string[]; // the copies' ids, same order
  asked: number; // what was requested — shorter `to` means the letters ran out
}

export function duplicatePoolEntries(
  pool: any[],
  ids: Iterable<string>,
  n: number,
): { pool: any[]; made: CopyFamily[]; skipped: string[] } {
  const want = new Set(ids);
  const asked = Math.min(MAX_COPIES, Math.max(0, Math.floor(+n || 0)));
  const made: CopyFamily[] = [];
  const skipped: string[] = [];
  // Nothing asked is not "no letter left" — report nothing.
  if (!asked || !want.size) return { pool, made, skipped };
  const taken = poolCallsigns(pool);
  const out: any[] = [];
  for (const p of pool) {
    out.push(p);
    if (!want.has(p?.id)) continue;
    const names = copyCallsigns(p.callsign, taken, asked);
    if (!names.length) {
      skipped.push(p.callsign || "(no callsign)");
      continue;
    }
    const fam: CopyFamily = { fromId: p.id, from: p.callsign, to: names, ids: [], asked };
    for (const cs of names) {
      taken.add(cs);
      const copy = { ...p, id: uid(), addedAt: Date.now(), callsign: cs };
      out.push(copy);
      fam.ids.push(copy.id);
    }
    made.push(fam);
  }
  return { pool: out, made, skipped };
}
