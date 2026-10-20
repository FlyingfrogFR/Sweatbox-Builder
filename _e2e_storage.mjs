// Storage-full e2e (7.11.1): the "frozen scenario" report. A slot listed with
// no saved data (storage was full when it was made) used to do nothing when
// clicked; a full storage used to say "Saved" while saving nothing. Now the
// rail marks such slots, clicking one explains and recovers, and a refused
// write opens STORAGE FULL with a FREE SPACE action that drops REWIND rings.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const ok = (m) => console.log("ok:", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const check = (c, m) => (c ? ok(m) : fail(m));

const base = { holdings: [], aircraft: [], rules: [], groundConfig: null, ils: [], controllers: [], airportAlt: 0 };
const ac = (i) => ({ id: `a${i}`, callsign: `AFR${1000 + i}`, squawk: "1000", type: "A320", origin: "LFPG", dest: "EGLL", cruiseAlt: 35000, lat: 49.0123456789, lon: 2.0123456789, alt: 18000, gs: 420, runway: "26R", spawnWaypoint: "PG263", preEntryNm: 10, fpRoute: "PG263 PG264 PG265 PIVER CLM DCT BUBLI UN491 LUVAL DCT EGLL", simRoute: "PG263 PG264 PG265 PIVER CLM BUBLI LUVAL", starRoute: "PG263 PG264 PG265 PIVER CLM", start: 12.5, reqAltWpt: "", reqAltVal: "", isDeparture: true, ruleId: "r1", spawnMode: "waypoint", spawnDebug: "PG263 · offset-upstream · join-filed@BUBLI · 10 NM" });
const fleet = Array.from({ length: 60 }, (_, i) => ac(i));
const snaps = Array.from({ length: 5 }, (_, i) => ({ t: 1700000000000 + i, label: `before RUN RULES ${i}`, aircraft: fleet }));
await page.addInitScript(
  `if (!localStorage.getItem('sb:list')) {
     localStorage.setItem('sb:list', ${JSON.stringify(JSON.stringify(["Alpha", "Bravo", "Charlie"]))});
     localStorage.setItem('sb:sc:Alpha', ${JSON.stringify(JSON.stringify({ ...base, name: "Alpha", aircraft: fleet }))});
     // Bravo: listed, never saved (the ghost). Charlie: saved data that cannot be read.
     localStorage.setItem('sb:sc:Charlie', '{"name":"Charlie","aircraft":[{truncated');
     localStorage.setItem('sb:snap:Alpha', ${JSON.stringify(JSON.stringify(snaps))});
     localStorage.setItem('sb:slotmeta', ${JSON.stringify(JSON.stringify({ active: "Alpha", meta: {} }))});
   }`,
);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(700);
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem("sb:slotmeta")).active);
const toasts = async () => (await page.locator(".dk-toast").allTextContents()).join(" | ");
const card = (n) => page.locator(`[data-slot="${n}"]`);
const hold = async (loc) => { const b = await loc.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); await page.waitForTimeout(400); };

// ---------- the rail says what is wrong ----------
check((await card("Bravo").textContent()).includes("NO SAVED DATA"), "a never-saved slot is marked NO SAVED DATA on the rail");
check((await card("Charlie").textContent()).includes("UNREADABLE"), "an unreadable slot is marked UNREADABLE");
check((await card("Bravo").getAttribute("title")).includes("Never saved") && (await card("Charlie").getAttribute("title")).includes("unreadable"), "their hover titles say so too");

// ---------- clicking them explains and recovers ----------
await card("Charlie").click();
await page.waitForTimeout(500);
check((await active()) === "Alpha" && (await toasts()).includes("cannot be opened"), `unreadable: stays put and says why (${await toasts()})`);
await card("Bravo").click();
await page.waitForTimeout(500);
check((await active()) === "Bravo" && (await toasts()).includes("never saved"), `never-saved: opens empty and says why (${await toasts()})`);
await page.waitForTimeout(2300); // autosave
check(await page.evaluate(() => localStorage.getItem("sb:sc:Bravo") !== null), "and Bravo now has real saved data");
await card("Alpha").click();
await page.waitForTimeout(500);
check((await active()) === "Alpha", "back on Alpha");

// ---------- storage full ----------
const filled = await page.evaluate(() => {
  let n = 0;
  for (const size of [200 * 1024, 20 * 1024, 2 * 1024, 256, 32]) {
    const chunk = "x".repeat(size);
    try { for (;;) { localStorage.setItem("filler" + n, chunk); n++; } } catch {}
  }
  return n;
});
check(filled > 0, `storage filled to the brim with ${filled} filler keys`);
await page.keyboard.press("Control+n");
await page.waitForTimeout(600);
const dialog = page.locator("[data-storage-dialog]");
check((await dialog.count()) === 1 && (await dialog.getAttribute("data-storage-reason")) === "full", "a refused write opens the STORAGE FULL dialog (reason: full)");
check((await toasts()).includes("could not be created"), `NEW is honest about it (${await toasts()})`);
check(!(await page.evaluate(() => JSON.parse(localStorage.getItem("sb:list")))).includes("Untitled"), "no ghost slot was listed");
const text = (await dialog.textContent()).replace(/\s+/g, " ");
check(text.includes("REWIND snapshots") && text.includes("Saved scenarios") && text.includes("safe to drop"), "the dialog shows what takes the space");
check((await dialog.locator('.dk-key.dk-primary').count()) === 0 && (await dialog.locator('.dk-holdable:has-text("FREE SPACE")').count()) === 1, "FREE SPACE is a hold key, not a one-click primary");
// a rename while full is refused and loses nothing
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const alphaBefore = await page.evaluate(() => localStorage.getItem("sb:sc:Alpha"));
await card("Alpha").locator('[title="Double-click to rename"]').dblclick();
await page.waitForTimeout(250);
await page.keyboard.type("Alpha renamed");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
check((await toasts()).includes("rename not saved") && (await page.evaluate(() => localStorage.getItem("sb:sc:Alpha"))) === alphaBefore && (await page.evaluate(() => JSON.parse(localStorage.getItem("sb:list")))).includes("Alpha"), `rename while full is refused and the scenario is untouched (${await toasts()})`);
await page.keyboard.press("Escape"); // leave the rename box
await page.waitForTimeout(200);
// an edit that no longer fits, then a slot switch: the unsaved slot stays open
await page.click('button:has-text("BUILD TFC")');
await page.waitForTimeout(400);
const manual = page.locator('.dk-tray.dk-open .dk-latch:has-text("MANUAL")');
if (await manual.count()) { await manual.click(); await page.waitForTimeout(300); }
await page.locator('.dk-tray.dk-open .dk-key:has-text("ADD AIRCRAFT"), .dk-tray.dk-open .dk-key:has-text("NEW AIRCRAFT"), .dk-tray.dk-open .dk-key:has-text("ADD ONE")').first().click();
await page.waitForTimeout(400);
await page.locator(".dk-drawer.dk-open input").first().fill("GROW1");
await page.locator('.dk-drawer.dk-open .dk-key.dk-primary:has-text("SAVE")').click();
await page.waitForTimeout(400);
await card("Bravo").click();
await page.waitForTimeout(400);
check((await active()) === "Alpha" && (await toasts()).includes("stays open"), `a slot switch while full is refused rather than dropping edits (${await toasts()})`);
// reopen the dialog (the minute's grace after LATER has not passed, so trigger it via the handler: wait it out is too slow — assert the grace instead)
await page.keyboard.press("Control+n");
await page.waitForTimeout(500);
check((await page.locator("[data-storage-dialog]").count()) === 0, "LATER is quiet for a minute even though writes are still refused");
await page.evaluate(() => { /* expire the grace period by rewinding Date.now for the app */ const real = Date.now; Date.now = () => real() + 61_000; });
await page.keyboard.press("Control+n");
await page.waitForTimeout(500);
check((await page.locator("[data-storage-dialog]").count()) === 1, "after the minute, a refused write reopens it");
// FREE SPACE (hold) drops the rings and saves again
await hold(dialog.locator('.dk-holdable:has-text("FREE SPACE")'));
check((await page.locator("[data-storage-dialog]").count()) === 0, "FREE SPACE closed the dialog");
check(await page.evaluate(() => localStorage.getItem("sb:snap:Alpha") === null), "the REWIND rings are gone");
check((await toasts()).includes("Freed") && (await toasts()).includes("saved"), `toast reports the freed space and the save (${await toasts()})`);
// now a new slot fits
await page.keyboard.press("Control+n");
await page.waitForTimeout(2600);
const list = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:list")));
const fresh = list.find((n) => n.startsWith("Untitled"));
check(!!fresh && (await page.evaluate((n) => localStorage.getItem("sb:sc:" + n) !== null, fresh)), "with space freed, a new slot is created AND saved");
check((await page.locator("[data-storage-dialog]").count()) === 0, "no dialog while writes succeed");
// ---------- deleting the active slot next to a ghost must not crash ----------
const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 940 } });
const p2 = await ctx2.newPage();
const errors2 = [];
p2.on("pageerror", (e) => errors2.push(String(e)));
await p2.addInitScript(
  `localStorage.setItem('sb:list', ${JSON.stringify(JSON.stringify(["Alpha", "Ghost", "Corrupt"]))});
   localStorage.setItem('sb:sc:Alpha', ${JSON.stringify(JSON.stringify({ ...base, name: "Alpha" }))});
   localStorage.setItem('sb:sc:Corrupt', '{"name":"Corrupt","aircraft":[{truncated');
   localStorage.setItem('sb:slotmeta', ${JSON.stringify(JSON.stringify({ active: "Alpha", meta: {} }))});`,
);
await p2.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await p2.waitForTimeout(700);
await p2.locator('[data-slot="Alpha"] [title="Slot actions"]').click({ force: true });
await p2.waitForTimeout(300);
const del = p2.locator('.sr-menu .dk-holdable:has-text("DELETE")');
const b = await del.boundingBox();
await p2.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p2.mouse.down(); await p2.waitForTimeout(800); await p2.mouse.up();
await p2.waitForTimeout(600);
check((await p2.locator("[data-crash-screen]").count()) === 0 && errors2.length === 0, `deleting the active slot next to a ghost and an unreadable slot does not crash (${errors2.join("; ")})`);
check((await p2.evaluate(() => JSON.parse(localStorage.getItem("sb:slotmeta")).active)) === "Ghost", "the never-saved slot is opened empty rather than the unreadable one");
// boot on a corrupt active slot: it is skipped and its bytes survive
await p2.evaluate(() => localStorage.setItem("sb:slotmeta", JSON.stringify({ active: "Corrupt", meta: {} })));
await p2.reload({ waitUntil: "networkidle" });
await p2.waitForTimeout(2800);
check((await p2.evaluate(() => JSON.parse(localStorage.getItem("sb:slotmeta")).active)) !== "Corrupt" && (await p2.evaluate(() => localStorage.getItem("sb:sc:Corrupt"))).startsWith('{"name":"Corrupt","aircraft":[{truncated'), "booting on an unreadable active slot opens another one and leaves its bytes alone");
await ctx2.close();

console.log("page errors:", errors);
if (errors.length) fail("page errors present");
await browser.close();
