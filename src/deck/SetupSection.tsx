// SetupSection.tsx — deck-native scenario frame (SETUP → SCENARIO). Replaces
// the legacy slate-styled SetupPanel inside FLIGHTDECK: one scrollable column
// of four blocks (SCENARIO · ILS · CONTROLLERS · HOLDINGS), each with its
// "+ ADD …" key in the header and a deck table below.
//
// Same data contract as the classic panel — it only ever calls onChange with a
// new scenario object. Two behaviours are deliberately different:
//   1. Prerequisites are VISIBLE but disabled with an inline reason. The legacy
//      panel hid the runway helper and the ESE picker entirely when no navdata
//      was loaded, so the features looked like they didn't exist.
//   2. The holding-fix check is an inline amber note per row, not a title=""
//      tooltip nobody hovers.
import { useState, useEffect, useMemo, useId } from "react";
import { Icon } from "../ui/Icon";
import { DeckKey, Latch, RATINGS } from "./ui";
import { uid } from "../core/uid";

const INPUT =
  "h-8 bg-inset border border-bd3 rounded-md px-2.5 font-mono text-[12px] text-tx1 outline-none focus:border-cy-fg disabled:opacity-45 disabled:cursor-not-allowed";
// Coordinate/heading fields: spinner arrows are useless at 7 decimals and easy
// to hit by accident, so they're suppressed.
const NUM = `${INPUT} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;
const LABEL = "block text-[9.5px] font-bold tracking-[0.1em] text-tx8 mb-1";
const HEAD = "text-[11px] font-extrabold tracking-[0.14em] text-tx6";
const TH = "text-left px-3 py-2";

/** A titled block: header row (count + hint + "+ ADD" key) over its rows. */
function Block({ title, count, hint, action, children }: any) {
  return (
    <section className="bg-panel border border-bd1 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-bd1 bg-inset">
        <span className={HEAD}>{title}</span>
        {count !== undefined && <span className="font-mono text-[11px] text-tx8">{count}</span>}
        {hint && <span className="text-[10.5px] text-tx7 min-w-0 truncate">{hint}</span>}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

/** Inline reason a control is disabled — amber, with a route to the fix. */
function Prereq({ children, onGoNavdata }: any) {
  return (
    <div className="flex items-center gap-2 mt-2.5 text-[11px] text-am-fg">
      <span className="flex-none">
        <Icon name="alert" size={13} />
      </span>
      <span>{children}</span>
      {onGoNavdata && (
        <DeckKey size="sm" onClick={onGoNavdata} title="Jump to the NAVDATA section">
          OPEN NAVDATA
        </DeckKey>
      )}
    </div>
  );
}

function Hint({ children }: any) {
  return <div className="mt-2.5 text-[10.5px] text-tx7">{children}</div>;
}

function Empty({ children }: any) {
  return (
    <div className="px-3.5 py-7 text-center text-[11.5px] text-tx7">{children}</div>
  );
}

function DelKey({ onClick, title }: any) {
  return (
    <button onClick={onClick} title={title} className="text-tx8 hover:text-rd-fg transition-colors align-middle">
      <Icon name="trash" size={13} />
    </button>
  );
}

export function SetupSection({
  scenario,
  onChange,
  positions = [],
  runways = [],
  waypoints = [],
  toast,
  onGoNavdata,
}: any) {
  const ils = scenario.ils || [];
  const controllers = scenario.controllers || [];
  const holdings = scenario.holdings || [];
  const rating = scenario.rating || null;
  const dl = useId();

  const set = (f: string, v: any) => onChange({ ...scenario, [f]: v });
  const patch = (key: string, list: any[], i: number, next: any) => {
    const a = [...list];
    a[i] = { ...a[i], ...next };
    onChange({ ...scenario, [key]: a });
  };
  const drop = (key: string, list: any[], i: number) =>
    onChange({ ...scenario, [key]: list.filter((_: any, j: number) => j !== i) });

  // ---------- ILS ----------
  const setIls = (i: number, f: string, v: any) => patch("ils", ils, i, { [f]: f === "name" ? v : +v });
  const addBlankIls = () =>
    onChange({ ...scenario, ils: [...ils, { name: "", lat1: 0, lon1: 0, lat2: 0, lon2: 0, id: uid() }] });

  const [ilsApt, setIlsApt] = useState("");
  const [ilsRwy, setIlsRwy] = useState("");
  const [ilsName, setIlsName] = useState("");
  const rwyAirports = useMemo(() => [...new Set((runways || []).map((r: any) => r.airport))].sort(), [runways]);
  const rwyList = useMemo(() => {
    if (!ilsApt) return [];
    const out: any[] = [];
    for (const r of (runways || []).filter((r: any) => r.airport === ilsApt)) {
      out.push({ key: `${r.airport}|${r.ident1}`, ident: r.ident1 });
      out.push({ key: `${r.airport}|${r.ident2}`, ident: r.ident2 });
    }
    return out;
  }, [runways, ilsApt]);
  useEffect(() => {
    if (!ilsRwy) {
      setIlsName("");
      return;
    }
    const [, id] = ilsRwy.split("|");
    setIlsName(id);
  }, [ilsRwy]);
  // Navdata cleared while a runway was picked — don't keep a dead selection.
  useEffect(() => {
    if (!(runways || []).length) {
      setIlsApt("");
      setIlsRwy("");
    }
  }, [runways]);

  const hasRunways = (runways || []).length > 0;
  const canAddFromRwy = !!ilsRwy && !!ilsName.trim();
  function addIlsFromRwy() {
    if (!canAddFromRwy) return;
    const [apt, id] = ilsRwy.split("|");
    const rwy = (runways || []).find((r: any) => r.airport === apt && (r.ident1 === id || r.ident2 === id));
    if (!rwy) return toast?.(`Runway ${id} is no longer in the loaded navdata`, "err");
    // Point 1 is the approach threshold, point 2 the far end — flipped when the
    // reciprocal ident was picked.
    const fwd = rwy.ident1 === id;
    const line = {
      name: ilsName.trim(),
      lat1: fwd ? rwy.lat1 : rwy.lat2,
      lon1: fwd ? rwy.lon1 : rwy.lon2,
      lat2: fwd ? rwy.lat2 : rwy.lat1,
      lon2: fwd ? rwy.lon2 : rwy.lon1,
      id: uid(),
    };
    onChange({ ...scenario, ils: [...ils, line] });
    toast?.(`ILS <b class="font-mono">${line.name}</b> added from ${apt} runway data`, "ok");
    setIlsRwy("");
    setIlsName("");
  }

  // ---------- controllers ----------
  const addCtrl = () => onChange({ ...scenario, controllers: [...controllers, { callsign: "", freq: "", id: uid() }] });
  const [pickPos, setPickPos] = useState("");
  useEffect(() => {
    if (!(positions || []).length) setPickPos("");
  }, [positions]);
  const posByKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of positions || []) m.set(`${p.callsign}|${p.freq}`, p);
    return m;
  }, [positions]);
  const posByCallsign = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of positions || []) m.set(String(p.callsign || "").toUpperCase(), p);
    return m;
  }, [positions]);
  const positionOptions = useMemo(
    () =>
      (positions || []).map((p: any) => (
        <option key={`${p.callsign}|${p.freq}`} value={`${p.callsign}|${p.freq}`}>
          {p.callsign} · {p.freq}
        </option>
      )),
    [positions],
  );
  function addCtrlFromEse() {
    const p = posByKey.get(pickPos);
    if (!p) return;
    onChange({ ...scenario, controllers: [...controllers, { callsign: p.callsign, freq: p.freq, id: uid() }] });
    toast?.(`<b class="font-mono">${p.callsign}</b> · ${p.freq} added`, "ok");
    setPickPos("");
  }
  // Free text always wins. An exact ESE match fills the frequency when the row
  // has none, or when the frequency it has was itself taken from the position
  // being replaced (so retyping TWR → APP re-tunes) — a hand-typed frequency is
  // never silently overwritten.
  function setCallsign(i: number, v: string) {
    const cur = controllers[i] || {};
    const match = posByCallsign.get(v.trim().toUpperCase());
    const prev = posByCallsign.get(String(cur.callsign || "").trim().toUpperCase());
    const freq = String(cur.freq || "").trim();
    const inherit = match && (!freq || (prev && String(prev.freq) === freq));
    patch("controllers", controllers, i, { callsign: v, ...(inherit ? { freq: match.freq } : null) });
  }

  // ---------- holdings ----------
  const addHold = () =>
    onChange({ ...scenario, holdings: [...holdings, { fix: "", inboundCourse: 0, turn: "R", id: uid() }] });
  const wptNames = useMemo(
    () => new Set((waypoints || []).map((w: any) => String(w.name || "").toUpperCase())),
    [waypoints],
  );
  const navLoaded = wptNames.size > 0;
  const unknownFixes = holdings.filter((h: any) => h.fix && navLoaded && !wptNames.has(String(h.fix).toUpperCase()));

  return (
    <div className="p-4 flex flex-col gap-3.5">
      {/* ============================ SCENARIO ============================ */}
      <Block title="SCENARIO" hint="the frame every generated aircraft lands in">
        <div className="px-3.5 py-3 flex items-end gap-3 flex-wrap">
          <div>
            <label className={LABEL}>SCENARIO NAME</label>
            <input
              value={scenario.name || ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="LFPG APP — evening rush"
              className={`${INPUT} w-[300px]`}
            />
          </div>
          <div>
            <label className={LABEL}>AIRPORT ALTITUDE (FT)</label>
            <input
              type="number"
              step="0.1"
              value={scenario.airportAlt ?? 0}
              onChange={(e) => set("airportAlt", +e.target.value)}
              className={`${NUM} w-[140px]`}
            />
          </div>
          <span className="text-[10.5px] text-tx7 pb-2">
            name titles the export file · altitude writes{" "}
            <span className="font-mono text-tx5">AIRPORT_ALT</span> at the top of the .scn
          </span>
        </div>
        <div className="px-3.5 py-3 border-t border-bd1 bg-inset/40">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9.5px] font-bold tracking-[0.1em] text-tx8 select-none">TARGET RATING</span>
            {RATINGS.map((r) => (
              <Latch
                key={r}
                size="md"
                on={rating === r}
                onClick={() => set("rating", rating === r ? null : r)}
                title={rating === r ? "Clear target rating" : `Set target rating ${r}`}
              >
                {r}
              </Latch>
            ))}
          </div>
          <Hint>Tags the session's student rating — shows on the slot card and steers the deck's hints.</Hint>
        </div>
      </Block>

      {/* ============================== ILS ============================== */}
      <Block
        title="ILS"
        count={ils.length}
        hint="localiser lines drawn for the approach"
        action={
          <DeckKey size="sm" onClick={addBlankIls} title="Add an empty ILS line and type the coordinates yourself">
            <Icon name="plus" size={12} />
            ADD BLANK ILS
          </DeckKey>
        }
      >
        {/* runway helper — always visible, disabled with a reason when there's
            no sector file to read thresholds from */}
        <div className="px-3.5 py-3 border-b border-bd1 bg-inset/40">
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className={LABEL}>AIRPORT</label>
              <select
                value={ilsApt}
                disabled={!hasRunways}
                onChange={(e) => {
                  setIlsApt(e.target.value);
                  setIlsRwy("");
                }}
                className={`${INPUT} w-[120px]`}
              >
                <option value="">— airport —</option>
                {rwyAirports.map((a: any) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>RUNWAY</label>
              <select
                value={ilsRwy}
                disabled={!hasRunways || !ilsApt}
                onChange={(e) => setIlsRwy(e.target.value)}
                className={`${INPUT} w-[120px]`}
              >
                <option value="">— runway —</option>
                {rwyList.map((o: any, i: number) => (
                  <option key={`${o.key}-${i}`} value={o.key}>
                    {o.ident}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>ILS NAME</label>
              <input
                value={ilsName}
                disabled={!hasRunways}
                onChange={(e) => setIlsName(e.target.value)}
                placeholder="26L"
                className={`${INPUT} w-[110px]`}
              />
            </div>
            <DeckKey
              size="sm"
              tone="cy"
              disabled={!hasRunways || !canAddFromRwy}
              onClick={addIlsFromRwy}
              title="Copy both threshold coordinates straight from the sector file"
            >
              <Icon name="plus" size={12} />
              ADD ILS FROM RUNWAY
            </DeckKey>
          </div>
          {hasRunways ? (
            <Hint>
              Thresholds come straight from the .sct runway coordinates — the picked end first, the far end second.
            </Hint>
          ) : (
            <Prereq onGoNavdata={onGoNavdata}>Load a .sct in NAVDATA first — runway coordinates live there.</Prereq>
          )}
        </div>

        {ils.length ? (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[11.5px]">
              <thead className="sticky top-0 bg-thead text-tx7">
                <tr className="text-[9.5px] tracking-[0.1em]">
                  <th className={TH}>NAME</th>
                  <th className={TH}>THRESHOLD LAT</th>
                  <th className={TH}>THRESHOLD LON</th>
                  <th className={TH}>FAR END LAT</th>
                  <th className={TH}>FAR END LON</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {ils.map((l: any, i: number) => (
                  <tr key={l.id ?? i} className={`border-t border-rowdiv ${i % 2 ? "bg-inset/50" : ""}`}>
                    <td className="px-3 py-1.5">
                      <input
                        value={l.name || ""}
                        onChange={(e) => setIls(i, "name", e.target.value)}
                        placeholder="26L"
                        className={`${INPUT} w-[92px]`}
                      />
                    </td>
                    {["lat1", "lon1", "lat2", "lon2"].map((f) => (
                      <td key={f} className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.0000001"
                          value={l[f] ?? 0}
                          onChange={(e) => setIls(i, f, e.target.value)}
                          className={`${NUM} w-[132px]`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right">
                      <DelKey onClick={() => drop("ils", ils, i)} title={`Remove ILS ${l.name || "line"}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            No ILS lines yet — pick a runway above, or add a blank line and paste the coordinates.
          </Empty>
        )}
      </Block>

      {/* ========================== CONTROLLERS ========================== */}
      <Block
        title="CONTROLLERS"
        count={controllers.length}
        hint="written as CONTROLLER:callsign:frequency"
        action={
          <DeckKey size="sm" onClick={addCtrl} title="Add an empty controller row">
            <Icon name="plus" size={12} />
            ADD CONTROLLER
          </DeckKey>
        }
      >
        {/* ESE picker — visible even with no .ese so it's clear the list exists */}
        <div className="px-3.5 py-3 border-b border-bd1 bg-inset/40">
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className={LABEL}>ESE POSITION</label>
              <select
                value={pickPos}
                disabled={!(positions || []).length}
                onChange={(e) => setPickPos(e.target.value)}
                className={`${INPUT} w-[260px]`}
              >
                <option value="">— pick a parsed position —</option>
                {positionOptions}
              </select>
            </div>
            <DeckKey
              size="sm"
              tone="cy"
              disabled={!pickPos}
              onClick={addCtrlFromEse}
              title="Add this position as a controller, callsign and frequency filled in"
            >
              <Icon name="plus" size={12} />
              ADD FROM ESE
            </DeckKey>
            {(positions || []).length > 0 && (
              <span className="font-mono text-[10.5px] text-tx7 pb-2">{positions.length} positions parsed</span>
            )}
          </div>
          {(positions || []).length ? (
            <Hint>Callsigns below also suggest these positions — anything you type by hand still works.</Hint>
          ) : (
            <Prereq onGoNavdata={onGoNavdata}>
              No .ese loaded — the position list is empty, so type callsigns and frequencies by hand below.
            </Prereq>
          )}
        </div>

        {controllers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-[11.5px]">
              <thead className="sticky top-0 bg-thead text-tx7">
                <tr className="text-[9.5px] tracking-[0.1em]">
                  <th className={TH}>CALLSIGN</th>
                  <th className={TH}>FREQUENCY</th>
                  <th className={TH}>OUTPUT</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {controllers.map((c: any, i: number) => (
                  <tr key={c.id ?? i} className={`border-t border-rowdiv ${i % 2 ? "bg-inset/50" : ""}`}>
                    <td className="px-3 py-1.5">
                      <input
                        value={c.callsign || ""}
                        list={(positions || []).length ? dl : undefined}
                        onChange={(e) => setCallsign(i, e.target.value)}
                        placeholder="LFPG_TWR"
                        className={`${INPUT} w-[200px]`}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={c.freq || ""}
                        onChange={(e) => patch("controllers", controllers, i, { freq: e.target.value })}
                        placeholder="119.250"
                        className={`${INPUT} w-[130px]`}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-tx6">
                      {c.callsign || c.freq ? `CONTROLLER:${c.callsign || "?"}:${c.freq || "?"}` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <DelKey
                        onClick={() => drop("controllers", controllers, i)}
                        title={`Remove ${c.callsign || "controller"}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id={dl}>
              {(positions || []).map((p: any) => (
                <option key={`${p.callsign}|${p.freq}`} value={p.callsign}>
                  {p.freq}
                </option>
              ))}
            </datalist>
          </div>
        ) : (
          <Empty>No controllers — the scenario runs with pseudo-pilot only.</Empty>
        )}
      </Block>

      {/* ============================ HOLDINGS ============================ */}
      <Block
        title="HOLDINGS"
        count={holdings.length}
        hint="published holds over a fix"
        action={
          <DeckKey size="sm" onClick={addHold} title="Add a holding pattern">
            <Icon name="plus" size={12} />
            ADD HOLDING
          </DeckKey>
        }
      >
        {holdings.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[11.5px]">
                <thead className="sticky top-0 bg-thead text-tx7">
                  <tr className="text-[9.5px] tracking-[0.1em]">
                    <th className={TH}>FIX</th>
                    <th className={TH}>INBOUND °</th>
                    <th className={TH}>TURN</th>
                    <th className={TH}>FIX CHECK</th>
                    <th className={TH}>OUTPUT</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h: any, i: number) => {
                    const fix = String(h.fix || "");
                    const known = fix ? wptNames.has(fix.toUpperCase()) : false;
                    const bad = !!fix && navLoaded && !known;
                    return (
                      <tr key={h.id ?? i} className={`border-t border-rowdiv ${i % 2 ? "bg-inset/50" : ""}`}>
                        <td className="px-3 py-1.5">
                          <input
                            value={fix}
                            onChange={(e) => patch("holdings", holdings, i, { fix: e.target.value.toUpperCase() })}
                            placeholder="OKABO"
                            className={`${INPUT} w-[120px] ${bad ? "border-am-bd" : ""}`}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="359"
                            value={h.inboundCourse ?? 0}
                            onChange={(e) => patch("holdings", holdings, i, { inboundCourse: +e.target.value })}
                            className={`${NUM} w-[84px]`}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex gap-1">
                            <Latch
                              size="md"
                              on={h.turn !== "L"}
                              onClick={() => patch("holdings", holdings, i, { turn: "R" })}
                              title="Right turns (standard)"
                            >
                              ↻ RIGHT
                            </Latch>
                            <Latch
                              size="md"
                              tone="pu"
                              on={h.turn === "L"}
                              onClick={() => patch("holdings", holdings, i, { turn: "L" })}
                              title="Left turns (non-standard)"
                            >
                              ↺ LEFT
                            </Latch>
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          {!fix ? (
                            <span className="text-tx8">—</span>
                          ) : !navLoaded ? (
                            <span className="text-tx8">unchecked · no navdata</span>
                          ) : known ? (
                            <span className="inline-flex items-center gap-1.5 text-gn-fg">
                              <Icon name="check" size={12} />
                              in navdata
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-am-fg">
                              <Icon name="alert" size={12} />
                              not in navdata
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-tx6">
                          {fix ? `HOLDING:${fix}:${+h.inboundCourse || 0}:${h.turn === "L" ? -1 : 1}` : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <DelKey onClick={() => drop("holdings", holdings, i)} title={`Remove holding ${fix}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-3.5 py-2.5 border-t border-bd1 flex flex-col gap-2">
              {unknownFixes.length > 0 && (
                <div className="flex items-start gap-2 text-[11px] text-am-fg bg-am-bg border border-am-bd rounded-lg px-3 py-2">
                  <span className="mt-px flex-none">
                    <Icon name="alert" size={13} />
                  </span>
                  <span>
                    {unknownFixes.length} holding fix{unknownFixes.length !== 1 ? "es are" : " is"} not in the loaded
                    navdata —{" "}
                    <span className="font-mono">
                      {unknownFixes
                        .slice(0, 6)
                        .map((h: any) => h.fix)
                        .join(" · ")}
                      {unknownFixes.length > 6 ? " …" : ""}
                    </span>
                    . EuroScope drops a HOLDING line whose fix it can't resolve.
                  </span>
                </div>
              )}
              {!navLoaded && (
                <Prereq onGoNavdata={onGoNavdata}>
                  Fix names aren't checked until a .sct is loaded in NAVDATA — holds still export as typed.
                </Prereq>
              )}
              <div className="text-[10.5px] text-tx7">
                Exports as <span className="font-mono text-tx5">HOLDING:&lt;fix&gt;:&lt;inbound&gt;:&lt;-1|1&gt;</span>{" "}
                (−1 = left, 1 = right).
              </div>
            </div>
          </>
        ) : (
          <Empty>
            No holdings defined — add one to publish a hold over a fix.
          </Empty>
        )}
      </Block>
    </div>
  );
}
