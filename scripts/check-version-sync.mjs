// Guard: the four places the app version lives must exist, be non-empty and
// agree. A truncated or drifted src-tauri manifest is invisible to `npm test`
// and `npm run build` (both frontend-only) and only surfaces ~10 minutes into
// a Tauri build, so it is checked up front instead.
import { readFileSync } from "node:fs";

const fail = (m) => {
  console.error("version-sync: " + m);
  process.exitCode = 1;
};
const read = (f) => {
  const s = readFileSync(f, "utf8");
  if (!s.trim()) throw new Error(`${f} is empty`);
  return s;
};

let versions = {};
try {
  versions["package.json"] = JSON.parse(read("package.json")).version;
  versions["tauri.conf.json"] = JSON.parse(read("src-tauri/tauri.conf.json")).version;

  const toml = read("src-tauri/Cargo.toml");
  if (!/^\[package\]/m.test(toml)) throw new Error("src-tauri/Cargo.toml has no [package] section");
  if (!/^name = "sweatbox-builder"/m.test(toml)) throw new Error("src-tauri/Cargo.toml lost its crate name");
  versions["Cargo.toml"] = toml.match(/^version = "([^"]+)"/m)?.[1];

  const lock = read("src-tauri/Cargo.lock");
  versions["Cargo.lock"] = lock.match(/name = "sweatbox-builder"\nversion = "([^"]+)"/)?.[1];
} catch (e) {
  fail(e.message);
  process.exit(1);
}

for (const [f, v] of Object.entries(versions)) if (!v) fail(`no version found in ${f}`);
const distinct = [...new Set(Object.values(versions))];
if (distinct.length > 1) fail(`versions disagree — ${JSON.stringify(versions)}`);

if (!process.exitCode) console.log(`version-sync OK — ${distinct[0]} in all of ${Object.keys(versions).join(", ")}`);
