// icaoRegions.ts — ICAO location-indicator prefixes, for filtering flight plans
// by country rather than by a single airport ("LE** — Spain"). Prefixes are 1–2
// letters; the label pads with '*' to four characters the way controllers write
// them. Europe is covered thoroughly since that is where EuroScope sweatboxes
// live; the rest of the world carries the busy ones.
export type IcaoRegion = { prefix: string; name: string };

export const ICAO_REGIONS: IcaoRegion[] = [
  // ---- Europe ----
  { prefix: "BI", name: "Iceland" },
  { prefix: "BG", name: "Greenland" },
  { prefix: "EB", name: "Belgium" },
  { prefix: "ED", name: "Germany" },
  { prefix: "EE", name: "Estonia" },
  { prefix: "EF", name: "Finland" },
  { prefix: "EG", name: "United Kingdom" },
  { prefix: "EH", name: "Netherlands" },
  { prefix: "EI", name: "Ireland" },
  { prefix: "EK", name: "Denmark" },
  { prefix: "EL", name: "Luxembourg" },
  { prefix: "EN", name: "Norway" },
  { prefix: "EP", name: "Poland" },
  { prefix: "ES", name: "Sweden" },
  { prefix: "ET", name: "Germany (military)" },
  { prefix: "EV", name: "Latvia" },
  { prefix: "EY", name: "Lithuania" },
  { prefix: "GC", name: "Spain — Canary Islands" },
  { prefix: "GE", name: "Spain — Ceuta & Melilla" },
  { prefix: "LA", name: "Albania" },
  { prefix: "LB", name: "Bulgaria" },
  { prefix: "LC", name: "Cyprus" },
  { prefix: "LD", name: "Croatia" },
  { prefix: "LE", name: "Spain" },
  { prefix: "LF", name: "France" },
  { prefix: "LG", name: "Greece" },
  { prefix: "LH", name: "Hungary" },
  { prefix: "LI", name: "Italy" },
  { prefix: "LJ", name: "Slovenia" },
  { prefix: "LK", name: "Czechia" },
  { prefix: "LM", name: "Malta" },
  { prefix: "LN", name: "Monaco" },
  { prefix: "LO", name: "Austria" },
  { prefix: "LP", name: "Portugal" },
  { prefix: "LQ", name: "Bosnia & Herzegovina" },
  { prefix: "LR", name: "Romania" },
  { prefix: "LS", name: "Switzerland" },
  { prefix: "LT", name: "Türkiye" },
  { prefix: "LU", name: "Moldova" },
  { prefix: "LW", name: "North Macedonia" },
  { prefix: "LX", name: "Gibraltar" },
  { prefix: "LY", name: "Serbia & Montenegro" },
  { prefix: "LZ", name: "Slovakia" },
  { prefix: "UK", name: "Ukraine" },
  { prefix: "UM", name: "Belarus" },
  { prefix: "UU", name: "Russia — west" },
  { prefix: "UL", name: "Russia — north-west" },
  // ---- Middle East & Africa ----
  { prefix: "DA", name: "Algeria" },
  { prefix: "DN", name: "Nigeria" },
  { prefix: "DT", name: "Tunisia" },
  { prefix: "FA", name: "South Africa" },
  { prefix: "GM", name: "Morocco" },
  { prefix: "HE", name: "Egypt" },
  { prefix: "HK", name: "Kenya" },
  { prefix: "LL", name: "Israel" },
  { prefix: "OB", name: "Bahrain" },
  { prefix: "OE", name: "Saudi Arabia" },
  { prefix: "OJ", name: "Jordan" },
  { prefix: "OK", name: "Kuwait" },
  { prefix: "OL", name: "Lebanon" },
  { prefix: "OM", name: "United Arab Emirates" },
  { prefix: "OO", name: "Oman" },
  { prefix: "OT", name: "Qatar" },
  // ---- Asia & Oceania ----
  { prefix: "NZ", name: "New Zealand" },
  { prefix: "RJ", name: "Japan" },
  { prefix: "RK", name: "South Korea" },
  { prefix: "VH", name: "Hong Kong" },
  { prefix: "VT", name: "Thailand" },
  { prefix: "VV", name: "Vietnam" },
  { prefix: "VI", name: "India — north" },
  { prefix: "VO", name: "India — south" },
  { prefix: "WI", name: "Indonesia" },
  { prefix: "WM", name: "Malaysia" },
  { prefix: "WS", name: "Singapore" },
  { prefix: "Y", name: "Australia" },
  { prefix: "Z", name: "China" },
  // ---- Americas ----
  { prefix: "C", name: "Canada" },
  { prefix: "K", name: "United States" },
  { prefix: "MM", name: "Mexico" },
  { prefix: "MD", name: "Dominican Republic" },
  { prefix: "SA", name: "Argentina" },
  { prefix: "SB", name: "Brazil" },
  { prefix: "SC", name: "Chile" },
  { prefix: "SK", name: "Colombia" },
  { prefix: "TJ", name: "Puerto Rico" },
];

/** "LE" -> "LE** — Spain"; unknown prefixes still render as a wildcard. */
export function regionLabel(prefix: string) {
  const p = (prefix || "").toUpperCase();
  const stars = "*".repeat(Math.max(0, 4 - p.length));
  const hit = ICAO_REGIONS.find((r) => r.prefix === p);
  return hit ? `${p}${stars} — ${hit.name}` : `${p}${stars}`;
}

/** The wildcard form a picker writes into an endpoint field: "LE" -> "LE**". */
export const regionValue = (prefix: string) =>
  (prefix || "").toUpperCase() + "*".repeat(Math.max(0, 4 - (prefix || "").length));

/**
 * Does an airport satisfy an endpoint filter?
 *   ""      / "****"  → anywhere
 *   "LFPG"           → that airport
 *   "LE**" / "LE"    → any airport in that country
 */
export function matchesEndpoint(apt: string, spec: string) {
  const a = (apt || "").toUpperCase();
  const s = (spec || "").toUpperCase().replace(/\*+$/, "").trim();
  if (!s) return true;
  return s.length >= 4 ? a === s : a.startsWith(s);
}

/** Human summary of a pairing, for status lines and error messages. */
export const endpointLabel = (spec: string) => {
  const s = (spec || "").toUpperCase().replace(/\*+$/, "").trim();
  if (!s) return "anywhere";
  return s.length >= 4 ? s : regionLabel(s);
};
