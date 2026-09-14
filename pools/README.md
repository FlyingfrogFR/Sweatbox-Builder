# Shared pool library

Every file here is a flight-plan pool that Sweatbox Builder lists under
**FPLN POOL → SHARE → LIBRARY**, ready to load in one click. The app reads
`index.json` from `main` at runtime, so a merged pull request is live for
everyone within about five minutes (raw.githubusercontent caches for five).

## Contributing a pool

1. In the app, build the pool you want to share, then **FPLN POOL → POOL →
   EXPORT POOL**. That gives you a `sweatbox-pool` JSON file.
2. Drop it in this folder with a descriptive lower-case name, e.g.
   `lfbb-evening-rush.json`.
3. Add an entry to `index.json`:

   ```json
   {
     "file": "lfbb-evening-rush.json",
     "name": "LFBB evening rush",
     "description": "Bordeaux UAC inbound push, 1800–2000z",
     "airac": "2509",
     "count": 312,
     "author": "your vACC or callsign"
   }
   ```

   `file` and `name` are required; the rest is what the library card shows.
4. Open a pull request.

## What a pool file must contain

A `sweatbox-pool` export, or a bare array of entries. Only these fields are
read — anything else is dropped on import, so strip nothing by hand:

| field      | meaning                                  |
| ---------- | ---------------------------------------- |
| `callsign` | required; an entry without one is skipped |
| `type`     | ICAO aircraft type                        |
| `origin`   | departure ICAO                            |
| `dest`     | destination ICAO                          |
| `route`    | filed route string                        |
| `cruiseFL` | filed level, e.g. `350`                   |
| `squawk`   | four digits, defaults to `1000`           |

## Don't want to open a pull request?

Use **PUBLISH** in the same tray instead. It puts the pool in a secret GitHub
Gist and gives you an `sbx:…` code to paste to whoever needs it — no review, no
waiting. The library is for pools worth keeping around; codes are for sharing
one session's traffic with a colleague.
