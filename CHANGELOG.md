# Changelog

What changed in each release, written for the people who run the sessions.
The newest version is at the top. Anything not listed here is internal work
that does not change what you see.

The app checks this repository for new versions on launch and shows you the
notes for the release it is offering, so what you read here is what you read
in the update prompt.

## 7.11.0 — 2026-10-16

- **Departures carry on after the SID.** A pool departure rule with a shared
  SIM ROUTE TEMPLATE used to end every aircraft's sim route at the template's
  last fix, so in EuroScope they stopped following a route one or two
  waypoints out. A new JOIN FILED ROUTE latch (DEPARTURE ROUTING, next to
  ROUTE MUST CONTAIN) makes each aircraft fly the template up to its SID exit
  — the first fix of its plan that ROUTE MUST CONTAIN names, or failing that
  the last template fix its plan shares — then its own filed route from
  there. `DCT`, the destination and fixes not in your navdata are left out of
  the tail, and FP RTE is untouched. A plan with no join point keeps the
  template only and the rule's note says how many. Rulesets that already
  carry `joinFiledRoute: true` start working as written; everything else
  generates exactly as before.
- **Arrivals spawned on an IAF now sit on the STAR track.** The pre-entry
  offset reads the rule's STAR template as a last resort for the inbound
  bearing. A real flight plan ends at the STAR entry and the sim route starts
  at the spawn fix, so an aircraft placed on an IAF used to be backed off
  along the reverse of the NEXT leg — off the STAR, as seen at OKIPA. The
  editor's offset preview shows the same position the file gets, and the
  rule's never-on-fix check reads the same routes, so a few aircraft it used
  to skip for lack of an inbound leg are now kept. Scenarios whose aircraft
  already had a fix before the spawn point are unchanged, and the parity
  fixtures are byte-identical.

## 7.10.0 — 2026-10-12

- **Strip the DCTs.** Real filed routes are cluttered with `DCT` tokens you
  may not want in a sweatbox file. A STRIP DCT key, with a count of what it
  will change, now appears wherever there is something to strip:
  - **Aircraft editor** — beside FP ROUTE and beside SIM ROUTE (the count is
    the tokens in that field). Press, check the result, SAVE.
  - **Traffic board** — with the CLEAR keys, counting the airborne aircraft
    still carrying DCT; one press cleans every one of them. A snapshot is
    taken first, so REWIND brings the DCTs back. Ground traffic keeps its
    routes: its `DCT <dest>` placeholders are the ground generator's own.
  - **FPLN POOL** — in the row editor beside ROUTE, and in the footer for
    the selected rows you can see. The footer key is hold-to-confirm,
    because the pool has no REWIND.
  - **Rule editor** — in the ROUTE TEMPLATES header, covering the FP
    template, the routes picked from the pool and the sim template, so
    RUN RULES stops bringing the DCTs back.
- Only the `DCT` tokens go; fixes, airways, speed and level suffixes stay
  exactly as filed, and a route with no DCT is left untouched. The aircraft
  then behaves exactly as if the route had been filed without them. Nothing
  is removed unless you press the key — existing scenarios export exactly as
  before.

## 7.9.0 — 2026-10-06

- **Edit a flight plan without leaving the pool.** Every row in FPLN POOL →
  POOL now has a pencil. Press it and the row opens in place: callsign,
  aircraft type, departure, arrival, flight level, squawk and the full route,
  each in its own box. Enter saves, Escape cancels. A callsign that another
  entry already uses is refused on the spot, with the reason shown — two
  entries sharing one would silently merge the next time anything was added.
- **Copy a plan into a whole family.** The copy button next to the pencil
  makes a copy of the entry under the next free callsign: the last character
  is swapped for a letter, A to Z — `AFR1234` becomes `AFR123A`, then
  `AFR123B`, and so on. Select several entries and the footer offers
  COPY ×N for up to 25 copies of each in one go. A copy is the entire entry
  — route, squawk, type, level, where it came from — and a pool rule spawns
  one aircraft per entry, so ten spaced inbounds on a route you fetched once
  are a few clicks away. Copies sit right under their original, and copies of
  a selected entry are selected too, ready for ADD TO BOARD.
- Letters already taken in the pool are skipped, so copying twice never makes
  a duplicate, two originals that differ only in their last digit never
  collide, and the family stops when the alphabet runs out. The footer only
  copies the selected rows you can see, and if the callsign filter would hide
  the fresh copies it is cleared and the message says so.
- The row actions (edit · copy · remove) appear when you hover a row, as they
  do on the traffic board.

## 7.8.2 — 2026-09-20

- **No more hard-coded LFPG.** A rule with no home airport of its own used to
  be given Paris — an old default from the app's LFPG origins. It now takes
  **this scenario's airport**: the ICAO on the export plate (pinned, or read
  from the slot name / your Setup controllers). Importing an older ruleset
  stamps that airport onto each rule, visible and editable in HOME ICAO; a
  rule left without one shows "inherits LFBB from the scenario" in the editor.
- If the scenario has no airport yet and a rule needs one, RUN RULES says so —
  "No home airport: set HOME ICAO on the rule, or give the scenario one" —
  instead of quietly generating traffic for an airport nobody chose.
- Rules with an explicit home, or an explicit blank (overflight), are
  untouched. Pool-sourced rules never needed one and are unaffected.

## 7.8.1 — 2026-09-20

Housekeeping release — nothing you do changes, two things get quicker.

- **The scenario rail no longer slows down as you save more sessions.** It
  used to re-read every saved slot from disk on every keystroke anywhere in
  the app; it now only re-reads a slot when that slot actually changes.
- **Slightly smaller download.** The old tabbed interface from before
  FLIGHTDECK was still being shipped inside the app even though nothing could
  reach it any more. It is gone from the build (and kept on the `classic`
  branch of the repository for reference).
- Under the hood: a lookup table replaces a per-aircraft scan when writing the
  `.scn`, and a duplicate autosave copy that only the old interface read is no
  longer written. The generated file is byte-for-byte identical — the parity
  suite against the original prototype still passes.

## 7.8.0 — 2026-09-15

- **Name your export files whatever you like.** The filename plate now has a
  CONVENTION / CUSTOM switch. CONVENTION is what you had — ICAO, version,
  config, number. CUSTOM is one field: type the name and that is the file, so a
  session called "LFBB north — session 3" no longer has to be squeezed into
  four boxes. The extension is still added for you, and characters Windows
  rejects are dropped, so a custom name can never produce a file EuroScope
  won't read.
- The choice belongs to the save slot, like the rest of the plate: one scenario
  on a typed name and the next on the convention, and neither borrows from the
  other.
- **SAVE RULESET asks where to put it.** It used to drop a file straight into
  Downloads named after the scenario, with no dialog — which is how you lose
  one. It now opens the same Save-As dialog as EXPORT and uses the same name
  you chose on the plate, ending in `_RULESET.json`.

## 7.7.1 — 2026-09-14

- **Release notes you can actually read.** Every release now carries proper
  notes, both on the Releases page and in the update prompt, instead of a bare
  link to a list of commits. The history back to 7.0.0 is written up in
  `CHANGELOG.md`.
- **Clearer sharing.** The third block in FPLN POOL → SHARE was called PUBLISH,
  which read as "publish to the library" — it does not. It is now **SHARE THIS
  POOL**, it makes a private share code, and it says in as many words that a
  code is not a library entry and that getting into the library means opening
  a pull request.
- **Your share codes are listed.** Codes you have made are kept in a list with
  a COPY button each, instead of only ever showing the most recent one, so a
  code from last week is still findable. Codes saved by 7.7.0 appear there too.
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
