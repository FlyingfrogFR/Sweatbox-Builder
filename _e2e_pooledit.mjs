// Pool edit + copy e2e (7.9.0): FPLN POOL → POOL, driven through the real deck.
// Checks the pencil opens the row in place with validation, that a copy is
// the WHOLE entry under the next free A–Z callsign placed right after its
// original, the footer COPY ×N over a selection, and that it all persists.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const ok = (m) => console.log("ok:", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const check = (c, m) => (c ? ok(m) : fail(m));

const entry = (id, cs, extra = {}) => ({ id, addedAt: 111, source: "vatsim", callsign: cs, type: "A320", origin: "LFPG", dest: "LFBO", route: "OKABO UT163 LMG", cruiseFL: 350, squawk: "1000", ...extra });
const SEED = [
  entry("p1", "AFR1234", { remarks: "RMK/TCAS" }), // an imported field the app does not know about
  entry("p2", "KLM44", { source: "simbrief", type: "B738", origin: "EHAM", dest: "LIRF" }),
  entry("p3", "BAW12A", { source: "manual" }),
];
await page.addInitScript(
  `if (!localStorage.getItem('sb:pool')) {
     localStorage.setItem('sb:pool', ${JSON.stringify(JSON.stringify(SEED))});
     localStorage.setItem('sb:poolairac', '"2509"');
   }`,
);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.click('button[title^="Real flight plans"]');
await page.waitForTimeout(500);
const tray = page.locator(".dk-tray.dk-open");
const rows = () => tray.locator("table tbody tr");
const pool = () => page.evaluate(() => JSON.parse(localStorage.getItem("sb:pool") || "[]"));
const callsigns = async () => (await pool()).map((p) => p.callsign);
const row = (cs) => rows().filter({ has: page.locator(`td:nth-child(2):text-is("${cs}")`) });
const toasts = async () => (await page.locator(".dk-toast").allTextContents()).join(" | ");

// ---------- row actions exist ----------
check((await rows().count()) === 3, "three seeded rows");
check((await tray.locator('button[aria-label="Edit AFR1234"]').count()) === 1, "a pencil per row");
check((await tray.locator('button[aria-label="Copy AFR1234"]').getAttribute("title")) === "Copy → AFR123A", "copy tooltip previews the callsign it will mint");
check((await tray.locator('button[aria-label="Copy BAW12A"]').getAttribute("title")) === "Copy → BAW12B", "a letter-ending callsign skips its own letter");

// ---------- one copy from the row ----------
const t0 = await page.evaluate(() => Date.now());
await tray.locator('button[aria-label="Copy AFR1234"]').click();
await page.waitForTimeout(400);
let cs = await callsigns();
check(cs.join(",") === "AFR1234,AFR123A,KLM44,BAW12A", `copy lands right after its original (${cs.join(",")})`);
let p = await pool();
const orig = p[0], copy = p[1];
check(copy.remarks === "RMK/TCAS" && copy.route === orig.route && copy.squawk === orig.squawk && copy.type === orig.type && copy.source === "vatsim", "the copy is the WHOLE entry — including a field the app never defined");
check(copy.id && copy.id !== orig.id && copy.addedAt >= t0 && copy.addedAt !== orig.addedAt, "fresh id and a timestamp from the copy's own moment");
check((await rows().filter({ has: page.locator("input[type=checkbox]:checked") }).count()) === 0, "a copy of an unselected row is not selected");
check((await toasts()).includes("AFR1234") && (await toasts()).includes("AFR123A"), `toast names the minted callsign (${await toasts()})`);
await tray.locator('button[aria-label="Copy AFR1234"]').click();
await page.waitForTimeout(400);
cs = await callsigns();
check(cs.join(",") === "AFR1234,AFR123B,AFR123A,KLM44,BAW12A", `second copy takes the next free letter (${cs.join(",")})`);
check((await tray.locator('button[aria-label="Copy AFR123A"]').getAttribute("title")) === "Copy → AFR123C", "copying a copy continues the family, not a new one");

// ---------- edit in place ----------
await tray.locator('button[aria-label="Edit KLM44"]').click();
await page.waitForTimeout(300);
const edit = tray.locator("tr[data-pool-edit]");
check((await edit.count()) === 1, "the row opened in place");
check(!(await edit.getAttribute("class")).includes("bg-cy-row"), "an editor on an unselected row does not borrow the selection tint");
check((await edit.locator('input[aria-label^="CALLSIGN"]').getAttribute("aria-describedby")) === null, "no error, no description");
const csBox = edit.locator('input[aria-label^="CALLSIGN"]');
check(await csBox.evaluate((el) => document.activeElement === el), "callsign box has focus");
check((await csBox.inputValue()) === "KLM44", "fields are pre-filled");
await csBox.fill("AFR123A");
await page.waitForTimeout(200);
check((await edit.textContent()).includes("AFR123A is already in the pool"), "a taken callsign is refused with the reason");
check(await edit.locator('input[aria-label^="CALLSIGN"]').evaluate((el) => document.getElementById(el.getAttribute("aria-describedby") || "")?.textContent?.includes("already in the pool")), "the reason is tied to the box for screen readers");
check(await edit.locator('.dk-key:has-text("SAVE")').isDisabled(), "SAVE is dead while a field is wrong");
await csBox.press("Enter");
await page.waitForTimeout(200);
check((await edit.count()) === 1 && (await callsigns()).includes("KLM44"), "Enter does nothing while the entry is wrong");
await csBox.fill("klm 45");
await edit.locator('input[aria-label^="TYPE"]').fill("b738-x");
await edit.locator('input[aria-label^="FL"]').fill("360");
await edit.locator('input[aria-label^="SQUAWK"]').fill("1800");
await edit.locator('textarea[aria-label^="ROUTE"]').fill("  a   b  c ");
await page.waitForTimeout(200);
check((await edit.textContent()).includes("Four octal digits"), "squawk 1800 is refused (octal)");
check((await edit.textContent()).includes("Letters and digits only"), "a hyphen in the type is refused, not silently dropped");
await edit.locator('input[aria-label^="SQUAWK"]').fill("2000");
await edit.locator('input[aria-label^="TYPE"]').fill("b738");
await page.waitForTimeout(200);
check(!(await edit.locator('.dk-key:has-text("SAVE")').isDisabled()), "SAVE comes alive once every field is right");
// the edited row stays on screen even when a filter would now hide it
await tray.locator('input[placeholder="DEP"]').fill("LFPG");
await page.waitForTimeout(250);
check((await tray.locator("tr[data-pool-edit]").count()) === 1 && (await rows().count()) === 5, `a filter change does not throw away the half-edited row (${await rows().count()} rows)`);
await tray.locator('input[placeholder="DEP"]').fill("");
await page.waitForTimeout(250);
await edit.locator('textarea[aria-label^="ROUTE"]').press("Enter");
await page.waitForTimeout(400);
check((await tray.locator("tr[data-pool-edit]").count()) === 0, "Enter saves and closes the row");
p = await pool();
const k = p.find((e) => e.id === "p2");
check(!!k && k.callsign === "KLM45" && k.type === "B738" && k.cruiseFL === 360 && k.squawk === "2000" && k.route === "A B C", `saved, normalised (${JSON.stringify({ c: k?.callsign, t: k?.type, fl: k?.cruiseFL, sq: k?.squawk, r: k?.route })})`);
check(k.source === "simbrief" && k.addedAt === 111 && k.origin === "EHAM", "identity, source, timestamp and untouched fields survive an edit");
check((await row("KLM45").count()) === 1, "the table shows the new callsign");

// ---------- a dirty draft is never thrown away by a second pencil ----------
await tray.locator('button[aria-label="Edit AFR1234"]').click();
await page.waitForTimeout(200);
await tray.locator('button[aria-label="Edit BAW12A"]').click(); // clean draft → swaps
await page.waitForTimeout(200);
check((await tray.locator("tr[data-pool-edit]").getAttribute("data-pool-edit")) === "p3", "a clean draft swaps to the other row");
await tray.locator('input[aria-label^="TYPE"]').fill("A321");
await tray.locator('button[aria-label="Edit AFR1234"]').click(); // dirty → refused
await page.waitForTimeout(200);
check((await tray.locator("tr[data-pool-edit]").getAttribute("data-pool-edit")) === "p3" && (await toasts()).includes("Save or cancel"), "a dirty draft stays open and the toast says why");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// ---------- keyboard edges ----------
await tray.locator('button[aria-label="Edit AFR1234"]').click();
await page.waitForTimeout(200);
await tray.locator('input[aria-label^="CALLSIGN"]').fill("ZZZ111");
await tray.locator('.dk-key:has-text("CANCEL")').focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(250);
check((await tray.locator("tr[data-pool-edit]").count()) === 0 && !(await callsigns()).includes("ZZZ111"), "Enter on a focused CANCEL cancels — it does not save");
await tray.locator('button[aria-label="Edit AFR1234"]').click();
await page.waitForTimeout(200);
await tray.locator('input[aria-label^="TYPE"]').fill("A319");
await tray.locator('input[placeholder="Callsign"]').focus(); // focus leaves the row, stays in the tray
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check((await page.locator(".dk-tray.dk-open").count()) === 1 && (await tray.locator("tr[data-pool-edit]").count()) === 0, "Escape anywhere in the tray closes the row first, not the tray");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check((await page.locator(".dk-tray.dk-open").count()) === 0, "the next Escape is the deck's — the tray closes");
await page.click('button[title^="Real flight plans"]');
await page.waitForTimeout(400);
await tray.locator('button[aria-label="Edit AFR1234"]').click();
await page.waitForTimeout(200);
await tray.locator('input[aria-label^="TYPE"]').fill("A321");
await tray.locator('.dk-key:has-text("DONE")').click(); // tray closed with a dirty row open
await page.waitForTimeout(300);
await page.keyboard.press("Escape"); // the hidden row must not eat this
await page.waitForTimeout(200);
await page.click('button[title^="Real flight plans"]');
await page.waitForTimeout(400);
check((await tray.locator("tr[data-pool-edit]").count()) === 1 && (await tray.locator('input[aria-label^="TYPE"]').inputValue()) === "A321", "DONE with a dirty row keeps the draft for when the tray comes back");
await tray.locator('.dk-latch:has-text("VATSIM")').click();
await page.waitForTimeout(250);
await tray.locator('input[placeholder="LFPG"]').first().focus();
await page.keyboard.press("Escape"); // in another section: the deck's Escape, not the hidden row's
await page.waitForTimeout(300);
check((await page.locator(".dk-tray.dk-open").count()) === 0, "Escape in another section is the deck's — the tray closes, the hidden draft is not touched");
await page.click('button[title^="Real flight plans"]');
await page.waitForTimeout(400);
check((await tray.locator("tr[data-pool-edit]").count()) === 1 && (await tray.locator('input[aria-label^="TYPE"]').inputValue()) === "A321", "and the draft is still there");
await tray.locator('.dk-key:has-text("CANCEL")').click();
await page.waitForTimeout(200);
check(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Edit AFR1234"), "after closing the row, focus returns to its pencil");
await tray.locator('button[aria-label="Edit AFR1234"]').click();
await page.waitForTimeout(200);
await tray.locator('input[aria-label^="TYPE"]').fill("A319");
await tray.locator('.dk-latch:has-text("VATSIM")').click();
await page.waitForTimeout(250);
await tray.locator('.dk-latch:has-text("POOL")').click();
await page.waitForTimeout(250);
check((await tray.locator("tr[data-pool-edit]").count()) === 1 && (await tray.locator('input[aria-label^="TYPE"]').inputValue()) === "A319", "a look at another section keeps the draft");
await tray.locator('input[aria-label^="TYPE"]').press("Escape");
await page.waitForTimeout(200);

// ---------- escape cancels ----------
await tray.locator('button[aria-label="Edit AFR1234"]').click();
await page.waitForTimeout(200);
await tray.locator('input[aria-label^="CALLSIGN"]').fill("ZZZ999");
await tray.locator('input[aria-label^="CALLSIGN"]').press("Escape");
await page.waitForTimeout(300);
check((await tray.locator("tr[data-pool-edit]").count()) === 0 && (await callsigns()).includes("AFR1234") && !(await callsigns()).includes("ZZZ999"), "Escape discards the draft");
check((await tray.count()) === 1 && (await rows().count()) === 5, `Escape closed the row, NOT the tray (${await rows().count()} rows still shown)`);

// ---------- a callsign filter must not swallow the copies ----------
await tray.locator('input[placeholder="Callsign"]').fill("AFR");
await page.waitForTimeout(250);
await tray.locator('button[aria-label="Copy AFR123A"]').click();
await page.waitForTimeout(400);
check((await tray.locator('input[placeholder="Callsign"]').inputValue()) === "AFR" && !(await toasts()).includes("filter cleared"), "a filter the copies still match is left alone");
await tray.locator('input[placeholder="Callsign"]').fill("KLM45");
await page.waitForTimeout(250);
check((await rows().count()) === 1, "filtered down to the one row");
await tray.locator('button[aria-label="Copy KLM45"]').click();
await page.waitForTimeout(400);
check((await tray.locator('input[placeholder="Callsign"]').inputValue()) === "" && (await rows().count()) === 7, "the callsign filter is cleared so the fresh copy is visible");
check((await toasts()).includes("filter cleared"), `and the toast says so (${await toasts()})`);
check((await page.locator(".dk-toast.dk-ok").allTextContents()).some((t) => t.includes("filter cleared")), "the filter note is informational, not amber");
check((await callsigns()).includes("KLM4A"), "KLM45 → KLM4A");

// ---------- footer COPY ×N over the VISIBLE selection ----------
check((await tray.locator('.dk-key:has-text("COPY")').count()) === 0, "no COPY key in the footer without a selection");
await row("AFR1234").locator("td").nth(1).click();
await row("BAW12A").locator("td").nth(1).click();
await row("KLM4A").locator("td").nth(1).click();
await page.waitForTimeout(200);
await tray.locator('input[placeholder="DEP"]').fill("LFPG"); // hides KLM4A (EHAM), which stays selected
await page.waitForTimeout(250);
const copyKey = tray.locator('.dk-key:has-text("COPY 2")');
check((await copyKey.textContent()).replace(/\s+/g, " ").trim() === "COPY 2", `footer key counts only the selected rows you can see (${await copyKey.textContent()})`);
const footerText = (await page.locator(".dk-tray.dk-open > div:last-child").textContent()).replace(/\s+/g, " ");
check(footerText.includes("DELETE 2") && footerText.includes("ADD 2 TO BOARD"), `DELETE and ADD count the same visible selection (${footerText.trim().slice(0, 90)})`);
check((await copyKey.getAttribute("title")).includes("adds 2 entries"), "its tooltip says how many entries it adds");
const n = tray.locator('input[aria-label="Copies per selected entry"]');
await n.fill("99");
await page.waitForTimeout(150);
check((await n.inputValue()) === "99" && (await copyKey.getAttribute("title")).includes("adds 50 entries"), "the box keeps what you type while focused, the action already uses the clamped 25");
await n.blur();
await page.waitForTimeout(150);
check((await n.inputValue()) === "25", "and settles to 25 on blur");
await n.fill("0");
await n.blur();
await page.waitForTimeout(150);
check((await n.inputValue()) === "1", "count clamps to at least 1");
await n.focus();
await n.press("Backspace");
await n.type("3");
await page.waitForTimeout(150);
check((await n.inputValue()) === "3", "backspace then 3 is 3, not 13");
await tray.locator('.dk-key:has-text("COPY 2")').click();
await page.waitForTimeout(500);
cs = await callsigns();
check(cs.join(",") === "AFR1234,AFR123D,AFR123E,AFR123F,AFR123B,AFR123A,AFR123C,KLM45,KLM4A,BAW12A,BAW12B,BAW12C,BAW12D", `three copies of each VISIBLE selected row, A/B/C skipped as taken, each family after its original, hidden KLM4A untouched (${cs.join(",")})`);
check((await toasts()).includes("6 copies of 2 entries"), `toast summarises a batch (${await toasts()})`);
check(new Set(cs).size === cs.length, "no duplicate callsign anywhere in the pool");
check((await pool()).filter((e) => e.callsign.startsWith("AFR123")).every((e) => e.remarks === "RMK/TCAS"), "every AFR copy carries the imported remark");
await tray.locator('input[placeholder="DEP"]').fill("");
await page.waitForTimeout(250);
const board = tray.locator('.dk-key.dk-lever:has-text("TO BOARD")');
check((await board.textContent()).replace(/\s+/g, " ").includes("ADD 9 TO BOARD"), `copies of selected rows join the selection — straight to ADD n TO BOARD (${await board.textContent()})`);
check((await rows().filter({ has: page.locator('input[type=checkbox]:checked') }).count()) === 9, "nine rows show as selected");
check((await rows().count()) === 13, "thirteen rows in all");

// ---------- persists across a reload ----------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);
check((await callsigns()).length === 13, "the pool survives a restart with its copies");

console.log("page errors:", errors);
if (errors.length) fail("page errors present");
await browser.close();
