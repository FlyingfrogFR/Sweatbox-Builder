// changelog-section.mjs — pull one version's notes out of CHANGELOG.md.
//
// The release job uses this as the GitHub release body, and the updater
// manifest then reuses that same text, so the notes a mentor reads in the
// update prompt are the ones written by hand here — not "Full Changelog:
// compare/v7.6.0...v7.7.0".
//
//   node scripts/changelog-section.mjs v7.7.0 > notes.md
//
// Exits 1 with nothing on stdout when the version has no section, which lets
// the caller fall back to generated notes rather than publishing an empty body.
import { readFileSync } from "node:fs";

const tag = process.argv[2] || "";
const version = tag.replace(/^v/, "").trim();
if (!version) {
  console.error("changelog-section: pass a version or tag");
  process.exit(1);
}

let md = "";
try {
  md = readFileSync("CHANGELOG.md", "utf8");
} catch {
  console.error("changelog-section: no CHANGELOG.md");
  process.exit(1);
}

// Sections are "## <version> — <date>"; capture until the next "## ".
const lines = md.split("\n");
const start = lines.findIndex((l) =>
  new RegExp(`^##\\s+v?${version.replace(/\./g, "\\.")}\\b`).test(l),
);
if (start < 0) {
  console.error(`changelog-section: CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s/.test(lines[i])) {
    end = i;
    break;
  }
}

// Drop the heading itself — the release is already titled with the version.
const body = lines
  .slice(start + 1, end)
  .join("\n")
  .trim();
if (!body) {
  console.error(`changelog-section: the ${version} section is empty`);
  process.exit(1);
}
process.stdout.write(body + "\n");
