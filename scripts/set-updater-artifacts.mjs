// set-updater-artifacts.mjs — turn bundle.createUpdaterArtifacts on or off on
// the CI runner.
//
// The bundler refuses to build when createUpdaterArtifacts is true and no
// signing key is exported ("A public key has been found, but no private key").
// That would break every branch build for a fork, or for this repo before the
// TAURI_SIGNING_PRIVATE_KEY secret exists. The release jobs therefore call
//
//   node scripts/set-updater-artifacts.mjs false
//
// when the secret is empty, producing installers exactly as before — just
// without the .sig files, and so without a latest.json for that run.
//
// Runner-only, like sync-version.mjs: never commit the result.
import { readFileSync, writeFileSync } from "node:fs";

const want = process.argv[2];
if (want !== "true" && want !== "false") {
  console.error('set-updater-artifacts: pass "true" or "false"');
  process.exit(1);
}

const f = "src-tauri/tauri.conf.json";
const j = JSON.parse(readFileSync(f, "utf8"));
j.bundle.createUpdaterArtifacts = want === "true";
writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
console.log(`createUpdaterArtifacts = ${want}`);
