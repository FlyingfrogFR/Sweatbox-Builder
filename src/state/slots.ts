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

export function readSlot(name: string): any | null {
  const s = storage.get(`sb:sc:${name}`);
  if (!s) return null;
  return {
    ...defaultScenario(),
    ...s,
    rules: migrateRules(s.rules),
    exportSettings: normalizeExportSettings(s.exportSettings),
    name,
  };
}

export function writeSlot(name: string, scenario: any) {
  const list = listSlots();
  if (!list.includes(name)) storage.set(KEYS.list, [...list, name]);
  storage.set(`sb:sc:${name}`, { ...scenario, name });
  const m = getMeta();
  m.meta[name] = { updatedAt: Date.now() };
  setMeta(m);
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

export function renameSlot(oldName: string, newName: string): string | null {
  newName = newName.trim();
  if (!newName || newName === oldName) return null;
  if (listSlots().includes(newName)) return "Name already used";
  const payload = storage.get(`sb:sc:${oldName}`);
  const snaps = storage.get(`sb:snap:${oldName}`);
  storage.set(
    KEYS.list,
    listSlots().map((n) => (n === oldName ? newName : n)),
  );
  if (payload) storage.set(`sb:sc:${newName}`, { ...payload, name: newName });
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
  return storage.get(`sb:snap:${name}`) || [];
}

export function pushSnap(name: string, label: string, aircraft: any[]) {
  const snaps = listSnaps(name);
  snaps.unshift({ t: Date.now(), label, aircraft: JSON.parse(JSON.stringify(aircraft)) });
  if (snaps.length > SNAP_CAP) snaps.length = SNAP_CAP;
  storage.set(`sb:snap:${name}`, snaps);
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

  list = listSlots();
  if (list.length) {
    const name = list[0];
    const sc = readSlot(name) || { ...defaultScenario(), name };
    setActive(name);
    return { name, scenario: sc };
  }

  const scenario = defaultScenario();
  const name = uniqueName(scenario.name || "Untitled");
  writeSlot(name, { ...scenario, name });
  setActive(name);
  return { name, scenario: { ...scenario, name } };
}

// Card summary for the rail.
export function slotSummary(name: string, activeScenario?: any) {
  const sc = activeScenario && activeScenario.name === name ? activeScenario : readSlot(name);
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
  };
}
