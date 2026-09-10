// Export plate e2e: the filename tokens + mentor pseudo-pilot follow the active
// save slot (7.6.0). Seeds three slots straight into localStorage and drives
// the real deck: SETUP → SCENARIO must already follow the slot (it always did),
// the EXPORT plate must now — derived from the slot until pinned by an edit,
// pinned values surviving a switch, and no slot inheriting another's config.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const ok = (m) => console.log("ok:", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const check = (cond, m) => (cond ? ok(m) : fail(m));

const base = { holdings: [], aircraft: [], rules: [], groundConfig: null };
// A — a plain name; global mirror says LFPG_3.3_WEST26 with pseudo-pilot LFPG_APP
const A = { ...base, name: "LFPG rush", airportAlt: 392, ils: [{ id: "i1", name: "26L", lat1: 49.0, lon1: 2.5, lat2: 49.01, lon2: 2.55 }], controllers: [{ id: "c1", callsign: "LFPG_APP", freq: "124.350" }], boundaryFir: "LFFF" };
// B — convention-shaped name, nothing pinned
const B = { ...base, name: "LFBB_1_1_NORTH32", airportAlt: 160, ils: [{ id: "i2", name: "23", lat1: 44.8, lon1: -0.7, lat2: 44.81, lon2: -0.72 }], controllers: [{ id: "c2", callsign: "LFBB_CTR", freq: "126.575" }], boundaryFir: "LFBB" };
// C — a pinned plate that disagrees with its name on purpose
const C = { ...base, name: "LFBB north", airportAlt: 160, ils: [], controllers: [{ id: "c3", callsign: "LFBD_APP", freq: "118.300" }], boundaryFir: "LFBB",
  exportSettings: { icao: "LFBD", version: "2.0", config: "EAST", configNum: "05", autoAssign: true, ppMode: "custom", ppList: "", ppCustom: "LFBD_M_APP" } };
const exportPrefs = { autoAssign: true, ppMode: "list", ppList: "LFPG_APP", ppCustom: "", icao: "LFPG", version: "3.3", config: "WEST", configNum: "26" };

await page.addInitScript(
  `localStorage.setItem('sb:list', ${JSON.stringify(JSON.stringify(["LFPG rush", "LFBB_1_1_NORTH32", "LFBB north"]))});
   localStorage.setItem('sb:sc:LFPG rush', ${JSON.stringify(JSON.stringify(A))});
   localStorage.setItem('sb:sc:LFBB_1_1_NORTH32', ${JSON.stringify(JSON.stringify(B))});
   localStorage.setItem('sb:sc:LFBB north', ${JSON.stringify(JSON.stringify(C))});
   localStorage.setItem('sb:slotmeta', ${JSON.stringify(JSON.stringify({ active: "LFPG rush", meta: {} }))});
   localStorage.setItem('sb:export', ${JSON.stringify(JSON.stringify(exportPrefs))});`,
);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

const PLATE = 'button[title*="ICAO_X.Y_CONFIGYY"]';
async function readSetup() {
  await page.click('button[title="Scenario frame + navdata"]');
  await page.waitForTimeout(350);
  const tray = page.locator(".dk-tray.dk-open");
  await tray.locator('.dk-latch:has-text("SCENARIO")').first().click();
  await page.waitForTimeout(250);
  const name = await tray.locator('input[placeholder="LFPG APP — evening rush"]').inputValue();
  const alt = await tray.locator('input[type="number"][step="0.1"]').first().inputValue();
  const ctrls = await tray.locator("table input").evaluateAll((els) => els.map((e) => e.value).filter((v) => /^[A-Z]{4}_/.test(v)));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  return { name, alt, ctrls };
}
async function openPlate() {
  await page.click(PLATE);
  await page.waitForTimeout(250);
}
async function closePlate() {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}
async function readExport() {
  const plate = (await page.locator(PLATE).textContent())?.trim();
  await openPlate();
  const icao = await page.locator('input[placeholder="LFPG"]').inputValue();
  const version = await page.locator('input[placeholder="3.3"]').inputValue();
  const config = await page.locator('input[placeholder="WEST"]').inputValue();
  const num = await page.locator('input[placeholder="26"]').inputValue();
  const seeded = (await page.locator('p:has-text("Seeded from this slot")').count()) > 0;
  const ppOn = (await page.locator('.dk-latch[title^="Writes INITIALPSEUDOPILOT"]').textContent())?.trim();
  const sel = page.locator("select").last();
  const ppSelected = (await sel.count()) ? await sel.inputValue() : null;
  const ppOptions = (await sel.count()) ? await sel.locator("option").evaluateAll((o) => o.map((x) => x.textContent)) : [];
  const custom = page.locator('input[placeholder="LFPG_M_APP"]');
  const ppCustom = (await custom.count()) ? await custom.inputValue() : null;
  await closePlate();
  return { plate, icao, version, config, num, seeded, ppOn, ppSelected, ppOptions, ppCustom };
}
const switchTo = async (name) => {
  await page.click(`[title="Switch to this slot"]:has-text("${name}")`);
  await page.waitForTimeout(500);
};

// ---------- A: plain name, unpinned ----------
let s = await readSetup();
check(s.name === "LFPG rush" && s.alt === "392" && s.ctrls.join() === "LFPG_APP", `A · SETUP follows the slot (${s.name} · ${s.alt} · ${s.ctrls})`);
let x = await readExport();
check(x.seeded, "A · plate is DERIVED (seeded hint shown)");
check(x.icao === "LFPG", `A · ICAO seeded from the slot name (${x.icao})`);
check(x.version === "3.3", `A · syllabus version inherited from the mirror (${x.version})`);
check(x.config === "" && x.num === "" && x.plate === "— SET NAME —", `A · another slot's WEST26 is NOT inherited (plate ${x.plate})`);
check(x.ppOn === "ON" && x.ppSelected === "LFPG_APP", `A · mentor pick carried over because A has LFPG_APP (${x.ppSelected})`);

// ---------- B: convention-shaped name → complete plate, nothing stale ----------
await switchTo("LFBB_1_1_NORTH32");
s = await readSetup();
check(s.name === "LFBB_1_1_NORTH32" && s.alt === "160" && s.ctrls.join() === "LFBB_CTR", `B · SETUP follows the slot (${s.name} · ${s.alt} · ${s.ctrls})`);
x = await readExport();
check(x.plate === "LFBB_1.1_NORTH32.txt", `B · plate derived from the convention-shaped name (${x.plate})`);
check(x.seeded, "B · still marked as seeded (not pinned)");
check(x.ppSelected === "" && !x.ppOptions.some((o) => o.includes("no longer in Setup")), `B · no stale 'no longer in Setup' pseudo-pilot (options: ${x.ppOptions.join(" | ")})`);

// ---------- C: pinned block wins over the name ----------
await switchTo("LFBB north");
x = await readExport();
check(x.plate === "LFBD_2.0_EAST05.txt", `C · pinned plate wins over the slot name (${x.plate})`);
check(!x.seeded, "C · no seeded hint on a pinned slot");
check(x.ppOn === "ON" && x.ppCustom === "LFBD_M_APP", `C · pinned TYPED mentor callsign (${x.ppCustom})`);

// ---------- edit on B pins it; A stays clean; B survives a round trip ----------
await switchTo("LFBB_1_1_NORTH32");
await openPlate();
await page.fill('input[placeholder="WEST"]', "SOUTH");
await page.fill('input[placeholder="26"]', "05");
await closePlate();
await page.waitForTimeout(200);
x = await readExport();
check(x.plate === "LFBB_1.1_SOUTH05.txt" && !x.seeded, `B · edit pins the plate (${x.plate}, seeded=${x.seeded})`);
await switchTo("LFPG rush");
x = await readExport();
check(x.config === "" && x.plate === "— SET NAME —", `A · untouched by B's edit (plate ${x.plate})`);
await switchTo("LFBB_1_1_NORTH32");
x = await readExport();
check(x.plate === "LFBB_1.1_SOUTH05.txt", `B · pinned plate survives the round trip (${x.plate})`);
const storedB = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:sc:LFBB_1_1_NORTH32") || "{}").exportSettings);
check(storedB && storedB.config === "SOUTH" && storedB.configNum === "05", `B · block persisted on the slot payload (${JSON.stringify(storedB)})`);

// ---------- mentor-level prefs seed a brand-new slot; identity does not ----------
await openPlate();
await page.locator('.dk-latch[title^="Writes INITIALPSEUDOPILOT"]').click();
await closePlate();
await page.click('[title="New empty slot (Ctrl+N)"]');
await page.waitForTimeout(500);
x = await readExport();
check(x.ppOn === "OFF", `new slot · pseudo-pilot OFF inherited as a mentor preference (${x.ppOn})`);
check(x.icao === "" && x.config === "" && x.plate === "— SET NAME —", `new slot · no identity inherited (plate ${x.plate})`);
check(x.version === "1.1", `new slot · version inherited from the last edited plate (${x.version})`);

console.log("page errors:", errors);
if (errors.length) fail("page errors present");
await browser.close();
