import { chromium } from "playwright-core";
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await (
  await b.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 })
).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
const ok = (m) => console.log("ok:", m);
const fail = (m) => {
  console.error("FAIL:", m);
  process.exitCode = 1;
};

// stub the VATSIM endpoint so the test is deterministic and offline
await page.route("**/vatsim-data.json", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      pilots: [
        {
          callsign: "IBE1",
          latitude: 45,
          flight_plan: {
            departure: "LEMD",
            arrival: "LFPG",
            aircraft_short: "A320",
            route: "DCT",
            altitude: "36000",
          },
        },
        {
          callsign: "VLG2",
          latitude: 45,
          flight_plan: {
            departure: "LEBL",
            arrival: "LFBO",
            aircraft_short: "A20N",
            route: "DCT",
            altitude: "34000",
          },
        },
        {
          callsign: "BAW4",
          latitude: 45,
          flight_plan: {
            departure: "EGLL",
            arrival: "LFPG",
            aircraft_short: "A319",
            route: "DCT",
            altitude: "30000",
          },
        },
      ],
      prefiles: [],
    }),
  }),
);
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.click('button:has-text("FPLN POOL")');
await page.waitForTimeout(400);
const tray = page.locator(".dk-tray.dk-open");
await tray.locator('.dk-latch:has-text("VATSIM")').click();
await page.waitForTimeout(300);

let t = await tray.textContent();
t.includes("PAIRING") ? ok("PAIRING latch present") : fail("no PAIRING latch");
t.includes("AIRPORT ICAO") ? ok("single-airport mode still default") : fail("default mode changed");

await tray.locator('.dk-latch:has-text("PAIRING")').click();
await page.waitForTimeout(300);
t = await tray.textContent();
t.includes("FROM") && t.includes("TO") ? ok("FROM/TO endpoints shown") : fail("no FROM/TO");
t.includes("AIRPORT ICAO")
  ? fail("single ICAO input still visible in pairing mode")
  : ok("single ICAO input hidden");

// country dropdown lists the requested "LE** — Spain" format
const opts = await tray.locator("select").first().locator("option").allTextContents();
opts.some((o) => o.startsWith("LE** — Spain"))
  ? ok('country list shows "LE** — Spain"')
  : fail("country label wrong: " + opts.slice(0, 4).join("|"));
opts.some((o) => o.startsWith("K*** — United States"))
  ? ok("single-letter prefixes render as K***")
  : fail("K*** missing");

// Spain -> France via the country picker on both ends
await tray.locator("select").first().selectOption("LE");
await page.waitForTimeout(200);
await tray.locator("select").nth(1).selectOption("LF");
await page.waitForTimeout(200);
t = await tray.textContent();
t.includes("LE** — Spain") && t.includes("LF** — France")
  ? ok("both ends set by country")
  : fail("endpoint hints wrong");

await tray.locator('.dk-key:has-text("FETCH")').first().click();
await page.waitForTimeout(800);
t = await tray.textContent();
t.includes("IBE1") && t.includes("VLG2")
  ? ok("Spain→France returned both Spanish departures")
  : fail("pairing results wrong");
t.includes("BAW4")
  ? fail("UK departure leaked into Spain→France")
  : ok("UK departure correctly excluded");
/LE\*\* — Spain → LF\*\* — France · 2 found/.test(t)
  ? ok("status line names the pairing and count")
  : fail("status line: " + (t.match(/found[^·]*/) || [""])[0]);

// country -> specific airport
await tray
  .locator("select")
  .nth(1)
  .selectOption({ index: 0 })
  .catch(() => {});
const toInput = tray.locator('input[placeholder="anywhere"]').nth(1);
await toInput.fill("LFPG");
await page.waitForTimeout(200);
await tray.locator('.dk-key:has-text("FETCH")').first().click();
await page.waitForTimeout(800);
t = await tray.textContent();
t.includes("IBE1") && !t.includes("VLG2")
  ? ok("Spain→LFPG narrowed to the one flight")
  : fail("country→airport wrong");

if (errs.length) fail("page errors: " + errs.join(" | "));
await b.close();
console.log(process.exitCode ? "PAIRING E2E FAILED" : "PAIRING E2E PASSED");
