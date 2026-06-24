// loadOracle.mjs
//
// The ORACLE for the regression suite. We treat reference/sweatbox-builder-v6-rc3.html
// as the source of truth for all generation behavior. Rather than copy its logic
// (which would defeat the purpose), we execute the ORIGINAL code in a Node VM:
//
//   1. Read the HTML, extract the main `<script type="text/babel">` shell block
//      and each plugin file.
//   2. Babel-compile the JSX exactly as the browser's Babel-Standalone would
//      (preset "react").
//   3. Run it in a vm sandbox with stubbed browser globals (document, React,
//      ReactDOM, fetch, localStorage, crypto) so the React component bodies are
//      DEFINED but never executed — only the pure generation functions run.
//   4. Override Math.random with a deterministic seeded PRNG so output is
//      reproducible byte-for-byte. crypto.randomUUID is likewise deterministic
//      (ids never reach the .scn, but we pin them anyway).
//
// The result is `SB` — the same window.SB the browser builds — exposing
// generateSweatbox, generateFromRule, computeSpawnGs, assignSquawk, etc.
//
// Plugins (S1/S3/...) keep their generation helpers inside an IIFE closure, so
// for the ones we need to test (S1's buildGroundAircraft) we inject a single
// line just before the IIFE closes that hoists the internal symbols onto SB.
// This changes nothing about the algorithm — it only makes a closure-private
// function reachable from the test harness.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { transform } from "@babel/core";
import presetReact from "@babel/preset-react";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..");
const HTML = resolve(REPO, "reference", "sweatbox-builder-v6-rc3.html");

// ── Deterministic PRNG (mulberry32) ──────────────────────────────────────────
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededMath(seed) {
  const rand = mulberry32(seed);
  const m = Object.create(Math);
  m.random = rand;
  return m;
}

// ── Extract the main shell <script type="text/babel"> block from the HTML ─────
function extractShellScript(html) {
  const m = html.match(
    /<script\s+type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) throw new Error("Could not find the <script type=text/babel> shell block");
  return m[1];
}

function compileJsx(src, filename) {
  const out = transform(src, {
    filename,
    presets: [[presetReact, {}]],
    babelrc: false,
    configFile: false,
    compact: false,
    retainLines: false,
  });
  return out.code;
}

// ── Build a fresh sandbox with browser-shaped stubs ───────────────────────────
function makeSandbox(seed) {
  let uuidCounter = 0;
  const noop = () => {};
  const reactStub = {
    useState: (v) => [v, noop],
    useEffect: noop,
    useMemo: (fn) => fn(),
    createElement: () => null,
    Fragment: "Fragment",
  };
  const reactDomStub = { createRoot: () => ({ render: noop }) };
  const documentStub = {
    getElementById: () => ({}),
    querySelectorAll: () => [],
    createElement: () => ({ click: noop, set href(_v) {}, set download(_v) {} }),
  };
  const cryptoStub = {
    randomUUID: () => `oracle-uuid-${(uuidCounter++).toString(36).padStart(6, "0")}`,
  };
  const localStorageStub = {
    _m: new Map(),
    getItem(k) {
      return this._m.has(k) ? this._m.get(k) : null;
    },
    setItem(k, v) {
      this._m.set(k, String(v));
    },
    removeItem(k) {
      this._m.delete(k);
    },
  };
  const fetchStub = () => Promise.reject(new Error("fetch disabled in oracle"));

  const SB = {
    _registry: [],
    _listeners: [],
    registerGenerator(g) {
      if (!g || !g.id) return;
      this._registry = this._registry.filter((x) => x.id !== g.id).concat(g);
      this._listeners.forEach((fn) => {
        try {
          fn();
        } catch (e) {}
      });
    },
    onRegister(fn) {
      this._listeners.push(fn);
      return () => {
        this._listeners = this._listeners.filter((f) => f !== fn);
      };
    },
    // Stub so the shell's trailing `_loadPlugins()` call is a no-op; the test
    // harness loads plugins explicitly via loadPlugin().
    _loadPlugins: async () => ({ loaded: [], failed: [], mode: "oracle" }),
    stars: [],
    rampAgent: {},
    rampConfig: null,
  };

  const win = {
    SB,
    React: reactStub,
    ReactDOM: reactDomStub,
    document: documentStub,
    localStorage: localStorageStub,
    crypto: cryptoStub,
    fetch: fetchStub,
    navigator: { clipboard: { writeText: noop } },
  };

  const ctx = {
    window: win,
    globalThis: win,
    SB,
    React: reactStub,
    ReactDOM: reactDomStub,
    document: documentStub,
    localStorage: localStorageStub,
    crypto: cryptoStub,
    fetch: fetchStub,
    navigator: win.navigator,
    Math: seededMath(seed),
    Date,
    JSON,
    console,
    URL: { createObjectURL: () => "blob:oracle", revokeObjectURL: noop },
    Blob: class {},
    FileReader: class {},
    setTimeout,
    clearTimeout,
  };
  vm.createContext(ctx);
  return { ctx, SB };
}

/**
 * Load the rc3 shell and return its window.SB (the generation core), with
 * Math.random seeded deterministically.
 *
 * @param {number} seed
 * @returns {{ SB: any, loadPlugin: (relPath: string) => void, ctx: any }}
 */
export function loadOracle(seed = 1) {
  const html = readFileSync(HTML, "utf8");
  const shellSrc = extractShellScript(html);
  const compiled = compileJsx(shellSrc, "rc3-shell.jsx");
  const { ctx, SB } = makeSandbox(seed);
  vm.runInContext(compiled, ctx, { filename: "rc3-shell.jsx" });

  // Some pure generation functions are top-level `function` declarations the
  // shell never puts on window.SB (e.g. generateSweatbox, used only by the
  // Export panel). In a vm context such declarations attach to the global, so
  // we lift the ones the harness needs onto SB for a single access surface.
  for (const k of [
    "generateSweatbox",
    "parseSectorFile",
    "parseESE",
    "detectIaf",
    "bearingBetween",
    "destinationPoint",
  ]) {
    if (typeof ctx[k] === "function" && typeof SB[k] !== "function") SB[k] = ctx[k];
  }

  function loadPlugin(relPath) {
    let src = readFileSync(resolve(REPO, relPath), "utf8");
    // Hoist closure-private generation helpers onto SB so the harness can call
    // them. Algorithm unchanged — purely an export shim for the IIFE plugins.
    src = src.replace(
      /\}\)\(\);\s*$/,
      `;try{if(typeof buildGroundAircraft!=='undefined')SB.__buildGroundAircraft=buildGroundAircraft;}catch(e){}\n})();`,
    );
    const code = compileJsx(src, relPath);
    vm.runInContext(code, ctx, { filename: relPath });
  }

  return { SB, loadPlugin, ctx };
}
