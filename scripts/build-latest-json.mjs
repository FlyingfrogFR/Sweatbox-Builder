// build-latest-json.mjs — assemble the updater manifest for a release.
//
// The Tauri updater fetches ONE file, latest.json, from the newest published
// release and compares its `version` against the running app. Each platform
// entry carries the download URL plus the literal text of that artifact's .sig
// (a path or URL there silently fails verification).
//
// Run from the release job, after the installers have been collected, with the
// signature files still sitting in the downloaded artifacts tree:
//
//   node scripts/build-latest-json.mjs --tag v7.7.0 --sigs artifacts \
//     --out upload/latest.json [--notes notes.md]
//
// Two platform keys point at the same macOS archive on purpose: the updater
// derives its target from the arch it was COMPILED for, so the two slices of a
// universal binary ask for darwin-aarch64 and darwin-x86_64 respectively and
// there is no built-in "universal" arch.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const arg = (name, fallback = "") => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const tag = arg("tag");
const sigsDir = arg("sigs", "artifacts");
const out = arg("out", "upload/latest.json");
const notesFile = arg("notes");
const repo = arg("repo", "FlyingfrogFR/Sweatbox-Builder");

if (!/^v\d/.test(tag)) {
  console.error(`build-latest-json: need a v* tag, got "${tag}"`);
  process.exit(1);
}
const version = tag.replace(/^v/, "");
const dl = (asset) => `https://github.com/${repo}/releases/download/${tag}/${asset}`;

/** Every file under dir, recursively. */
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(sigsDir);
/** Find one signature file by suffix, and return its text content. */
function sig(suffix) {
  const hit = files.find((f) => f.endsWith(suffix));
  if (!hit) return null;
  const text = readFileSync(hit, "utf8").trim();
  if (!text) {
    console.error(`build-latest-json: ${hit} is empty`);
    return null;
  }
  console.log(`  ${basename(hit)} -> ${text.slice(0, 24)}…`);
  return text;
}

const platforms = {};

// Windows: the NSIS installer IS the updater artifact. The MSI is published for
// people who want it, but only one key can serve every Windows user, and
// handing an .msi to an NSIS install produces a second parallel installation.
const winSig = sig("_x64-setup.exe.sig");
if (winSig) {
  platforms["windows-x86_64"] = {
    url: dl(`Sweatbox.Builder_${version}_x64-setup.exe`),
    signature: winSig,
  };
}

// macOS: the .app.tar.gz produced by createUpdaterArtifacts, renamed in the
// build job so it carries a version and no spaces.
const macSig = sig("universal.app.tar.gz.sig");
if (macSig) {
  const url = dl(`Sweatbox.Builder_${version}_universal.app.tar.gz`);
  platforms["darwin-aarch64"] = { url, signature: macSig };
  platforms["darwin-x86_64"] = { url, signature: macSig };
}

if (!Object.keys(platforms).length) {
  console.error(
    "build-latest-json: no signatures found — was TAURI_SIGNING_PRIVATE_KEY set on the build jobs?",
  );
  process.exit(1);
}

// A whole-file parse failure breaks updates on EVERY platform, so keep the
// optional fields boring: notes trimmed, pub_date strictly RFC 3339.
let notes = `Sweatbox Builder ${version}`;
if (notesFile) {
  try {
    const body = readFileSync(notesFile, "utf8").trim();
    if (body) notes = body.slice(0, 4000);
  } catch {
    /* no notes file — keep the default */
  }
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  platforms,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
console.log(`build-latest-json: wrote ${out} for ${version}`);
console.log(`  platforms: ${Object.keys(platforms).join(", ")}`);
