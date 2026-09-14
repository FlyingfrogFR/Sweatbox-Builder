// Pool sharing e2e: FPLN POOL → SHARE, driven through the real deck with the
// GitHub calls intercepted at the network layer (the web build uses
// window.fetch, so route interception covers every request the app makes).
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const ok = (m) => console.log("ok:", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const check = (c, m) => (c ? ok(m) : fail(m));

const GIST_ID = "8f3a21c9b4e7d6a5f0c1";
const entry = (cs) => ({ callsign: cs, type: "A320", origin: "LFPG", dest: "LFBO", route: "OKABO UT163 LMG", cruiseFL: 350, squawk: "1000" });
const seen = { publishBody: null, publishMethod: null, publishUrl: null };

await page.route("**/raw.githubusercontent.com/**", (route) => {
  const u = route.request().url();
  if (u.includes("/pools/index.json"))
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      pools: [
        { file: "lfbb-evening.json", name: "LFBB evening rush", description: "Bordeaux inbound push", airac: "2509", count: 2 },
        { file: "../../../etc/passwd", name: "path traversal attempt" },
      ],
    }) });
  if (u.includes("/pools/lfbb-evening.json"))
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ kind: "sweatbox-pool", pool: [entry("AFR11"), entry("KLM22")] }) });
  return route.fulfill({ status: 404, body: "no" });
});
await page.route("**/api.github.com/**", async (route) => {
  const req = route.request();
  const u = req.url();
  if (u.endsWith("/user"))
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ login: "flyingfrog" }) });
  if (u.includes("/gists/" + GIST_ID))
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      description: "Sweatbox Builder pool — shared by a colleague",
      files: { "pool.json": { content: JSON.stringify({ pool: [entry("BAW33"), entry("DLH44"), entry("EZY55")] }) } },
    }) });
  if (u.endsWith("/gists")) {
    seen.publishMethod = req.method();
    seen.publishUrl = u;
    seen.publishBody = JSON.parse(req.postData() || "{}");
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: GIST_ID, html_url: `https://gist.github.com/flyingfrog/${GIST_ID}` }) });
  }
  return route.fulfill({ status: 404, body: "no" });
});

// Seed a pool so PUBLISH has something to send.
await page.addInitScript(`localStorage.setItem('sb:pool', ${JSON.stringify(JSON.stringify([
  { id: "p1", addedAt: 111, source: "vatsim", ...entry("AFR99") },
]))}); localStorage.setItem('sb:poolairac', '"2509"');`);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

await page.click('button[title^="Real flight plans"]');
await page.waitForTimeout(400);
const tray = page.locator(".dk-tray.dk-open");
await tray.locator('.dk-latch:has-text("SHARE")').click();
await page.waitForTimeout(700);

// ---------- library ----------
let t = await tray.textContent();
check(t.includes("LFBB evening rush"), "library index rendered from the repo");
check(t.includes("AIRAC 2509"), "library card shows the AIRAC");
check(!t.includes("path traversal"), "malformed library filename rejected before display");

await tray.locator('.dk-key:has-text("LOAD")').first().click();
await page.waitForTimeout(500);
let pool = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:pool") || "[]"));
check(pool.length === 3, `library pool MERGED into the existing pool (${pool.length} entries)`);
check(pool.some((p) => p.callsign === "AFR99"), "the pre-existing entry survived the merge");
check(pool.some((p) => p.source === "library"), "loaded entries carry the LIBRARY source chip");

// ---------- import from link ----------
await tray.locator('input[placeholder^="sbx:"]').fill(`sbx:${GIST_ID}`);
await tray.locator('.dk-key:has-text("GET")').click();
await page.waitForTimeout(600);
pool = await page.evaluate(() => JSON.parse(localStorage.getItem("sb:pool") || "[]"));
check(pool.length === 6, `share code imported and merged (${pool.length} entries)`);
check(pool.some((p) => p.callsign === "BAW33" && p.source === "shared"), "shared entries carry the SHARED chip");

// ---------- publish: token gate ----------
t = await tray.textContent();
check(t.includes("PERSONAL ACCESS TOKEN"), "publish is gated behind a token");
await tray.locator('input[placeholder^="github_pat_"]').fill("not-a-token");
await tray.locator('.dk-key:has-text("SAVE TOKEN")').click();
await page.waitForTimeout(300);
const toasts = (await page.locator(".dk-toast").allTextContents()).join(" | ");
check(toasts.includes("GitHub token"), `a bad token is rejected client-side (toasts: ${toasts})`);
check(seen.publishUrl === null, "no network call was made for the bad token");

await tray.locator('input[placeholder^="github_pat_"]').fill("github_pat_" + "A".repeat(40));
await tray.locator('.dk-key:has-text("SAVE TOKEN")').click();
await page.waitForTimeout(600);
t = await tray.textContent();
check(t.includes("TOKEN SAVED") && t.includes("flyingfrog"), "token verified and the account shown");

// ---------- publish ----------
await tray.locator('input[placeholder="LFBB evening rush"]').fill("LFBB north 32");
await tray.locator('.dk-key:has-text("PUBLISH POOL")').click();
await page.waitForTimeout(700);
check(seen.publishMethod === "POST", `published via POST (${seen.publishMethod})`);
check(!!seen.publishBody?.files?.["pool.json"], "payload carries pool.json");
check(seen.publishBody?.public === false, "published as a SECRET gist");
const published = JSON.parse(seen.publishBody.files["pool.json"].content);
check(published.pool.length === 6, `all ${published.pool.length} entries published`);
const keys = Object.keys(published.pool[0]).sort().join(",");
check(keys === "callsign,cruiseFL,dest,origin,route,squawk,type", `local bookkeeping stripped (${keys})`);
check(!JSON.stringify(published).includes("p1"), "local ids never leave the machine");
check(!JSON.stringify(published).includes("vatsim"), "source labels never leave the machine");
t = await tray.textContent();
check(t.includes(`sbx:${GIST_ID}`), "share code shown after publishing");
check(t.includes("UPDATE sbx:"), "re-publish in place is offered once a code exists");

const stored = await page.evaluate(() => localStorage.getItem("sb:ghtoken"));
check(!!stored && stored.includes("github_pat_"), "token stored under its own dedicated key");

console.log("page errors:", errors);
if (errors.length) fail("page errors present");
await browser.close();
