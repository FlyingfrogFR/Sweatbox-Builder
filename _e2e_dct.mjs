// STRIP DCT e2e (7.10.0): the three places a route lives — the aircraft
// editor (FP / SIM fields), the traffic board (every aircraft, with a REWIND
// snapshot first) and the pool footer (visible selection). Only DCT tokens
// go; everything else in a route stays exactly as filed.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const ok = (m) => console.log("ok:", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const check = (c, m) => (c ? ok(m) : fail(m));

const ac = (id, cs, fp, sim) => ({ id, callsign: cs, squawk: "1000", type: "A320", origin: "EHAM", dest: "LFPG", cruiseAlt: 35000, lat: 50, lon: 4, alt: 18000, gs: 420, runway: "27R", spawnWaypoint: "RENSA", preEntryNm: 1, fpRoute: fp, simRoute: sim, start: "", reqAltWpt: "", reqAltVal: "", isDeparture: false, ruleId: null });
const SC = { name: "LFPG dct", holdings: [], rules: [], groundConfig: null, ils: [], controllers: [], airportAlt: 0, aircraft: [
  ac("a1", "KLM44", "EHAM DCT RENSA VEBEK DCT OKABO LFPG", "RENSA DCT VEBEK OKABO"),
  ac("a2", "BAW12", "EGLL RENSA/N0450F350 VEBEK LFPG", "RENSA VEBEK"), // clean
  ac("a3", "DLH9", "EDDF dct BATAG LFPG", "BATAG"),
  { ...ac("g1", "GND1", "DCT LFPG", "DCT LFPG"), isDeparture: true, groundMeta: { kind: "initial-dep", stand: "A1", routeSource: "placeholder" } },
] };
const pe = (id, cs, route) => ({ id, addedAt: 111, source: "vatsim", callsign: cs, type: "A320", origin: "LFPG", dest: "LFBO", route, cruiseFL: 350, squawk: "1000" });
const POOL = [pe("p1", "AFR1234", "OKABO DCT UT163 LMG"), pe("p2", "EZY55", "OKABO UT163 LMG"), pe("p3", "TVF77", "DCT LMG DCT")];
await page.addInitScript(
  `if (!localStorage.getItem('sb:list')) {
     localStorage.setItem('sb:list', ${JSON.stringify(JSON.stringify(["LFPG dct"]))});
     localStorage.setItem('sb:sc:LFPG dct', ${JSON.stringify(JSON.stringify(SC))});
     localStorage.setItem('sb:slotmeta', ${JSON.stringify(JSON.stringify({ active: "LFPG dct", meta: {} }))});
     localStorage.setItem('sb:pool', ${JSON.stringify(JSON.stringify(POOL))});
   }`,
);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const scen = () => page.evaluate(() => JSON.parse(localStorage.getItem("sb:sc:LFPG dct") || "{}"));
const routesOf = async (cs) => { const a = (await scen()).aircraft.find((x) => x.callsign === cs); return [a.fpRoute, a.simRoute]; };
const toasts = async () => (await page.locator(".dk-toast").allTextContents()).join(" | ");

// ---------- aircraft editor ----------
await page.locator('[data-rowid="a1"]').click();
await page.waitForTimeout(400);
const drawer = page.locator(".dk-drawer.dk-open");
check((await drawer.count()) === 1, "editor opened for KLM44");
const stripKeys = drawer.locator('.dk-key:has-text("STRIP DCT")');
check((await stripKeys.count()) === 2, "both route fields offer STRIP DCT");
check((await stripKeys.nth(0).locator(".dk-badge").textContent()) === "2" && (await stripKeys.nth(1).locator(".dk-badge").textContent()) === "1", "badges count the tokens in each field (FP 2, SIM 1)");
await stripKeys.nth(0).click();
await page.waitForTimeout(200);
check((await drawer.locator("textarea").first().inputValue()) === "EHAM RENSA VEBEK OKABO LFPG", `FP route stripped in the field (${await drawer.locator("textarea").first().inputValue()})`);
check((await stripKeys.count()) === 1 && (await stripKeys.first().locator(".dk-badge").textContent()) === "1", "the FP key disappears once the field is clean; the SIM key stays");
check(await drawer.locator("textarea").first().evaluate((el) => document.activeElement === el), "focus lands on the field that was cleaned");
check((await routesOf("KLM44"))[0].includes("DCT"), "nothing is stored until SAVE");
await stripKeys.first().click();
await page.waitForTimeout(200);
await drawer.locator('.dk-key.dk-primary:has-text("SAVE")').click();
await page.waitForTimeout(2400); // the slot autosaves 2 s after a change
check(JSON.stringify(await routesOf("KLM44")) === JSON.stringify(["EHAM RENSA VEBEK OKABO LFPG", "RENSA VEBEK OKABO"]), `SAVE stores both clean routes (${JSON.stringify(await routesOf("KLM44"))})`);
await page.locator('[data-rowid="a2"]').click();
await page.waitForTimeout(400);
check((await drawer.locator('.dk-key:has-text("DCT")').count()) === 0, "a clean aircraft shows no STRIP key at all");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// ---------- board: every aircraft at once ----------
const boardKey = page.locator('.dk-key:has-text("STRIP DCT")');
check((await boardKey.count()) === 1 && (await boardKey.locator(".dk-badge").textContent()) === "1", `board key counts the airborne aircraft still carrying DCT — the ground placeholder is not counted (${await boardKey.locator(".dk-badge").textContent()})`);
const snapsBefore = (await page.evaluate(() => JSON.parse(localStorage.getItem("sb:snap:LFPG dct") || "[]"))).length;
await boardKey.click();
await page.waitForTimeout(2400); // autosave
const s = await scen();
check(s.aircraft.filter((a) => !a.groundMeta).every((a) => !/\bDCT\b/i.test(a.fpRoute + " " + a.simRoute)), "no airborne aircraft carries a DCT any more");
check(s.aircraft.find((a) => a.callsign === "GND1").fpRoute === "DCT LFPG", "ground traffic keeps its placeholder route");
check(await page.evaluate(() => document.activeElement?.id === "dk-rewind"), "focus moves to REWIND when the key unmounts");
check(s.aircraft.find((a) => a.callsign === "DLH9").fpRoute === "EDDF BATAG LFPG", "lower-case dct went too");
check(s.aircraft.find((a) => a.callsign === "BAW12").fpRoute === "EGLL RENSA/N0450F350 VEBEK LFPG", "a clean route with a suffix is untouched");
check((await toasts()).includes("DCT removed from 1 aircraft") && (await toasts()).includes("REWIND"), `toast says what happened and names the backstop (${await toasts()})`);
const snaps = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:snap:LFPG dct") || "[]"));
check(snaps.length === snapsBefore + 1 && JSON.stringify(snaps).includes("before STRIP DCT"), "a snapshot was taken first");
check((await page.locator('.dk-key:has-text("STRIP DCT")').count()) === 0, "the board key is gone once nothing is left to strip");
check((await page.locator(".dk-key.dk-primary").count()) <= 1, "no second primary appeared on the deck");

// ---------- pool footer: visible selection ----------
await page.click('button[title^="Real flight plans"]');
await page.waitForTimeout(500);
const tray = page.locator(".dk-tray.dk-open");
const rows = () => tray.locator("table tbody tr");
const row = (cs) => rows().filter({ has: page.locator(`td:nth-child(2):text-is("${cs}")`) });
const hold = async (loc) => { const b = await loc.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); await page.waitForTimeout(400); };
const poolKey = () => tray.locator('.dk-holdable:has-text("STRIP DCT")');
check((await poolKey().count()) === 0, "no pool key without a selection");
await row("EZY55").locator("td").nth(1).click();
await page.waitForTimeout(200);
check((await poolKey().count()) === 0, "a selection with no DCT offers nothing");
await row("AFR1234").locator("td").nth(1).click();
await row("TVF77").locator("td").nth(1).click();
await page.waitForTimeout(200);
check((await poolKey().count()) === 1 && (await poolKey().locator(".dk-badge").textContent()) === "2", "footer counts the selected entries that have DCT");
check((await poolKey().getAttribute("title")).includes("no REWIND"), "it is a hold key and says why");
const footer = page.locator(".dk-tray.dk-open > div:last-child");
check((await footer.textContent()).replace(/\s+/g, " ").indexOf("STRIP DCT") < (await footer.textContent()).replace(/\s+/g, " ").indexOf("COPY"), "placed before the COPY cluster");
// a row opened BEFORE the footer strip must not write the DCTs back on SAVE
await tray.locator('button[aria-label="Edit AFR1234"]').click();
await page.waitForTimeout(250);
const edit = tray.locator("tr[data-pool-edit]");
check((await edit.locator('.dk-key:has-text("STRIP DCT")').count()) === 1 && (await edit.locator('.dk-key:has-text("STRIP DCT") .dk-badge').textContent()) === "1", "the row editor offers STRIP DCT beside ROUTE");
await tray.locator('input[placeholder="Callsign"]').fill("AFR");
await page.waitForTimeout(250);
check((await poolKey().locator(".dk-badge").textContent()) === "1", "only the selected rows you can see are counted");
await hold(poolKey());
let pool = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:pool") || "[]"));
check(pool.find((p) => p.callsign === "AFR1234").route === "OKABO UT163 LMG", "visible selected entry stripped");
check(pool.find((p) => p.callsign === "TVF77").route === "DCT LMG DCT", "hidden selected entry untouched");
check((await toasts()).includes("DCT removed from 1 pool entry"), `pool toast (${await toasts()})`);
check((await edit.locator('textarea[aria-label^="ROUTE"]').inputValue()) === "OKABO UT163 LMG", "the open row adopted the stripped route");
check((await edit.locator('.dk-key:has-text("STRIP DCT")').count()) === 0, "and its own key is gone");
await edit.locator('input[aria-label^="TYPE"]').fill("A319");
await edit.locator('textarea[aria-label^="ROUTE"]').press("Enter");
await page.waitForTimeout(300);
pool = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:pool") || "[]"));
check(pool.find((p) => p.callsign === "AFR1234").route === "OKABO UT163 LMG" && pool.find((p) => p.callsign === "AFR1234").type === "A319", "SAVE keeps the strip and the user's own edit");
await tray.locator('input[placeholder="Callsign"]').fill("");
await page.waitForTimeout(250);
// the row editor's own key
await tray.locator('button[aria-label="Edit TVF77"]').click();
await page.waitForTimeout(250);
await edit.locator('.dk-key:has-text("STRIP DCT")').click();
await page.waitForTimeout(200);
check((await edit.locator('textarea[aria-label^="ROUTE"]').inputValue()) === "LMG", "row key strips the draft");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check((await page.evaluate(() => JSON.parse(localStorage.getItem("sb:pool") || "[]"))).find((p) => p.callsign === "TVF77").route === "DCT LMG DCT", "cancelled — nothing stored");
await hold(poolKey());
pool = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:pool") || "[]"));
check(pool.find((p) => p.callsign === "TVF77").route === "LMG", "an all-but-one-DCT route is reduced to its fix");
check(pool.find((p) => p.callsign === "EZY55").route === "OKABO UT163 LMG" && pool[1].addedAt === 111, "untouched entries keep everything");
check((await poolKey().count()) === 0, "pool key gone once the selection is clean");
check(await page.evaluate(() => document.activeElement?.id === "dk-pool-add"), "focus moves to ADD TO BOARD when the hold key unmounts");
await tray.locator('.dk-key:has-text("DONE")').click();
await page.waitForTimeout(300);

// ---------- rule editor: route templates ----------
await page.click('button:has-text("BUILD TFC")');
await page.waitForTimeout(400);
await page.click('.dk-tray.dk-open .dk-key:has-text("FIRST RULE")');
await page.waitForTimeout(400);
await page.click('.dk-tray.dk-open button:has-text("Edit all fields")');
await page.waitForTimeout(400);
const ed = page.locator(".dk-tray.dk-open .absolute.inset-0").first();
check((await ed.locator('.dk-key:has-text("STRIP DCT")').count()) === 0, "no key while the templates are clean");
await ed.locator('textarea[placeholder^="Full filed route"]').fill("EHAM DCT RENSA DCT VEBEK LFPG");
await ed.locator('textarea[placeholder*="populated when you apply a STAR"], textarea[placeholder^="e.g."]').first().fill("RENSA DCT VEBEK");
await page.waitForTimeout(250);
const ruleKey = ed.locator('.dk-key:has-text("STRIP DCT")');
check((await ruleKey.count()) === 1 && (await ruleKey.locator(".dk-badge").textContent()) === "3", `ROUTE TEMPLATES header counts DCTs across the templates (${await ruleKey.locator(".dk-badge").textContent()})`);
await ruleKey.click();
await page.waitForTimeout(250);
check((await ed.locator('textarea[placeholder^="Full filed route"]').inputValue()) === "EHAM RENSA VEBEK LFPG", "FP template stripped");
check((await ed.locator('textarea[placeholder*="populated when you apply a STAR"], textarea[placeholder^="e.g."]').first().inputValue()) === "RENSA VEBEK", "sim template stripped");
check((await ruleKey.count()) === 0, "key gone once the templates are clean");

console.log("page errors:", errors);
if (errors.length) fail("page errors present");
await browser.close();
