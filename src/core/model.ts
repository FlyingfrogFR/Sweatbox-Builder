// model.ts — default factories, copied VERBATIM from the rc3 shell.

import { uid } from "./uid";

export function defaultScenario() {
  return {
    name: "LFPG QFU Ouest",
    airportAlt: 0.0,
    ils: [
      { name: "26L", lat1: 48.9949188, lon1: 2.6024601, lat2: 48.9929434, lon2: 2.5657057 },
      { name: "27R", lat1: 49.026638, lon1: 2.5617251, lat2: 49.0247256, lon2: 2.5248595 },
      { name: "27PB", lat1: 48.9650377, lon1: 2.4455994, lat2: 48.9636585, lon2: 2.4204486 },
      { name: "25PO", lat1: 48.7277643, lon1: 2.4040114, lat2: 48.7192115, lon2: 2.3577571 },
    ],
    controllers: [
      { callsign: "LFPO_APP", freq: "123.875" },
      { callsign: "LFPG_F_APP", freq: "126.430" },
      { callsign: "LFPG_TWR", freq: "119.250" },
    ],
    aircraft: [],
    rules: [],
    holdings: [],
    groundConfig: null,
  };
}

export function emptyAc(dep = false) {
  return {
    id: uid(),
    callsign: "",
    squawk: dep ? "1200" : "1000",
    type: "",
    origin: "",
    dest: "",
    cruiseAlt: 35000,
    lat: dep ? 49.0186 : 50.0,
    lon: dep ? 2.47 : 4.0,
    alt: dep ? 1200 : 18000,
    gs: dep ? 3012 : 420,
    runway: dep ? "27L" : "27R",
    spawnWaypoint: "",
    preEntryNm: 0,
    fpRoute: "",
    simRoute: "",
    start: "",
    reqAltWpt: "",
    reqAltVal: "",
    isDeparture: dep,
    ruleId: null,
  };
}

export function emptyRule() {
  return {
    id: uid(),
    name: "New Rule",
    mode: "S3",
    isDeparture: false,
    poolSource: false,
    poolDep: "",
    poolArr: "",
    spawnWaypoint: "",
    preEntryNm: 10,
    rwyInUse: "",
    fpRouteTemplate: "",
    fpRouteTemplates: [],
    simRouteTemplate: "",
    rate: 8,
    duration: 30,
    startOffset: 0,
    runway: "",
    originPool: "EHAM,EGLL,EDDF,LEMD,LIRF",
    destPool: "LFPG",
    typePool: "A320,A321,B738,A20N,E190",
    typeCategories: [],
    callsignPattern: "AFR###",
    randomCallsign: true,
    heavy: false,
    seq: 1,
    cruiseAlt: 35000,
    spawnAlt: 18000,
    gsMode: "wtc",
    speedType: "ias",
    assignedSpeed: 280,
    squawk: "1000",
    squawkMode: "fixed",
    squawkOptions: ["1000", "2000"],
    reqAltWpt: "",
    reqAltVal: "",
    schedulingMode: "rate",
    nmSeparation: 10,
    excludeNonRouting: true,
  };
}

export function migrateRules(rules: any[]) {
  return (rules || []).map((r) => ({ ...r, mode: r.mode || "S3" }));
}
