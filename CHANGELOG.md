# Changelog

What changed in each release, written for the people who run the sessions.
The newest version is at the top. Anything not listed here is internal work
that does not change what you see.

The app checks this repository for new versions on launch and shows you the
notes for the release it is offering, so what you read here is what you read
in the update prompt.

## 7.7.1 — 2026-09-14

- **Release notes you can actually read.** Every release now carries proper
  notes, both on the Releases page and in the update prompt, instead of a bare
  link to a list of commits. The history back to 7.0.0 is written up in
  `CHANGELOG.md`.
- This is also the first release that installs itself: if you are on 7.7.0,
  the app should offer it to you on launch rather than sending you to the
  Releases page.

## 7.7.0 — 2026-09-14

- **Update from inside the app.** When a new version is out, launching
  Sweatbox Builder offers it: UPDATE NOW downloads and installs in place,
  SKIP THIS VERSION stays quiet until the release after it, LATER asks again
  next time. No more hunting the Releases page. Your scenarios, navdata and
  pool are untouched by an update.
- **Share flight-plan pools with other mentors.** FPLN POOL has a new SHARE
  section with two ways to do it:
  - **PUBLISH POOL** puts your pool online and gives you a short code like
    `sbx:8f3a21c9` — hand it to a colleague, they paste it into GET, and they
    have your traffic. Publishing once needs a free GitHub token (the app
    walks you through it); importing a code needs nothing at all.
  - **LIBRARY** lists pools published for everyone, one click to load. To add
    yours to the list, see `pools/README.md`.
- Loading a shared pool **adds** to what you already have rather than
  replacing it, so a colleague's link can never wipe traffic you have staged.

**Upgrading to this version:** install it by hand from the Releases page one
last time. Earlier versions have no updater in them, so they cannot fetch it
themselves. From 7.7.1 onward it is automatic.

## 7.6.0 — 2026-09-10

- **The export plate now belongs to the scenario.** Switching save slots used
  to leave the filename tokens and the mentor pseudo-pilot showing whatever
  you last typed in some other slot — an LFBB session offering to export as
  `LFPG_3.3_WEST26.txt`, with a pseudo-pilot marked "no longer in Setup".
  Each slot now carries its own.
- A slot named to the convention (`LFBB_1_1_NORTH32`) fills the whole plate in
  by itself. Otherwise the ICAO is taken from the slot name or your Setup
  controllers, and the runway config is left blank for you to set — it is
  never borrowed from another slot.
- Fixed: with the aircraft editor open, pressing Ctrl+N (new slot) and then
  SAVE used to drop that aircraft into the new slot.
- The "last exported to…" tab now follows the slot it belongs to.

## 7.5.0 — 2026-08-25

- **Fixed: local departures appearing as transit traffic.** An aircraft
  leaving an airport inside your session's FIR has no entry point by
  definition, but auto-boundary rules were finding its *exit* and spawning it
  in the middle of the sector at cruise — a Toulouse departure 73 NM inside
  LFBB at FL280. Those flights are now excluded, and the rule's funnel line
  tells you how many and from which airports.

## 7.4.0 — 2026-08-25

- **Fixed: aircraft spawning exactly on the FIR boundary.** Boundary-anchored
  spawns ignored your pre-entry distance and put the aircraft on the line
  itself. They now start the distance you asked for upstream, tracking down
  the leg they came in on.
- **Fixed: "spawn one fix before the boundary" never engaging.** It measured
  the wrong distance — from the first fix *inside* rather than to the crossing
  — so the limit was always exceeded and it silently fell back.
- Each generated aircraft now records where it was placed and why
  (`LFBB boundary · ARKIP→ARNAV`), visible in the aircraft editor and on the
  traffic board, so an odd spawn explains itself.

## 7.3.0 — 2026-08-25

- **Fixed: the same flight plan generated twice by two rules.** Rules now
  claim plans from the pool in list order — the rules at the top get first
  pick, and a plan one rule uses is invisible to the rest.
- **Fixed: aircraft pointing back down their own route.** Filed routes with
  speed and level suffixes (`ETAMO/N0453F370`) were not recognised, which left
  the aircraft aiming at the wrong end of its track.
- Filed routes keep their suffixes in the flight plan, while the simulator
  route is written with plain fixes, which is what EuroScope expects.

## 7.2.0 — 2026-08-25

- **Arrivals now join the STAR.** With CONTINUE ON STAR enabled, a pool
  arrival's filed route is extended with the published arrival for the runway
  in use, instead of stopping at the last filed fix.

## 7.1.0 — 2026-08-25

- **Pair whole countries when importing from VATSIM.** As well as two
  airports, you can now fetch everything between a country and another country
  or a single airport — shown as `LE** — Spain`.

## 7.0.2 — 2026-08-25

- **Fixed: entry points that are only correct at some levels.** FIR boundaries
  are level-dependent; a fix published for FL195–265 was being used for an
  FL360 flight, spawning it well inside the sector. Levels are now respected,
  with a note when a flight matches nothing at its level.

## 7.0.1 — 2026-08-24

- **Boundaries are traced from the sector file itself.** Instead of relying on
  published crossing points, the app reads the FIR's geometry from your ESE
  and finds where each route actually crosses the edge — so it works with any
  AIRAC and any FIR.
- **Fixed: no crossing points found in a real ESE.** Three separate parsing
  faults meant COPX lines from actual EuroScope files were skipped entirely.

## 7.0.0 — 2026-08-24

- **FLIGHTDECK is now the app.** The rebuilt interface — save slots down the
  left, the traffic board in the middle, live scenario file on the right, and
  three numbered steps along the bottom — replaces the old panel layout.
  Existing saved scenarios appear as slots on first launch; nothing to import.
- Signed and notarized macOS builds, so the app opens without Gatekeeper
  warnings, alongside the Windows installer and portable build.
