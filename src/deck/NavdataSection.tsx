// NavdataSection.tsx — deck-native navdata (SETUP → NAVDATA). Replaces the
// legacy slate-styled NavdataPanel inside FLIGHTDECK: source cards with real
// drag & drop, a count strip, and one filtered data explorer instead of four
// stacked tables. Same parsing and callbacks as the classic panel — only the
// surface changed. This is the one place with more than one import button
// (sector file, ESE file, RampAgent, navdata bundle), so each says exactly
// what it takes.
import { useState, useEffect, useMemo, useRef } from "react";
import { Icon } from "../ui/Icon";
import { DeckKey, HoldKey, Latch } from "./ui";
import { parseSectorFile } from "../parsers/sct";
import { parseESE } from "../parsers/ese";
import { parseRampAgent } from "../core/ramp";
import { downloadJsonBundle, readJsonFile, readTextFile } from "../io/bundles";
import { wrongKindMessage } from "../state/bundleKind";

type Explorer = "waypoints" | "gates" | "stars" | "ramp";

const fmtTs = (ts: number) =>
  ts
    ? new Date(ts).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

function CountCard({ label, value, on }: { label: string; value: number | string; on?: boolean }) {
  return (
    <div className="bg-inset border border-bd1 rounded-lg px-3 py-2">
      <div className={`font-mono text-[17px] leading-none ${on ? "text-tx1" : "text-tx8"}`}>{value}</div>
      <div className="text-[9px] font-bold tracking-[0.1em] text-tx8 mt-1.5">{label}</div>
    </div>
  );
}

/** A file source: drag & drop zone + load key + optional paste fallback. */
function SourceCard({
  title,
  hint,
  accept,
  loaded,
  summary,
  parsedAt,
  onFile,
  onPaste,
  onClear,
  pastePlaceholder,
  multiple = false,
  loadLabel,
}: any) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) onFile(multiple ? files : [files[0]]);
      }}
      className={`rounded-xl border transition-colors ${
        over
          ? "border-cy-fg bg-cy-soft"
          : loaded
            ? "border-gn-bd bg-gn-bg/40"
            : "border-dashed border-bd4 bg-inset/40"
      }`}
    >
      <div className="p-3.5">
        {/* row 1 — identity + actions */}
        <div className="flex items-center gap-3">
          <span className={loaded ? "text-gn-fg" : "text-tx7"}>
            <Icon name={loaded ? "check" : "database"} size={16} />
          </span>
          <span className="text-[12.5px] font-semibold text-tx1 flex-1 min-w-0 truncate">{title}</span>
          <div className="flex items-center gap-1.5 flex-none">
            <DeckKey size="sm" tone="cy" onClick={() => inputRef.current?.click()}>
              <Icon name="upload" size={12} />
              {loadLabel}
            </DeckKey>
            {onPaste && (
              <DeckKey size="sm" onClick={() => setPasting((v) => !v)} title="Paste the file contents instead">
                PASTE
              </DeckKey>
            )}
            {loaded && onClear && (
              <HoldKey onHold={onClear} title="Hold to clear this data">
                CLEAR
              </HoldKey>
            )}
          </div>
        </div>
        {/* row 2 — full width, so counts and timestamps never fight the keys */}
        <div className="mt-1.5 pl-[28px] text-[10.5px] leading-snug">
          {loaded ? (
            <span className="flex items-baseline gap-2 flex-wrap">
              <span className="font-mono text-gn-fg">{summary}</span>
              {parsedAt && <span className="text-tx8">· parsed {parsedAt}</span>}
            </span>
          ) : (
            <span className="text-tx7">{hint}</span>
          )}
        </div>
      </div>
      {pasting && onPaste && (
        <div className="px-3.5 pb-3.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={pastePlaceholder}
            className="w-full h-28 bg-inset border border-bd3 rounded-lg p-2.5 font-mono text-[11px] text-tx2 outline-none focus:border-cy-fg"
          />
          <div className="flex gap-2 mt-2">
            <DeckKey
              size="sm"
              onClick={() => {
                if (!text.trim()) return;
                onPaste(text);
                setText("");
                setPasting(false);
              }}
            >
              PARSE PASTED
            </DeckKey>
            <DeckKey size="sm" onClick={() => setPasting(false)}>
              CANCEL
            </DeckKey>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length) onFile(files);
        }}
      />
    </div>
  );
}

export function NavdataSection({
  waypoints,
  airports,
  positions,
  runways,
  stars,
  copx,
  gates,
  navMeta,
  airac,
  onSetAirac,
  onParseSct,
  onParseEse,
  onResetSct,
  onResetEse,
  onImportBundle,
  rampAgent,
  rampConfig,
  onLoadRampAgent,
  onLoadRampConfig,
  onResetRampAgent,
  toast,
}: any) {
  const [airacInput, setAiracInput] = useState(airac || "");
  useEffect(() => setAiracInput(airac || ""), [airac]);
  const [explorer, setExplorer] = useState<Explorer>("waypoints");
  const [filter, setFilter] = useState("");
  const bundleRef = useRef<HTMLInputElement>(null);
  useEffect(() => setFilter(""), [explorer]);

  const rampAirports = useMemo(() => Object.keys(rampAgent || {}).sort(), [rampAgent]);
  const f = filter.trim().toUpperCase();

  const rows = useMemo(() => {
    if (explorer === "waypoints")
      return (f ? waypoints.filter((w: any) => w.name.includes(f)) : waypoints).slice(0, 300);
    if (explorer === "gates")
      return (
        f ? gates.filter((g: any) => g.icao.includes(f) || String(g.label).toUpperCase().includes(f)) : gates
      ).slice(0, 300);
    if (explorer === "stars")
      return (
        f
          ? stars.filter((s: any) =>
              [s.airport, s.runway, s.name, s.iaf].some((x: any) => String(x || "").toUpperCase().includes(f)),
            )
          : stars
      ).slice(0, 300);
    return (f ? rampAirports.filter((i) => i.includes(f)) : rampAirports).slice(0, 300);
  }, [explorer, f, waypoints, gates, stars, rampAirports]);

  // ---------- loaders ----------
  async function loadSector(files: File[]) {
    const file = files[0];
    try {
      const text = await readTextFile(file);
      if (!text.trim()) return toast(`${file.name} is empty`, "warn");
      const r = parseSectorFile(text);
      if (!r.waypoints.length && !r.airports.length && !r.runways.length)
        return toast(`Parsed ${file.name} but found nothing — is it a valid .sct?`, "warn");
      onParseSct(r);
      toast(
        `<b>${file.name}</b> — ${r.waypoints.length} waypoints · ${r.airports.length} airports · ${r.runways.length} runways`,
        "ok",
      );
    } catch (err: any) {
      toast(`Failed to parse ${file.name}: ${err.message || err}`, "err");
    }
  }
  async function loadEse(files: File[]) {
    const file = files[0];
    try {
      const text = await readTextFile(file);
      if (!text.trim()) return toast(`${file.name} is empty`, "warn");
      const r = parseESE(text);
      onParseEse(r);
      toast(
        `<b>${file.name}</b> — ${r.positions.length} positions · ${r.stars.length} STARs · ${r.copx.length} COPX · ${r.gates.length} gates`,
        "ok",
      );
    } catch (err: any) {
      toast(`Failed to parse ${file.name}: ${err.message || err}`, "err");
    }
  }
  async function loadRamp(files: File[]) {
    let airportCount = 0,
      configCount = 0,
      failCount = 0;
    await Promise.all(
      files.map(async (file) => {
        try {
          const json = await readJsonFile(file);
          const parsed = parseRampAgent(json);
          if (parsed.kind === "config") {
            onLoadRampConfig(parsed);
            configCount++;
          } else {
            onLoadRampAgent(parsed);
            airportCount++;
          }
        } catch {
          failCount++;
        }
      }),
    );
    const parts = [];
    if (airportCount) parts.push(`${airportCount} airport${airportCount !== 1 ? "s" : ""}`);
    if (configCount) parts.push("config.json");
    if (failCount) parts.push(`${failCount} failed`);
    toast("RampAgent: " + (parts.join(" · ") || "nothing loaded"), failCount && !airportCount ? "err" : "ok");
  }
  async function importNavBundle(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const bundle = await readJsonFile(file);
      const wrong = wrongKindMessage(bundle, "navdata");
      if (wrong) return toast(wrong, "warn");
      onImportBundle(bundle);
      toast(`Navdata imported${bundle.airac ? ` (AIRAC ${bundle.airac})` : ""}`, "ok");
    } catch (err: any) {
      toast("Import failed: " + (err.message || err), "err");
    }
  }
  function exportBundle() {
    downloadJsonBundle("navdata.json", {
      kind: "sweatbox-navdata",
      version: 1,
      airac: airac || "",
      exportedAt: new Date().toISOString(),
      navMeta,
      waypoints,
      airports,
      positions,
      runways,
      stars,
      copx,
      gates,
    });
    toast("Exported <b class='font-mono'>navdata.json</b>", "ok");
  }

  const hasNav = waypoints.length > 0 || positions.length > 0;
  const tab = (id: Explorer, label: string, n: number) => (
    <Latch on={explorer === id} onClick={() => setExplorer(id)}>
      {label} <b className="font-mono">{n}</b>
    </Latch>
  );

  return (
    <div className="p-4 flex flex-col gap-3.5">
      {/* ===== AIRAC + bundle ===== */}
      <div className="flex items-center gap-3 flex-wrap bg-panel border border-bd1 rounded-xl px-3.5 py-2.5">
        <span className="text-[9.5px] font-bold tracking-[0.1em] text-tx8">AIRAC</span>
        <input
          value={airacInput}
          onChange={(e) => setAiracInput(e.target.value)}
          onBlur={() => onSetAirac(airacInput.trim())}
          onKeyDown={(e: any) => e.key === "Enter" && e.target.blur()}
          placeholder="2511"
          className="w-[86px] bg-inset border border-bd3 rounded-md px-2 py-1.5 font-mono text-[12px] text-tx1 outline-none focus:border-cy-fg"
        />
        <span className="text-[10.5px] text-tx7">tags this navdata everywhere it's used</span>
        <span className="flex-1" />
        <DeckKey size="sm" onClick={exportBundle} disabled={!hasNav} title="Save all parsed navdata as one navdata.json">
          <Icon name="download" size={12} />
          EXPORT NAVDATA
        </DeckKey>
        <DeckKey size="sm" tone="cy" onClick={() => bundleRef.current?.click()} title="Load a previously exported navdata.json">
          <Icon name="upload" size={12} />
          IMPORT NAVDATA
        </DeckKey>
        <input ref={bundleRef} type="file" accept=".json,application/json" className="hidden" onChange={importNavBundle} />
      </div>

      {/* ===== sources ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <SourceCard
          title="Sector file (.sct)"
          hint="FIXES · VOR · NDB · AIRPORT · RUNWAY — drop the file here"
          accept=".sct,.txt,text/plain"
          loadLabel="LOAD .SCT"
          loaded={waypoints.length > 0}
          summary={`${waypoints.length} wpts · ${airports.length} apt · ${runways.length} rwy`}
          parsedAt={fmtTs(navMeta?.sctAt)}
          onFile={loadSector}
          onPaste={(t: string) => {
            const r = parseSectorFile(t);
            onParseSct(r);
            toast(`Parsed — ${r.waypoints.length} waypoints · ${r.airports.length} airports`, "ok");
          }}
          onClear={onResetSct}
          pastePlaceholder={"[FIXES]\nMOPIL N050.13.53.000 E004.07.49.000"}
        />
        <SourceCard
          title="ESE file (.ese)"
          hint="POSITIONS · SIDSSTARS · COPX · gates — drop the file here"
          accept=".ese,.txt,text/plain"
          loadLabel="LOAD .ESE"
          loaded={positions.length > 0}
          summary={`${positions.length} pos · ${stars.length} STARs · ${copx.length} COPX · ${gates.length} gates`}
          parsedAt={fmtTs(navMeta?.eseAt)}
          onFile={loadEse}
          onPaste={(t: string) => {
            const r = parseESE(t);
            onParseEse(r);
            toast(`Parsed — ${r.positions.length} positions · ${r.stars.length} STARs`, "ok");
          }}
          onClear={onResetEse}
          pastePlaceholder={"[POSITIONS]\nLFPG_TWR:..."}
        />
      </div>

      <SourceCard
        title="RampAgent stands (optional)"
        hint="vaCC France JSON — config.json gives wingspans, per-airport files give stands. Drop several at once."
        accept=".json,application/json"
        loadLabel="LOAD RAMPAGENT"
        multiple
        loaded={rampAirports.length > 0 || !!rampConfig}
        summary={`${rampAirports.length} airport${rampAirports.length !== 1 ? "s" : ""}${
          rampConfig ? ` · config (${Object.keys(rampConfig.aircraftWingspans || {}).length} types)` : ""
        }`}
        onFile={loadRamp}
        onClear={onResetRampAgent}
      />
      {!rampConfig && rampAirports.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-am-fg bg-am-bg border border-am-bd rounded-lg px-3 py-2">
          <Icon name="alert" size={13} />
          Airports loaded but no <span className="font-mono">config.json</span> — wingspan checks fall back to WTC values.
        </div>
      )}

      {/* ===== counts ===== */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
        <CountCard label="WAYPOINTS" value={waypoints.length} on={waypoints.length > 0} />
        <CountCard label="AIRPORTS" value={airports.length} on={airports.length > 0} />
        <CountCard label="RUNWAYS" value={runways.length} on={runways.length > 0} />
        <CountCard label="POSITIONS" value={positions.length} on={positions.length > 0} />
        <CountCard label="STARS" value={stars.length} on={stars.length > 0} />
        <CountCard label="COPX" value={copx.length} on={copx.length > 0} />
        <CountCard label="GATES" value={gates.length} on={gates.length > 0} />
        <CountCard label="RAMP" value={rampAirports.length || (rampConfig ? "cfg" : 0)} on={!!rampConfig || rampAirports.length > 0} />
      </div>

      {/* ===== data explorer ===== */}
      <div className="bg-panel border border-bd1 rounded-xl overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-bd1 bg-inset flex-wrap">
          {tab("waypoints", "WAYPOINTS", waypoints.length)}
          {tab("gates", "GATES", gates.length)}
          {tab("stars", "STARS", stars.length)}
          {tab("ramp", "RAMP", rampAirports.length)}
          <span className="flex-1" />
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx8 pointer-events-none">
              <Icon name="search" size={13} />
            </span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="w-[190px] bg-inset border border-bd3 rounded-md pl-8 pr-2.5 py-1.5 font-mono text-[11.5px] text-tx2 outline-none focus:border-cy-fg"
            />
          </div>
        </div>

        <div className="max-h-[300px] overflow-auto">
          <table className="w-full font-mono text-[11.5px]">
            <thead className="sticky top-0 bg-thead text-tx7">
              <tr className="text-[9.5px] tracking-[0.1em]">
                {explorer === "waypoints" && (
                  <>
                    <th className="text-left px-3 py-2">NAME</th>
                    <th className="text-left px-3 py-2">TYPE</th>
                    <th className="text-right px-3 py-2">LAT</th>
                    <th className="text-right px-3 py-2">LON</th>
                  </>
                )}
                {explorer === "gates" && (
                  <>
                    <th className="text-left px-3 py-2">ICAO</th>
                    <th className="text-left px-3 py-2">STAND</th>
                    <th className="text-right px-3 py-2">LAT</th>
                    <th className="text-right px-3 py-2">LON</th>
                  </>
                )}
                {explorer === "stars" && (
                  <>
                    <th className="text-left px-3 py-2">AIRPORT</th>
                    <th className="text-left px-3 py-2">RUNWAY</th>
                    <th className="text-left px-3 py-2">NAME</th>
                    <th className="text-left px-3 py-2">ENTRY FIX</th>
                  </>
                )}
                {explorer === "ramp" && (
                  <>
                    <th className="text-left px-3 py-2">ICAO</th>
                    <th className="text-right px-3 py-2">STANDS</th>
                    <th className="text-right px-3 py-2">WITH WINGSPAN</th>
                    <th className="text-right px-3 py-2">CODE F</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i} className={`border-t border-rowdiv ${i % 2 ? "bg-inset/50" : ""}`}>
                  {explorer === "waypoints" && (
                    <>
                      <td className="px-3 py-1.5 text-tx1 font-semibold">{r.name}</td>
                      <td className="px-3 py-1.5 text-tx7">{r.type}</td>
                      <td className="px-3 py-1.5 text-tx4 text-right">{r.lat.toFixed(5)}</td>
                      <td className="px-3 py-1.5 text-tx4 text-right">{r.lon.toFixed(5)}</td>
                    </>
                  )}
                  {explorer === "gates" && (
                    <>
                      <td className="px-3 py-1.5 text-cy-fg font-semibold">{r.icao}</td>
                      <td className="px-3 py-1.5 text-tx1">{r.label}</td>
                      <td className="px-3 py-1.5 text-tx4 text-right">{r.lat.toFixed(5)}</td>
                      <td className="px-3 py-1.5 text-tx4 text-right">{r.lon.toFixed(5)}</td>
                    </>
                  )}
                  {explorer === "stars" && (
                    <>
                      <td className="px-3 py-1.5 text-tx2">{r.airport}</td>
                      <td className="px-3 py-1.5 text-tx4">{r.runway}</td>
                      <td className="px-3 py-1.5 text-cy-fg">{r.name}</td>
                      <td className="px-3 py-1.5 text-gn-fg">{r.iaf}</td>
                    </>
                  )}
                  {explorer === "ramp" && (
                    <>
                      <td className="px-3 py-1.5 text-cy-fg font-semibold">{r}</td>
                      <td className="px-3 py-1.5 text-tx2 text-right">{rampAgent[r].stands.length}</td>
                      <td className="px-3 py-1.5 text-tx4 text-right">
                        {rampAgent[r].stands.filter((s: any) => s.wingspan !== null).length}
                      </td>
                      <td className="px-3 py-1.5 text-tx4 text-right">
                        {rampAgent[r].stands.filter((s: any) => s.code && s.code.includes("F")).length || "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-tx7 text-[12px]">
                    {filter ? "No matches" : "Nothing loaded yet — drop a file above"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
