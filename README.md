# Sweatbox Builder

A native desktop app for building EuroScope **sweatbox** training scenarios
(`.scn`) and rulesets. Built with **Tauri v2** (Rust) wrapping a **Vite + React 18
+ TypeScript** front-end. It is the maintainable port of the original
single-file prototype `reference/sweatbox-builder-v6-rc3.html`.

The generation logic — `.scn` serialization, rule expansion, squawk/heading/
ground-speed encoding — was ported **verbatim** from that prototype and is
guarded by a byte-for-byte regression suite (see [Tests](#tests)).

---

## Prerequisites

- **Node.js** 18+ and npm (developed on Node 22).
- **Rust** toolchain via [rustup](https://rustup.rs/) (stable, 1.77.2+).
- **Tauri v2 OS dependencies** — see the official guide:
  <https://v2.tauri.app/start/prerequisites/>
  - **Windows:** the **MSVC C++ build tools** (Visual Studio Build Tools, "Desktop
    development with C++") and the **WebView2 runtime** (ships with current
    Windows 10/11; install the Evergreen runtime if absent).
  - **macOS:** Xcode Command Line Tools.
  - **Linux:** `webkit2gtk-4.1`, `gtk3`, `librsvg2`, `libsoup-3.0`, etc.

After installing Rust + the OS deps:

```bash
npm install
```

---

## Develop / Build / Test

```bash
npm run tauri:dev     # native dev window with hot reload (Vite + Tauri)
npm run tauri:build   # production app + installers (see below)
npm test              # golden-file regression suite (Vitest)

# front-end only (no native window):
npm run dev           # Vite dev server at http://localhost:1420
npm run build         # type-checked production web build into dist/
npm run lint          # ESLint
npm run fixtures      # regenerate golden .scn fixtures from the oracle
```

### What `npm run tauri:build` produces

- **Windows:** an **MSI** installer **and** an **NSIS `.exe`** installer, plus a
  standalone `Sweatbox Builder.exe` in `src-tauri/target/release/`.
- **macOS:** `.app` + `.dmg`. **Linux:** `.deb` / `.AppImage` / `.rpm`.

The bundle `targets` is set to `"all"` in `src-tauri/tauri.conf.json`, so each
platform emits its native installers. Build on the target OS (Tauri does not
cross-compile installers out of the box) — i.e. build the Windows installers on
Windows.

### Continuous builds (GitHub Actions)

`.github/workflows/build.yml` runs the test suite on every push/PR, and builds
the **Windows installers** without needing a local Windows toolchain:

- **On demand:** GitHub → **Actions** → *CI & Build* → **Run workflow**. When it
  finishes, download the `sweatbox-builder-windows` artifact from the run page
  (contains the `.msi`, NSIS `.exe`, and standalone `.exe`).
- **Tagged release:** push a tag like `v6.0.0` (`git tag v6.0.0 && git push origin
  v6.0.0`) and the installers are attached to a published GitHub **Release**.

---

## No CORS proxy needed on desktop

The original prototype needed a localhost CORS proxy (`reference/fpd-cors-proxy.*`)
to reach the FlightPlanDatabase / SimBrief / VATSIM APIs from a browser. **The
desktop build does not.** All external calls go through the **Tauri HTTP plugin**
(`@tauri-apps/plugin-http`), which makes native requests that bypass CORS in both
dev and production. Hosts are allow-listed in
`src-tauri/capabilities/default.json`:

```
https://api.flightplandatabase.com/*
https://www.simbrief.com/*
https://data.vatsim.net/*
```

`src/net/http.ts` selects the transport: the Tauri plugin when running in the
native webview, plain `window.fetch` otherwise. The proxy files are kept under
`reference/` **only** as a fallback for an optional plain-web build.

### Native file save

Scenario / ruleset exports use the Tauri **dialog** + **fs** plugins to show a
native "Save As" dialog and write the file directly, named at write time:

- scenario: `ICAO_X.Y_CONFIGYY.scn`
- ruleset: `ICAO_X.Y_CONFIGYY_RULESET.json`

The four name tokens are entered in the **Export** tab with a live filename
preview. A browser blob-download fallback is kept for the web build.

---

## Project layout

```
reference/        Untouched original prototype (the regression ORACLE) +
                  scenario-*.js, plugins.json, fpd-cors-proxy.* (web fallback)
src/
  core/           Parity-critical generation logic, ported VERBATIM:
                  generateSweatbox, generateFromRule, ground (S1), geo, speed,
                  callsign, squawk, route, ramp, tables, model, pool, rng, stars
  generators/     ES-module plugin registry + s1/s2/s3/c1 generators
  panels/         The eight tab panels + App shell
  parsers/        .sct / .ese parsers
  net/            http (Tauri HTTP plugin wrapper) + apis (SimBrief/VATSIM)
  io/             fileSave (native Save-As + naming) + bundles (JSON import/export)
  state/          localStorage wrapper + KEYS + usePersist
  ui/             Icon
src-tauri/        Rust backend: tauri.conf.json, capabilities/, src/lib.rs, icons/
tests/            Regression harness (oracle in a VM) + golden fixtures + Vitest
```

---

## Generators (the plugin system)

Generators live in `src/generators/`. The plugin contract from the prototype is
preserved — `registerGenerator({ id, label, render })` and `onRegister` — but
runtime Babel + `plugins.json` fetching is replaced by **static ES-module
imports**. `src/generators/index.ts` imports each generator (a side-effect that
registers it); `GeneratorsPanel` renders them by id in canonical order
(S1, S2, S3, C1).

- **S3 Approach** (`s3.tsx`) defines the shared `RulePanel` / `RuleEditor` and
  exports `RulePanel`.
- **C1 Enroute** (`c1.tsx`) reuses that exported `RulePanel` with `mode="C1"`.
- **S1 Ground** (`s1.tsx`) is its own panel; its generation lives in
  `core/ground.ts`.
- **S2 Tower** (`s2.tsx`) is a stub sub-tab.

### Add a generator

1. Create `src/generators/mygen.tsx`:

   ```tsx
   import { registerGenerator } from "./registry";

   function MyPanel(props: any) {
     return <div className="p-6">…</div>;
   }

   registerGenerator({
     id: "MY",
     label: "My Generator",
     render: (props) => <MyPanel {...props} />,
   });
   ```

2. Add `import "./mygen";` to `src/generators/index.ts`.

It appears automatically in the Generators tab. `render` receives
`{ scenario, onChange, waypoints, airports, runways, positions, pool, stars, copx,
gates, rampAgent, rampConfig }`.

---

## Tests

Output parity is the top priority. The harness treats
`reference/sweatbox-builder-v6-rc3.html` as the **oracle**: it Babel-compiles and
runs the original code in a Node VM with a **seeded RNG**, captures the exact
`.scn` output for a set of synthetic cases, and stores them as golden fixtures in
`tests/fixtures/`.

- `tests/parity.test.ts` — the ported `src/core` modules must reproduce each
  golden `.scn` **byte-for-byte** under the same seed.
- `tests/oracle.test.ts` — re-runs the original code to guard the goldens against
  drift (e.g. if the reference HTML changes).
- `tests/naming.test.ts` — the export naming convention.

```bash
npm test               # run once
npm run fixtures       # regenerate goldens from the oracle (after intended changes)
```

Navdata (`.sct` / `.ese`) is **not** shipped — load your own sector files at
runtime via the **Navdata** tab. The regression fixtures fabricate minimal
navdata so they are self-contained.
