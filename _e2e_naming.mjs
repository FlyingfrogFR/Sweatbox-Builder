// Export-naming e2e: the plate's CONVENTION / CUSTOM switch, driven through
// the real deck. Checks the filename the app would ship under, that the choice
// is per-slot, and that it survives a reload.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const ok = (m) => console.log("ok:", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const check = (c, m) => (c ? ok(m) : fail(m));

const base = { holdings: [], aircraft: [], rules: [], groundConfig: null, ils: [], controllers: [], airportAlt: 0 };
const A = { ...base, name: "LFBB_1_1_NORTH32" };
const B = { ...base, name: "Evening rush" };
// addInitScript runs on EVERY navigation, so seed only once — otherwise the
// reload below would overwrite what the app just saved and the persistence
// check would test the seed rather than the app.
await page.addInitScript(
  `if (!localStorage.getItem('sb:list')) {
   localStorage.setItem('sb:list', ${JSON.stringify(JSON.stringify(["LFBB_1_1_NORTH32", "Evening rush"]))});
   localStorage.setItem('sb:sc:LFBB_1_1_NORTH32', ${JSON.stringify(JSON.stringify(A))});
   localStorage.setItem('sb:sc:Evening rush', ${JSON.stringify(JSON.stringify(B))});
   localStorage.setItem('sb:slotmeta', ${JSON.stringify(JSON.stringify({ active: "LFBB_1_1_NORTH32", meta: {} }))});
   }`,
);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

const PLATE = 'button[title*="pseudo-pilot"]';
const plateText = async () => (await page.locator(PLATE).textContent())?.trim();
const titlebar = async () => (await page.locator("text=— Sweatbox Builder").first().textContent())?.trim();
const openPlate = async () => { await page.click(PLATE); await page.waitForTimeout(250); };
const closePlate = async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(200); };
const switchTo = async (n) => { await page.click(`[title="Switch to this slot"]:has-text("${n}")`); await page.waitForTimeout(500); };

// ---------- convention still works ----------
check((await plateText()) === "LFBB_1.1_NORTH32.txt", `convention name from the slot name (${await plateText()})`);

// ---------- switch to CUSTOM ----------
await openPlate();
check((await page.locator('.dk-latch:has-text("CONVENTION")').count()) === 1, "CONVENTION / CUSTOM switch is present");
await page.locator('.dk-latch:has-text("CUSTOM")').click();
await page.waitForTimeout(250);
check((await page.locator('input[placeholder^="LFBB north"]').count()) === 1, "custom mode shows a single file-name field");
check((await page.locator('input[placeholder="LFPG"]').count()) === 0, "the four token fields are hidden in custom mode");
check((await plateText()) === "— SET NAME —", "an empty custom name is not exportable yet");

await page.fill('input[placeholder^="LFBB north"]', "LFBB north — session 3");
await page.waitForTimeout(300);
check((await plateText()) === "LFBB north — session 3.txt", `typed name drives the plate (${await plateText()})`);
check((await titlebar())?.startsWith("LFBB north — session 3.txt"), `the titlebar follows too (${await titlebar()})`);

// dangerous input is sanitised, not accepted verbatim
await page.fill('input[placeholder^="LFBB north"]', "../../etc/passwd");
await page.waitForTimeout(300);
check((await plateText()) === "etcpasswd.txt", `path separators stripped (${await plateText()})`);

await page.fill('input[placeholder^="LFBB north"]', "LFBB north — session 3");
await page.waitForTimeout(300);
await closePlate();

// ---------- it is per-slot ----------
await switchTo("Evening rush");
check((await plateText()) === "— SET NAME —", `the other slot did NOT inherit the typed name (${await plateText()})`);
await openPlate();
check((await page.locator('.dk-latch.dk-on:has-text("CONVENTION")').count()) === 1, "the other slot is still on CONVENTION");
await closePlate();

await switchTo("LFBB_1_1_NORTH32");
check((await plateText()) === "LFBB north — session 3.txt", `the typed name came back with its slot (${await plateText()})`);

// ---------- it persists ----------
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:sc:LFBB_1_1_NORTH32") || "{}").exportSettings);
check(stored?.nameMode === "custom" && stored?.customName === "LFBB north — session 3", `pinned onto the slot payload (${JSON.stringify(stored?.nameMode)}/${JSON.stringify(stored?.customName)})`);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
check((await plateText()) === "LFBB north — session 3.txt", `survives a restart (${await plateText()})`);

// ---------- back to CONVENTION ----------
await openPlate();
await page.locator('.dk-latch:has-text("CONVENTION")').click();
await page.waitForTimeout(300);
check((await plateText()) === "LFBB_1.1_NORTH32.txt", `switching back restores the tokens (${await plateText()})`);
await closePlate();

console.log("page errors:", errors);
if (errors.length) fail("page errors present");
await browser.close();
