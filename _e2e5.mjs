import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const pool = Array.from({ length: 50 }, (_, i) => ({ id: "p" + i, callsign: "AFR" + (100 + i), type: "A320", origin: "EGLL", dest: "LFPG", route: "DVR OKABO", cruiseFL: 350, squawk: "1000", source: "vatsim" }));
await page.addInitScript(`localStorage.setItem('sb:pool', ${JSON.stringify(JSON.stringify(pool))});`);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const ok = (m) => console.log("ok:", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

// FPLN POOL: sub-sections; stocked pool -> lands on POOL; fetchers hidden until picked
await page.click('button:has-text("FPLN POOL")');
await page.waitForTimeout(350);
let t = await page.textContent(".dk-tray.dk-open");
["SIMBRIEF", "VATSIM", "POOL"].forEach((l) => (t.includes(l) ? ok("pool tray latch: " + l) : fail("missing " + l)));
t.includes("AFR100") ? ok("stocked pool -> lands on POOL table (50 entries)") : fail("did not land on pool");
t.toLowerCase().includes("username") ? fail("simbrief inline (should be its own section)") : ok("fetchers not inline with the table");
await page.click('.dk-tray.dk-open .dk-latch:has-text("SIMBRIEF")');
await page.waitForTimeout(250);
t = await page.textContent(".dk-tray.dk-open");
t.includes("AFR100") ? fail("pool table bleeding into SIMBRIEF section") : ok("SIMBRIEF is a clean sub-section");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// BUILD TFC: AIRBORNE | GROUND top level, RULESET/MANUAL nested under AIRBORNE
await page.click('button:has-text("BUILD TFC")');
await page.waitForTimeout(350);
t = await page.textContent(".dk-tray.dk-open");
["AIRBORNE", "GROUND", "RULESET", "MANUAL"].forEach((l) => (t.includes(l) ? ok("build latch: " + l) : fail("missing " + l)));
// GROUND hides the sub-latches
await page.click('.dk-tray.dk-open .dk-latch:has-text("GROUND")');
await page.waitForTimeout(250);
t = await page.textContent(".dk-tray.dk-open");
!t.includes("RULESET") && !t.includes("MANUAL") ? ok("GROUND hides airborne sub-latches") : fail("sub-latches leak into GROUND");
// switch to MANUAL, flip to GROUND and back -> returns to MANUAL
await page.click('.dk-tray.dk-open .dk-latch:has-text("AIRBORNE")');
await page.waitForTimeout(200);
await page.click('.dk-tray.dk-open .dk-latch:has-text("MANUAL")');
await page.waitForTimeout(200);
await page.click('.dk-tray.dk-open .dk-latch:has-text("GROUND")');
await page.waitForTimeout(200);
await page.click('.dk-tray.dk-open .dk-latch:has-text("AIRBORNE")');
await page.waitForTimeout(250);
t = await page.textContent(".dk-tray.dk-open");
t.includes("ADD AIRCRAFT") ? ok("AIRBORNE remembers MANUAL sub-section") : fail("lost airborne sub-choice");

await page.waitForTimeout(200);
await page.screenshot({ path: "docs/screenshots/flightdeck-dark.png" });
if (errors.length) fail("page errors: " + errors.join(" | "));
await browser.close();
console.log(process.exitCode ? "E2E FAILED" : "E2E PASSED");
