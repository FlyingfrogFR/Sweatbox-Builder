// model.ts — default factories, copied VERBATIM from the rc3 shell.

import { uid } from "./uid";

export function defaultScenario() {
  return {
    // Blank canvas — no hard-tuned airport. ILS lines, controllers and the
    // name are the user's to fill (Setup seeds ILS from loaded runways).
    name: "",
    airportAlt: 0.0,
    ils: [],
    controllers: [],
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
    preEntryNm: 1,
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
    timingMode: "regular", // "regular" = evenly spaced · "random" = same count, random times, >=2 min apart
    startOffset: 0,
    runway: "",
    originPool: "EHAM,EGLL,EDDF,LEMD,LIRF",
    homeIcao: "", // the scenario's home airport (origin of departures / dest of arrivals); legacy rules without the field keep the old hardcoded LFPG
    destPool: "",
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
