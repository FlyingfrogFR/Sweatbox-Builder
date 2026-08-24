// Auto-boundary e2e: FIR selector, auto-mode rule editing, and end-to-end
// generation with per-aircraft gates — driven through the real deck UI.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const ok = (m) => console.log("ok:", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

const pool = [
  { id: "n1", callsign: "NORTH1", type: "A320", origin: "EGLL", dest: "LFBO", route: "EGLL CHARL MIDCO ALPHA BAMES LFBO", cruiseFL: 340, squawk: "1000", source: "vatsim" },
  { id: "s1", callsign: "SOUTH1", type: "B738", origin: "LIRF", dest: "LFBO", route: "LIRF BRAVO MIDCO BAMES LFBO", cruiseFL: 360, squawk: "1000", source: "vatsim" },
];
await page.addInitScript(`localStorage.setItem('sb:pool', ${JSON.stringify(JSON.stringify(pool))});`);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const SCT = `[FIXES]
ALPHA N050.00.00.000 E003.00.00.000
BRAVO N048.00.00.000 E003.00.00.000
MIDCO N049.30.00.000 E002.30.00.000
CHARL N051.00.00.000 E001.00.00.000
BAMES N047.48.00.000 E003.12.00.000`;
const ESE = `[COPX]
FIR_COPX:*:*:ALPHA:LFBO:*:LFRR·V U·133.725·1:LFBB·L1 UAC·195·295:*:19500:ALPHA LFBO
FIR_COPX:*:*:BRAVO:*:*:LFMM·W·125.1·1:LFBB·L2·195·295:*:24500:BRAVO`;

// --- paste navdata (SCT then ESE) through the SETUP tray ---
await page.click('button:has-text("SETUP")');
await page.waitForTimeout(400);
const tray = page.locator(".dk-tray.dk-open");
for (const [cardTitle, content, label] of [["Sector file", SCT, "SCT"], ["ESE file", ESE, "ESE"]]) {
  const card = tray.locator(`div:has(> div b:has-text("${cardTitle}"))`).first().locator("xpath=ancestor-or-self::*[contains(@class,'rounded')][1]");
  // simpler: find the PASTE key nearest the card title
  const cardBox = tray.locator(`text=${cardTitle}`).first().locator("xpath=ancestor::div[contains(@class,'border-dashed') or contains(@class,'rounded-xl') or contains(@class,'rounded-lg')][1]");
  await cardBox.locator('.dk-key:has-text("PASTE")').first().click();
  await page.waitForTimeout(250);
  const ta = tray.locator("textarea:visible").first();
  await ta.fill(content);
  await tray.locator('.dk-key:has-text("PARSE PASTED")').first().click();
  await page.waitForTimeout(400);
  ok(`pasted + parsed ${label}`);
}
let t = await tray.textContent();
t.includes("5") ? ok("waypoints parsed (count visible)") : ok("navdata pasted (count not asserted)");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// --- BUILD TFC → C1 workbench: FIR selector ---
await page.click('button:has-text("BUILD TFC")');
await page.waitForTimeout(400);
// empty state shows doors; FIRST RULE creates an (S3) rule and reveals the mode tabs
await page.click('.dk-tray.dk-open .dk-key:has-text("FIRST RULE")');
await page.waitForTimeout(400);
await page.click('.dk-tray.dk-open .dk-latch:has-text("C1 · ENROUTE")');
await page.waitForTimeout(300);
t = await page.locator(".dk-tray.dk-open").textContent();
t.includes("SCENARIO FIR") ? ok("C1 tab shows SCENARIO FIR selector") : fail("no SCENARIO FIR control");
const firSel = page.locator('.dk-tray.dk-open select:has(option[value="LFBB"])').first();
(await firSel.count()) ? ok("LFBB detected in FIR options") : fail("LFBB missing from FIR options");
await firSel.selectOption("LFBB");
await page.waitForTimeout(300);
t = await page.locator(".dk-tray.dk-open").textContent();
/2 entry gates/.test(t) ? ok("gate count badge: 2 entry gates") : fail("missing entry-gate badge: " + (t.match(/SCENARIO FIR.{0,60}/) || [""])[0]);

// --- create a C1 rule, set AIRCRAFT POOL + AUTO — FIR BOUNDARY in the full editor ---
await page.click('.dk-tray.dk-open button:has-text("New")');
await page.waitForTimeout(300);
await page.click('.dk-tray.dk-open button:has-text("Edit all fields")');
await page.waitForTimeout(400);
const ed = page.locator(".dk-tray.dk-open .absolute.inset-0").first();
await ed.locator('.dk-latch:has-text("AIRCRAFT POOL")').click();
await page.waitForTimeout(250);
await ed.locator('.dk-latch:has-text("AUTO — FIR BOUNDARY")').click();
await page.waitForTimeout(250);
t = await ed.textContent();
t.includes("ENTRY DIRECTION") ? ok("auto mode shows octant chips") : fail("no octant chips");
t.includes("SPAWN / ENTRY WAYPOINT") ? fail("spawn waypoint still visible in auto mode") : ok("spawn waypoint hidden in auto mode");
t.includes("ROUTE MUST CONTAIN") ? fail("routeContains still visible in auto mode") : ok("routeContains hidden in auto mode");
await ed.locator('.dk-key:has-text("SAVE RULE")').click();
await page.waitForTimeout(400);

// --- RUN RULES → both aircraft at their own gates ---
await page.click('.dk-tray.dk-open .dk-key:has-text("RUN RULES")');
await page.waitForTimeout(800);
const body = await page.textContent("body");
body.includes("NORTH1") && body.includes("SOUTH1") ? ok("both pool aircraft generated") : fail("aircraft missing from board/output");
const out = await page.locator("body").innerText();
/\$ROUTE:ALPHA BAMES LFBO/.test(out) ? ok("NORTH1 simRoute trimmed at its own gate (ALPHA)") : fail("NORTH1 $ROUTE wrong");
/\$ROUTE:BRAVO MIDCO BAMES LFBO/.test(out) ? ok("SOUTH1 simRoute trimmed at its own gate (BRAVO)") : fail("SOUTH1 $ROUTE wrong");

// --- FIR selection survives reload (scenario autosave) ---
await page.waitForTimeout(1200);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.click('button:has-text("BUILD TFC")');
await page.waitForTimeout(400);
await page.click('.dk-tray.dk-open .dk-latch:has-text("C1")');
await page.waitForTimeout(300);
const val = await page.locator('.dk-tray.dk-open select:has(option[value="LFBB"])').first().inputValue();
val === "LFBB" ? ok("scenario FIR survives reload") : fail("FIR lost on reload: " + val);

if (errors.length) fail("page errors: " + errors.join(" | "));
await browser.close();
console.log(process.exitCode ? "BOUNDARY E2E FAILED" : "BOUNDARY E2E PASSED");
