import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const rule = { id: "r1", name: "TEST RULE", mode: "S3", isDeparture: false, poolSource: false, spawnWaypoint: "OKABO",
  preEntryNm: 10, rate: 8, duration: 30, startOffset: 0, originPool: "EGLL", destPool: "", homeIcao: "LFPG",
  typePool: "A320", randomCallsign: true, cruiseAlt: 35000, spawnAlt: 18000, gsMode: "wtc", speedType: "ias", squawkMode: "random", seq: 1 };
const scn = { name: "Repro", airportAlt: 0, ils: [], controllers: [], holdings: [], groundConfig: null, rules: [rule], aircraft: [] };
await page.addInitScript(`
  localStorage.setItem('sb:cur', ${JSON.stringify(JSON.stringify(scn))});
  localStorage.setItem('sb:wpts', JSON.stringify([{ name: "OKABO", lat: 49.21, lon: 2.95, type: "FIXES" }]));
`);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

// open BUILD TFC -> RULESET
await page.click('button:has-text("BUILD TFC")');
await page.waitForTimeout(400);
console.log("workbench visible:", (await page.textContent(".dk-tray.dk-open")).includes("SESSION OVERVIEW"));

// is there a Save button for the rule detail? list visible buttons in the workbench
const btns = await page.evaluate(() => [...document.querySelectorAll(".dk-tray.dk-open button")].map(b => b.textContent.trim()).filter(Boolean).slice(0, 40));
console.log("buttons:", JSON.stringify(btns));

// change RATE to 20 in the detail pane
const rateInput = page.locator('.dk-tray.dk-open input[type="number"]').first();
console.log("rate before:", await rateInput.inputValue());
await rateInput.fill("20");
await page.waitForTimeout(300);

// check dirty state / save affordance, then try clicking a save if present
const bodyTxt = await page.textContent(".dk-tray.dk-open");
console.log("has 'Save':", /Save/i.test(bodyTxt), "| has 'unsaved/dirty':", /unsaved|dirty/i.test(bodyTxt));
const saveBtn = page.locator('.dk-tray.dk-open button:has-text("Save")').first();
if (await saveBtn.count()) { await saveBtn.click(); console.log("clicked Save"); }
await page.waitForTimeout(700);

// what does the persisted scenario say?
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:cur") || "{}"));
console.log("stored rule rate after edit:", stored.rules?.[0]?.rate);

// close tray (DONE) and reopen — does the edit survive?
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
await page.click('button:has-text("BUILD TFC")');
await page.waitForTimeout(400);
console.log("rate after reopen:", await page.locator('.dk-tray.dk-open input[type="number"]').first().inputValue());
const stored2 = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:cur") || "{}"));
console.log("stored rate after reopen:", stored2.rules?.[0]?.rate);
if (errors.length) console.log("PAGE ERRORS:", errors.join(" | "));
await browser.close();
