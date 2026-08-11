// Tone-system e2e: computed-color assertions + christmas-tree budget guard.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const ok = (m) => console.log("ok:", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const color = (loc) => loc.evaluate((el) => getComputedStyle(el).color);
const isCyan = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return b > r && g > r && g > 100; };

// --- SETUP > NAVDATA: LOAD (cy) vs PASTE (neutral) ---
await page.click('button:has-text("SETUP")');
await page.waitForTimeout(350);
const tray = page.locator(".dk-tray.dk-open");
const loadKey = tray.locator('.dk-key:has-text("LOAD .SCT")').first();
const pasteKey = tray.locator('.dk-key:has-text("PASTE")').first();
const cLoad = await color(loadKey), cPaste = await color(pasteKey);
isCyan(cLoad) ? ok("LOAD .SCT is cyan-preferred (" + cLoad + ")") : fail("LOAD .SCT not cyan: " + cLoad);
cLoad !== cPaste ? ok("LOAD vs PASTE differentiated (" + cPaste + ")") : fail("LOAD and PASTE identical");
const cImp = await color(tray.locator('.dk-key:has-text("IMPORT NAVDATA")').first());
const cExp = await color(tray.locator('.dk-key:has-text("EXPORT NAVDATA")').first());
isCyan(cImp) && cImp !== cExp ? ok("IMPORT NAVDATA cy vs EXPORT neutral") : fail("IMPORT/EXPORT NAVDATA not differentiated: " + cImp + " / " + cExp);

// --- SETUP > SCENARIO: holdings glyph pair ↺ LEFT (pu) / ↻ RIGHT (neutral) ---
await page.click('.dk-tray.dk-open .dk-latch:has-text("SCENARIO")');
await page.waitForTimeout(300);
await page.click('.dk-tray.dk-open .dk-key:has-text("ADD HOLDING")');
await page.waitForTimeout(300);
let t = await tray.textContent();
t.includes("↺ LEFT") ? ok("holding latch has ↺ LEFT glyph") : fail("missing ↺ LEFT");
t.includes("↻ RIGHT") ? ok("holding latch has ↻ RIGHT glyph") : fail("missing ↻ RIGHT");
const leftLatch = tray.locator('.dk-latch:has-text("LEFT")').first();
await leftLatch.click();
await page.waitForTimeout(200);
const cLeftOn = await color(leftLatch);
const [lr, lg, lb] = cLeftOn.match(/\d+/g).map(Number);
lr > 120 && lb > 120 && lg < lr ? ok("↺ LEFT latch reads purple when on (" + cLeftOn + ")") : fail("LEFT-on not purple: " + cLeftOn);

// --- Christmas-tree budget: visible cy keys per open tray ≤ 3 distinct clusters ---
for (const [btn, section] of [["SETUP", null], ["FPLN POOL", null], ["BUILD TFC", null]]) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await page.click(`button:has-text("${btn}")`);
  await page.waitForTimeout(350);
  const cyTexts = await page.locator(".dk-tray.dk-open .dk-key.dk-tone-cy:visible").allTextContents();
  // Repeated identical patterns (3 SourceCards' LOAD keys) count as one cluster per TONES.md rule 1.
  const clusters = new Set(cyTexts.map((s) => s.replace(/\s+/g, " ").trim().split(" ")[0]));
  clusters.size <= 3 ? ok(`${btn}: ${cyTexts.length} cy keys, ${clusters.size} distinct (≤3)`) : fail(`${btn}: too many cy clusters: ${[...clusters].join(", ")}`);
  const primaries = await page.locator(".dk-tray.dk-open .dk-primary:visible").count();
  primaries <= 1 ? ok(`${btn}: ${primaries} filled primary lever (≤1)`) : fail(`${btn}: ${primaries} primaries visible`);
}

// --- FPLN POOL: IMPORT POOL cy vs EXPORT POOL neutral; FETCH keys back to neutral ---
await page.keyboard.press("Escape");
await page.waitForTimeout(250);
await page.click('button:has-text("FPLN POOL")');
await page.waitForTimeout(350);
t = await page.locator(".dk-tray.dk-open").textContent();
if (t.includes("IMPORT POOL")) {
  const ci = await color(page.locator('.dk-tray.dk-open .dk-key:has-text("IMPORT POOL")').first());
  isCyan(ci) ? ok("IMPORT POOL cyan (" + ci + ")") : fail("IMPORT POOL not cyan: " + ci);
}
await page.click('.dk-tray.dk-open .dk-latch:has-text("SIMBRIEF")');
await page.waitForTimeout(250);
const fetchCy = await page.locator('.dk-tray.dk-open .dk-key.dk-tone-cy:has-text("FETCH")').count();
fetchCy === 0 ? ok("FETCH keys neutral (lone keys carry no cy)") : fail("FETCH still cy");

// --- Light theme: toned key labels must clear WCAG AA 4.5:1 on their tinted face (TONES.md rule 13) ---
await page.keyboard.press("Escape");
await page.waitForTimeout(250);
await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
await page.waitForTimeout(200);
await page.click('button:has-text("SETUP")');
await page.waitForTimeout(350);
const contrast = await page.locator('.dk-tray.dk-open .dk-key:has-text("LOAD .SCT")').first().evaluate((el) => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const parse = (s) => s.match(/[\d.]+/g).map(Number);
  const cs = getComputedStyle(el);
  const fg = parse(cs.color).slice(0, 3);
  const bg = parse(cs.backgroundColor); // rgba tint — blend over the base surface
  const base = parse(getComputedStyle(document.documentElement).getPropertyValue("--btn2").trim().split(" ").join(","));
  const a = bg.length > 3 ? bg[3] : 1;
  const face = base.map((c, i) => c * (1 - a) + bg[i] * a);
  const [l1, l2] = [lum(fg), lum(face)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
});
contrast >= 4.5 ? ok("light-theme LOAD key contrast " + contrast.toFixed(2) + ":1 (AA)") : fail("light-theme contrast " + contrast.toFixed(2) + " < 4.5");
await page.evaluate(() => { delete document.documentElement.dataset.theme; });

// --- Disabled toned control is neutral (TONES.md rule 8) + primary uses --primary-bg token ---
const probe = await page.evaluate(() => {
  const mk = (cls, dis) => { const b = document.createElement("button"); b.className = cls; b.textContent = "X"; if (dis) b.disabled = true; document.body.appendChild(b); return getComputedStyle(b).color; };
  const disabledToned = mk("dk-key dk-sm dk-tone-arr", true);
  const enabledToned = mk("dk-key dk-sm dk-tone-arr", false);
  const neutral = mk("dk-key dk-sm", true);
  const b = document.createElement("button"); b.className = "dk-key dk-primary"; document.body.appendChild(b);
  const primaryBg = getComputedStyle(b).backgroundColor;
  return { disabledToned, enabledToned, neutral, primaryBg };
});
probe.disabledToned === probe.neutral && probe.disabledToned !== probe.enabledToned
  ? ok("disabled toned key drops to neutral (" + probe.disabledToned + ")")
  : fail("disabled tone not neutralized: " + JSON.stringify(probe));
probe.primaryBg === "rgb(92, 207, 224)" ? ok("primary lever uses --primary-bg token") : fail("primary bg unexpected: " + probe.primaryBg);

if (errors.length) fail("page errors: " + errors.join(" | "));
await browser.close();
console.log(process.exitCode ? "TONE E2E FAILED" : "TONE E2E PASSED");
