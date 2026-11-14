// Climbing entries e2e (v10 / 7.12.0): a Nantes-like departure to Toulouse
// used to pop at FL290 next to its departure field. Driven through the real
// deck: the CLIMBING ENTRIES latch is dead until SPAWN ALT = filed cruise,
// then RUN RULES writes the aircraft at its gate, at FL090, with
// REQALT:<gate>:23000 — and with the latch off, at cruise as before.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const ok = (m) => console.log("ok:", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const check = (c, m) => (c ? ok(m) : fail(m));

// O (LFRS) at 45N 0E; gate G 58.5 NM north; the FIR is the square 46.2–48N, 1W–1E.
const G = { lat: 45.97532, lon: 0 };
const WPTS = [
  { name: "G", ...G, type: "FIXES" },
  { name: "N", lat: 46.5, lon: 0, type: "FIXES" },
  { name: "X", lat: 47.5, lon: 0, type: "FIXES" },
];
const APTS = [
  { name: "LFRS", lat: 45, lon: 0, type: "AIRPORT" },
  { name: "LFBO", lat: 47, lon: 0.2, type: "AIRPORT" },
];
const sq = [[46.2, -1, 48, -1, 0, 999999, 0], [48, -1, 48, 1, 0, 999999, 0], [48, 1, 46.2, 1, 0, 999999, 0], [46.2, 1, 46.2, -1, 0, 999999, 0]];
const COPX = [{ fix: "G", level: 23000, destApt: "", depApt: "LFRS", nextFix: "N", climbLevel: 23000, descendLevel: null, kind: "fir", fromFir: "LFRR", toFir: "LFBB", fromLower: 27500, fromUpper: 32500, toLower: 19500, toUpper: 29500 }];
const POOL = [{ id: "p1", addedAt: 1, source: "vatsim", callsign: "VOE5UR", type: "A320", origin: "LFRS", dest: "LFBO", route: "G DCT N DCT X", cruiseFL: 290, squawk: "1000" }];
const RULE = { id: "r1", name: "LFBO from the north", mode: "C1", isDeparture: false, poolSource: true, poolDep: "", poolArr: "LFBO", spawnWaypoint: "", spawnMode: "autoBoundary", entryDirection: "", appendStar: false, spawnAnchor: "priorFix", priorFixMaxNm: 25, preEntryNm: 45, rwyInUse: "", fpRouteTemplate: "", fpRouteTemplates: [], simRouteTemplate: "", joinFiledRoute: false, rate: 8, duration: 30, timingMode: "regular", startOffset: 0, runway: "", originPool: "", homeIcao: "LFBO", destPool: "", typePool: "A320", typeCategories: [], callsignPattern: "AFR###", randomCallsign: true, heavy: false, seq: 1, cruiseAlt: 35000, spawnAlt: 33000, spawnAltMode: "fixed", gsMode: "wtc", speedType: "ias", assignedSpeed: 280, squawk: "1000", squawkMode: "fixed", squawkOptions: ["1000"], reqAltWpt: "", reqAltVal: "", schedulingMode: "rate", nmSeparation: 10, excludeNonRouting: false, climbOuts: false };
const SC = { name: "LFBB climb", holdings: [], aircraft: [], rules: [RULE], groundConfig: null, ils: [], controllers: [], airportAlt: 0, boundaryFir: "LFBB" };
await page.addInitScript(
  `if (!localStorage.getItem('sb:list')) {
     localStorage.setItem('sb:list', ${JSON.stringify(JSON.stringify(["LFBB climb"]))});
     localStorage.setItem('sb:sc:LFBB climb', ${JSON.stringify(JSON.stringify(SC))});
     localStorage.setItem('sb:slotmeta', ${JSON.stringify(JSON.stringify({ active: "LFBB climb", meta: {} }))});
     localStorage.setItem('sb:wpts', ${JSON.stringify(JSON.stringify(WPTS))});
     localStorage.setItem('sb:apts', ${JSON.stringify(JSON.stringify(APTS))});
     localStorage.setItem('sb:copx', ${JSON.stringify(JSON.stringify(COPX))});
     localStorage.setItem('sb:firbounds', ${JSON.stringify(JSON.stringify({ LFBB: sq }))});
     localStorage.setItem('sb:meta', ${JSON.stringify(JSON.stringify({ sctAt: 1, eseAt: 1 }))});
     localStorage.setItem('sb:pool', ${JSON.stringify(JSON.stringify(POOL))});
   }`,
);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(700);

const openEditor = async () => {
  await page.click('button:has-text("BUILD TFC")');
  await page.waitForTimeout(400);
  await page.click('.dk-tray.dk-open .dk-latch:has-text("C1")');
  await page.waitForTimeout(300);
  await page.click('.dk-tray.dk-open button:has-text("Edit all fields")');
  await page.waitForTimeout(400);
  return page.locator(".dk-tray.dk-open .absolute.inset-0").first();
};
const out = async () => (await page.locator("body").innerText());
const runRules = async () => {
  await page.click('.dk-tray.dk-open .dk-key:has-text("RUN RULES")');
  await page.waitForTimeout(900);
};

// ---------- the latch is dead until FILED CRUISE ----------
let ed = await openEditor();
const latch = () => ed.locator('.dk-latch:has-text("CLIMBING ENTRIES")');
check((await latch().count()) === 1, "CLIMBING ENTRIES sits in the auto-boundary block");
check(await latch().isDisabled(), "it is dead while SPAWN ALT is a fixed altitude");
check((await latch().getAttribute("title")).includes("FILED CRUISE under FLIGHT"), "and its title says why, and where");
check(!(await latch().getAttribute("class")).includes("dk-on"), "a dead latch is never lit");
check((await ed.textContent()).includes("CLIMBING ENTRIES needs FILED CRUISE (FLIGHT · ALTITUDES)."), "a visible note says what it needs");
await ed.locator('.dk-latch:has-text("FILED CRUISE")').click();
await page.waitForTimeout(250);
check(!(await latch().isDisabled()), "FILED CRUISE brings it to life");
check(!(await ed.textContent()).includes("CLIMBING ENTRIES needs FILED CRUISE"), "and the note goes away");
await latch().click();
await page.waitForTimeout(250);
check((await latch().getAttribute("class")).includes("dk-on"), "pressing it lights it");
check((await ed.textContent()).includes("at least 15 NM from its airport"), "the hint explains what it does");
check(!(await ed.textContent()).includes("parsed by an older version"), "no re-parse nag: the loaded ESE already carries climb levels");
await ed.locator('.dk-key:has-text("SAVE RULE")').click();
await page.waitForTimeout(500);

// ---------- RUN RULES: the climbing entry in the file ----------
await runRules();
let o = await out();
check(/\$ROUTE:G\b/.test(o), `sim route starts at the published gate (${(o.match(/\$ROUTE:[^\n]*/) || [""])[0]})`);
check(o.includes("REQALT:G:23000"), "REQALT to the published transfer level at the gate");
const atN = (o.match(/@N:VOE5UR:[^\n]*/) || [""])[0];
check(atN.split(":")[6] === "9000", `pops in the climb at FL090 (${atN})`);
check(/1 climbing in from nearby fields \(LFRS\)/.test(o), "the rule note names the nearby field");

// ---------- latch off: cruise, as before ----------
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
ed = await openEditor();
await latch().click();
await page.waitForTimeout(250);
await ed.locator('.dk-key:has-text("SAVE RULE")').click();
await page.waitForTimeout(500);
await runRules();
o = await out();
const atN2 = (o.match(/@N:VOE5UR:[^\n]*/) || [""])[0];
check(atN2.split(":")[6] === "29000" && !o.includes("REQALT:G:23000"), `with the latch off it is placed at cruise exactly as before (${atN2})`);
// that "before" is the reported bug: at cruise, ~13.5 NM from the departure field
const dLat = (+atN2.split(":")[4] - 45) * 60.04;
check(dLat > 12 && dLat < 15, `…which is the reported defect: FL290 only ${dLat.toFixed(1)} NM from LFRS`);

// ---------- navdata parsed by an older build: the hint asks for one re-parse ----------
await page.keyboard.press("Escape");
await page.waitForTimeout(2600); // let the slot autosave land before the reload
const OLD_COPX = COPX.map(({ depApt, nextFix, climbLevel, descendLevel, ...c }) => c);
await page.evaluate((v) => localStorage.setItem("sb:copx", v), JSON.stringify(OLD_COPX));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
ed = await openEditor();
await latch().click();
await page.waitForTimeout(250);
check(
  (await ed.textContent()).includes("re-parse it once (SETUP → NAVDATA → LOAD .ESE)"),
  "old navdata (no climb levels): the hint asks for one re-parse, and says where",
);

console.log("page errors:", errors);
if (errors.length) fail("page errors present");
await browser.close();
