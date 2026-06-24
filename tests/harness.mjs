// harness.mjs
//
// A single driver used by BOTH the oracle (original rc3 code in a VM) and the
// ported modules. Given an `api` that exposes the generation surface, it runs a
// fixture case through the exact same steps the app's "Apply All" + Export flow
// performs, and returns the resulting .scn text.
//
// api shape:
//   { setStars(stars), generateFromRule(rule, waypoints, used, pool),
//     generateSweatbox(scenario, waypoints, opts), buildGroundAircraft?(cfg, gates, pool, rampAgent) }
//
// Because both sides call the same Math.random sequence (the port is a verbatim
// port), seeding the PRNG identically makes the .scn output byte-for-byte equal.

export function driveCase(api, c) {
  api.setStars(c.stars || []);

  const manual = c.manualAircraft || [];
  const used = new Set(manual.map((a) => a.callsign).filter(Boolean));
  let aircraft = [...manual];

  if (c.ground) {
    const r = api.buildGroundAircraft(
      c.ground.cfg,
      c.ground.gates || [],
      c.pool || [],
      c.ground.rampAgent || {},
    );
    if (r.errors && r.errors.length) throw new Error("ground: " + r.errors.join("; "));
    aircraft = aircraft.concat(r.aircraft);
  }

  for (const rule of c.rules || []) {
    const { aircraft: gen, error } = api.generateFromRule(
      rule,
      c.waypoints || [],
      used,
      c.pool || [],
    );
    if (error) throw new Error(`${rule.name || rule.id}: ${error}`);
    aircraft = aircraft.concat(gen);
  }

  aircraft = aircraft.slice().sort((a, b) => (+a.start || 0) - (+b.start || 0));
  const scenario = { ...c.scenario, aircraft };
  return api.generateSweatbox(scenario, c.waypoints || [], {
    initPseudoPilot: c.initPseudoPilot || "",
  });
}
