// slots.ts — FLIGHTDECK save-slot model over the EXISTING localStorage keys:
// sb:list (slot names) and sb:sc:<name> (slot payloads) are unchanged, so saves
// from the classic app appear as slots on day one. New keys: sb:slotmeta
// (active slot + per-slot updatedAt), sb:snap:<name> (per-slot snapshot ring,
// cap 10) and sb:deck (deck UI prefs). There is no Save button anywhere: the
// active slot is autosaved by the shell.
import { storage, KEYS } from "./storage";
import { defaultScenario, migrateRules } from "../core/model";
import { normalizeExportSettings } from "../core/exportSettings";

const META_KEY = "sb:slotmeta";
const DECK_KEY = "sb:deck";
const SNAP_CAP = 10;
// A ring is also capped by size: ten snapshots of a 60-aircraft board are
// ~400k characters, and localStorage's whole quota is ~5 million. Rings were
// the usual reason the quota ran out.
const SNAP_MAX_CHARS = 400_000;

export type SlotMeta = { active: string; meta: Record<string, { updatedAt: number }> };

export function getMeta(): SlotMeta {
  return storage.get(META_KEY) || { active: "", meta: {} };
}
function setMeta(m: SlotMeta) {
  storage.set(META_KEY, m);
}

export function listSlots(): string[] {
  return storage.get(KEYS.list) || [];
}

export type SlotStatus = "ok" | "missing" | "corrupt";

/** Can this slot be opened? "missing" = listed but never written (storage
 *  was full at the time); "corrupt" = stored but not a readable scenario. */
function isScenarioShape(v: any): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  // The two lists the shell maps over must be lists when present.
  if (v.rules !== undefined && v.rules !== null && !Array.isArray(v.rules)) return false;
  if (v.aircraft !== undefined && v.aircraft !== null && !Array.isArray(v.aircraft)) return false;
  return true;
}

export function readSlotStatus(name: string): SlotStatus {
  const raw = storage.raw(`sb:sc:${name}`);
  if (raw === null) return "missing";
  try {
    return isScenarioShape(JSON.parse(raw)) ? "ok" : "corrupt";
  } catch {
    return "corrupt";
  }
}

export function readSlot(name: string): any | null {
  const s = storage.get(`sb:sc:${name}`);
  if (!isScenarioShape(s)) return null;
  return {
    ...defaultScenario(),
    ...s,
    rules: migrateRules(s.rules),
    exportSettings: normalizeExportSettings(s.exportSettings),
    name,
  };
}

/**
 * Save a slot. The payload goes first; the name is added to the list only
 * once the payload is actually stored, so a full storage can never leave a
 * listed slot with nothing behind it. Returns whether the payload was saved.
 */
export function writeSlot(name: string, scenario: any): boolean {
  const ok = storage.set(`sb:sc:${name}`, { ...scenario, name });
  if (!ok) return false;
  const list = listSlots();
  if (!list.includes(name) && !storage.set(KEYS.list, [...list, name])) {
    // The payload took the last of the room and the list could not grow: a
    // slot nobody can see is worse than none — roll it back.
    storage.del(`sb:sc:${name}`);
    return false;
  }
  const m = getMeta();
  m.meta[name] = { updatedAt: Date.now() };
  setMeta(m); // best effort: a stale updatedAt only misorders the rail
  return true;
}

export function setActive(name: string) {
  const m = getMeta();
  m.active = name;
  setMeta(m);
}

export function uniqueName(base = "Untitled"): string {
  const list = listSlots();
  if (!list.includes(base)) return base;
  let n = 2;
  while (list.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * Rename a slot. Nothing is removed until the scenario is safely stored under
 * its new name and listed: a refused write (storage full) returns the reason
 * and leaves everything as it was. An unreadable slot is not renamed — its
 * bytes stay exactly where they are for a rescue copy.
 */
export function renameSlot(oldName: string, newName: string): string | null {
  newName = newName.trim();
  if (!newName || newName === oldName) return null;
  if (listSlots().includes(newName)) return "Name already used";
  const status = readSlotStatus(oldName);
  if (status === "corrupt") return "Cannot rename — its saved data is unreadable";
  if (status === "ok") {
    const payload = storage.get(`sb:sc:${oldName}`);
    if (!storage.set(`sb:sc:${newName}`, { ...payload, name: newName }))
      return "Storage is full — rename not saved";
  }
  if (
    !storage.set(
      KEYS.list,
      listSlots().map((n) => (n === oldName ? newName : n)),
    )
  ) {
    storage.del(`sb:sc:${newName}`);
    return "Storage is full — rename not saved";
  }
  // From here the new name is the slot. Snapshots are best effort.
  const snaps = storage.get(`sb:snap:${oldName}`);
  if (snaps) storage.set(`sb:snap:${newName}`, snaps);
  storage.del(`sb:sc:${oldName}`);
  storage.del(`sb:snap:${oldName}`);
  const m = getMeta();
  m.meta[newName] = m.meta[oldName] || { updatedAt: Date.now() };
  delete m.meta[oldName];
  if (m.active === oldName) m.active = newName;
  setMeta(m);
  const le = getLastExport(oldName);
  if (le) {
    const by = { ...(getDeckPrefs().lastExportBySlot || {}) };
    delete by[oldName];
    by[newName] = le;
    setDeckPrefs({ lastExportBySlot: by });
  }
  return null;
}

export function deleteSlot(name: string) {
  storage.set(
    KEYS.list,
    listSlots().filter((n) => n !== name),
  );
  storage.del(`sb:sc:${name}`);
  storage.del(`sb:snap:${name}`);
  const m = getMeta();
  delete m.meta[name];
  if (m.active === name) m.active = "";
  setMeta(m);
  const by = getDeckPrefs().lastExportBySlot;
  if (by && by[name]) {
    const next = { ...by };
    delete next[name];
    setDeckPrefs({ lastExportBySlot: next });
  }
}

// ---------- snapshots (REWIND) ----------
export type Snap = { t: number; label: string; aircraft: any[] };

export function listSnaps(name: string): Snap[] {
  const v = storage.get(`sb:snap:${name}`);
  return Array.isArray(v) ? v : [];
}

export function pushSnap(name: string, label: string, aircraft: any[]) {
  const snaps = listSnaps(name);
  snaps.unshift({ t: Date.now(), label, aircraft: JSON.parse(JSON.stringify(aircraft)) });
  if (snaps.length > SNAP_CAP) snaps.length = SNAP_CAP;
  // Oldest snapshots go first when the ring outgrows its budget — and again
  // if the write itself is refused. The newest always stays; a snapshot is a
  // convenience, the scenario is what matters.
  while (snaps.length > 1 && JSON.stringify(snaps).length > SNAP_MAX_CHARS) snaps.pop();
  while (!storage.set(`sb:snap:${name}`, snaps) && snaps.length > 1) snaps.pop();
}

/** Drop every slot's REWIND ring. Returns the characters freed. */
export function purgeSnapshots(): number {
  let freed = 0;
  for (const k of storage.keys())
    if (k.startsWith("sb:snap:")) {
      freed += (storage.raw(k) || "").length + k.length;
      storage.del(k);
    }
  return freed;
}

// ---------- deck prefs ----------
export function getDeckPrefs(): any {
  return storage.get(DECK_KEY) || {};
}
export function setDeckPrefs(patch: any) {
  storage.set(DECK_KEY, { ...getDeckPrefs(), ...patch });
}

// "↳ path · HH:MM" — the file THIS slot last shipped to. Kept in sb:deck rather
// than on the scenario: the path is a local absolute path and the scenario
// object travels verbatim in .scenario.json bundles.
export type LastExport = { path: string; t: string };
export function getLastExport(name: string): LastExport | null {
  return getDeckPrefs().lastExportBySlot?.[name] || null;
}
export function setLastExport(name: string, le: LastExport) {
  setDeckPrefs({ lastExportBySlot: { ...(getDeckPrefs().lastExportBySlot || {}), [name]: le } });
}

// ---------- first-run migration ----------
// Ensure there is always an active slot. Classic-app saves (sb:list) become
// slots as-is; a live sb:cur that matches no slot becomes one, so nothing
// orphans when FLIGHTDECK starts over existing data.
export function ensureActiveSlot(): { name: string; scenario: any } {
  const m = getMeta();
  let list = listSlots();

  if (m.active && list.includes(m.active)) {
    const sc = readSlot(m.active);
    if (sc) return { name: m.active, scenario: sc };
  }

  const cur = storage.get(KEYS.current);
  if (cur && typeof cur === "object") {
    const name = list.includes(cur.name) ? cur.name : uniqueName(cur.name || "Recovered");
    const scenario = {
      ...defaultScenario(),
      ...cur,
      rules: migrateRules(cur.rules),
      exportSettings: normalizeExportSettings(cur.exportSettings),
      name,
    };
    writeSlot(name, scenario);
    setActive(name);
    return { name, scenario };
  }

  // No usable active slot: take the first slot that can be opened. A slot
  // whose data is unreadable is skipped — opening it empty would let the
  // autosave overwrite the very bytes a rescue copy could still recover. A
  // slot that was never saved is safe to open empty (nothing to lose).
  list = listSlots();
  const first =
    list.find((n) => readSlotStatus(n) === "ok") ??
    list.find((n) => readSlotStatus(n) === "missing");
  if (first !== undefined) {
    const sc = readSlot(first) || { ...defaultScenario(), name: first };
    setActive(first);
    return { name: first, scenario: sc };
  }

  const scenario = defaultScenario();
  const name = uniqueName(scenario.name || "Untitled");
  writeSlot(name, { ...scenario, name });
  setActive(name);
  return { name, scenario: { ...scenario, name } };
}

// Card summary for the rail.
export function slotSummary(name: string, activeScenario?: any) {
  const isActive = activeScenario && activeScenario.name === name;
  const sc = isActive ? activeScenario : readSlot(name);
  const ac = sc?.aircraft || [];
  const arr = ac.filter((a: any) => !a.isDeparture).length;
  return {
    name,
    ac: ac.length,
    arr,
    dep: ac.length - arr,
    rules: (sc?.rules || []).length,
    rating: sc?.rating || null,
    updatedAt: getMeta().meta[name]?.updatedAt || 0,
    // The active slot is live in memory, so it reads fine even if its last
    // save failed; the rail says NO SAVED DATA / UNREADABLE for the others.
    status: (isActive ? "ok" : readSlotStatus(name)) as SlotStatus,
  };
}
