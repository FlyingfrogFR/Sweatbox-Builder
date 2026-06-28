// Sync the app version to the git tag at CI build time.
// Reads the tag from GITHUB_REF_NAME (e.g. "v6.0.2") and writes the numeric
// version (6.0.2) into package.json, src-tauri/tauri.conf.json and Cargo.toml.
// This runs only on the CI runner (never committed), so a v* tag is the single
// source of truth — no need to hand-edit version files for a release.
import { readFileSync, writeFileSync } from "node:fs";

const ref = process.env.GITHUB_REF_NAME || "";
const v = ref.replace(/^v/, "");
if (!v) {
  console.error("No GITHUB_REF_NAME tag found; skipping version sync.");
  process.exit(0);
}

for (const f of ["package.json", "src-tauri/tauri.conf.json"]) {
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.version = v;
  writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
}

const ct = "src-tauri/Cargo.toml";
writeFileSync(ct, readFileSync(ct, "utf8").replace(/^version = ".*"/m, `version = "${v}"`));

console.log("synced version to", v);
