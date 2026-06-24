// tables.ts
//
// Region/callsign/WTC reference tables — copied VERBATIM from the rc3 shell.
// Do not reorder or edit values: callsign and squawk selection index into these
// with the seeded RNG, so any change shifts generated output.

export const GS_BY_WTC: Record<string, number> = { L: 200, M: 280, H: 300, J: 300 };

export const ICAO_CS: Record<string, string[]> = {
  eu_legacy: [
    "AFR", "BAW", "DLH", "KLM", "IBE", "SWR", "AUA", "THY", "FIN", "SAS", "ITY", "TAP", "BEL",
    "AEE", "LOT", "CSA", "AFL", "VIR",
  ],
  eu_lcc: ["EZY", "RYR", "VLG", "WZZ", "NAX", "TRA", "TVF", "EJU", "PGT"],
  middle_east: ["UAE", "ETD", "QTR", "SVA", "KAC", "GFA", "OMA", "RJA", "MEA", "IRA"],
  north_am: ["AAL", "UAL", "DAL", "SWA", "ACA", "JBU", "ASA", "NKS", "WJA", "UPS", "FDX"],
  east_asia: ["JAL", "ANA", "KAL", "AAR", "CCA", "CES", "CSN", "CAL", "EVA", "CPA", "HVN"],
  se_asia: ["SIA", "THA", "GIA", "MAS", "AXM", "PAL", "VJC", "CEB"],
  oceania: ["QFA", "VOZ", "ANZ", "JST", "FJI"],
  south_am: ["LAN", "GLO", "AVA", "ARG", "AMX", "AZU"],
  africa: ["ETH", "SAA", "RAM", "KQA", "AMC"],
};

export const REGION_PFX: Record<string, string[]> = {
  E: ["eu_legacy", "eu_lcc"],
  L: ["eu_legacy", "eu_lcc"],
  B: ["eu_legacy"],
  U: ["eu_legacy", "eu_lcc"],
  K: ["north_am"],
  C: ["north_am"],
  M: ["north_am", "south_am"],
  S: ["south_am"],
  T: ["north_am", "south_am"],
  O: ["middle_east"],
  H: ["middle_east", "africa"],
  V: ["se_asia", "east_asia"],
  W: ["se_asia"],
  Z: ["east_asia"],
  R: ["east_asia"],
  Y: ["oceania"],
  N: ["oceania"],
  F: ["africa"],
  G: ["africa", "eu_legacy"],
  D: ["africa"],
};

export const LH_CS: string[] = [
  "UAE", "UAE", "UAE", "ETD", "ETD", "QTR", "QTR", "SVA", "KAC", "GFA", "OMA", "AFR", "BAW", "DLH",
  "KLM", "VIR", "IBE", "SWR", "AUA", "THY", "TAP", "AFL", "ITY", "FIN", "LOT", "AAL", "UAL", "DAL",
  "ACA", "JAL", "ANA", "KAL", "AAR", "CCA", "CES", "CSN", "CAL", "EVA", "CPA", "HVN", "SIA", "THA",
  "GIA", "MAS", "PAL", "QFA", "ANZ", "FJI", "ETH", "SAA", "RAM", "LAN",
];

export const TYPE_CATS: Record<string, { label: string; desc: string; color: string; types: string[] }> = {
  L: {
    label: "Light",
    desc: "MTOW < 7 000 kg",
    color: "text-emerald-300 bg-emerald-900/40 border-emerald-700",
    types: ["C172", "C182", "C208", "PC12", "TBM9", "TBM7", "SR22", "SR20", "BE20", "DA42", "C525", "C510", "PA28", "PA34"],
  },
  M: {
    label: "Medium",
    desc: "7 000 – 136 000 kg",
    color: "text-sky-300 bg-sky-900/40 border-sky-700",
    types: ["A320", "A321", "A319", "A318", "B737", "B738", "B739", "B736", "A20N", "A21N", "B38M", "B39M", "E190", "E195", "E175", "E170", "CRJ9", "CRJ7", "AT76", "AT75", "DH8D", "DH8C", "F100", "F70", "E145"],
  },
  H: {
    label: "Heavy",
    desc: "> 136 000 kg",
    color: "text-amber-300 bg-amber-900/40 border-amber-700",
    types: ["A332", "A333", "A343", "A345", "A346", "A359", "A35K", "B762", "B763", "B764", "B772", "B773", "B77W", "B77L", "B779", "B788", "B789", "B78X", "B741", "B742", "B743", "B744", "B74S", "A306", "MD11"],
  },
  J: {
    label: "Super",
    desc: "A380 / B748 only",
    color: "text-rose-300 bg-rose-900/40 border-rose-700",
    types: ["A388", "B748"],
  },
};

export const HJ_TYPES = new Set<string>([...TYPE_CATS.H.types, ...TYPE_CATS.J.types]);

export const GATE_DENYLIST: RegExp[] = [
  /^TWR$/i, /^TOWER$/i, /^HANGARS?$/i, /^TERMINAL$/i,
  /^FRET$/i, /^CARGO$/i, /^FUEL$/i, /^DEICE(ING)?$/i,
  /^MAINT(ENANCE)?$/i, /^FIRE$/i, /^CIE$/i, /^ACB$/i,
];
