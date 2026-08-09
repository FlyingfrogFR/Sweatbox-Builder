// aircraft.ts — shared scenario-aircraft list helpers (UI side, NOT core).
// The by-start ordering below feeds scenario.aircraft, which is the exact
// iteration order of the parity-locked .scn serializer — every merge site
// must sort identically, so the comparator lives in one place.
export const byStart = (a: any, b: any) => (+a.start || 0) - (+b.start || 0);

// In-place, matching the previous call sites (each sorts a freshly built array).
export const sortByStart = (list: any[]) => list.sort(byStart);
