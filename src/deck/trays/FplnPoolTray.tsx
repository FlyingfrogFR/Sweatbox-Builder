// FplnPoolTray.tsx — the FPLN POOL dock button, deck-native. Three
// sub-sections (SIMBRIEF · VATSIM · POOL) so a 50-plane fetch never shares a
// page with the pool table. Every control comes from the deck vocabulary:
// 32px inputs paired with sm keycaps, latches for toggles, hold-to-confirm for
// destructive actions, and each section's commit action as a footer lever —
// so button sizes and weights read the same everywhere.
import { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import { Tray } from "../Tray";
import { DeckKey, HoldKey, Latch } from "../ui";
import { Icon } from "../../ui/Icon";
import { storage, KEYS } from "../../state/storage";
import {
  fetchSimbrief,
  parseSimbriefOFP,
  fetchVatsimData,
  filterVatsimPilots,
  filterVatsimRoutes,
} from "../../net/apis";
import { ICAO_REGIONS, regionLabel, regionValue, endpointLabel } from "../../core/icaoRegions";
import { downloadJsonBundle, readJsonFile } from "../../io/bundles";
import { wrongKindMessage } from "../../state/bundleKind";

type Section = "simbrief" | "vatsim" | "pool";

// Deck-token source chips (the core's SRC_LABELS carries legacy classes).
const SRC: Record<string, { label: string; cls: string }> = {
  vatsim: { label: "VATSIM", cls: "text-gn-fg bg-gn-bg border-gn-bd" },
  simbrief: { label: "SIMBRIEF", cls: "text-cy-fg bg-cy-soft border-cy-bd" },
  manual: { label: "MANUAL", cls: "text-tx5 bg-inset border-bd3" },
};
const srcOf = (s: string) =>
  SRC[s] || { label: (s || "?").toUpperCase(), cls: "text-tx5 bg-inset border-bd3" };

const INPUT =
  "h-8 bg-inset border border-bd3 rounded-md px-2.5 font-mono text-[12px] text-tx1 outline-none focus:border-cy-fg";
const LABEL = "block text-[9.5px] font-bold tracking-[0.1em] text-tx8 mb-1";

function ErrorNote({ children }: any) {
  return (
    <div className="flex items-start gap-2 text-[11.5px] text-rd-fg bg-rd-bg border border-rd-bd rounded-lg px-3 py-2">
      <span className="mt-px flex-none">
        <Icon name="alert" size={13} />
      </span>
      <span>{children}</span>
    </div>
  );
}

function Empty({ icon, title, hint }: any) {
  return (
    <div className="h-full min-h-[220px] flex flex-col items-center justify-center gap-2 text-center px-8">
      <span className="text-tx8">
        <Icon name={icon} size={28} />
      </span>
      <div className="text-[13px] text-tx3 font-semibold">{title}</div>
      <div className="text-[11.5px] text-tx7 max-w-[380px]">{hint}</div>
    </div>
  );
}

/* ============================ SIMBRIEF ============================ */
function SimbriefBody({ cache, setCache, busyRef }: any) {
  const [username, setUsername] = useState(() => storage.get(KEYS.sbUser) || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ofp = cache.ofp;
  busyRef.current.simbriefFetch = doFetch;

  async function doFetch() {
    if (!username.trim()) return setError("Enter a Navigraph username or pilot ID.");
    setError("");
    setLoading(true);
    setCache({ ofp: null });
    storage.set(KEYS.sbUser, username.trim());
    try {
      const data = await fetchSimbrief(username);
      if (data.fetch?.status === "Error" || data.error)
        throw new Error(data.fetch?.message || "SimBrief error");
      setCache({ ofp: parseSimbriefOFP(data) });
    } catch (e: any) {
      const m = String(e.message || e);
      setError(
        m.includes("Failed to fetch") || m.includes("CORS")
          ? "Network error fetching SimBrief."
          : m,
      );
    } finally {
      setLoading(false);
    }
  }

  const Cell = ({ label, children }: any) => (
    <div className="bg-inset border border-bd1 rounded-lg px-3 py-2 min-w-0">
      <div className="text-[9px] font-bold tracking-[0.1em] text-tx8 mb-1">{label}</div>
      {children}
    </div>
  );

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className={LABEL}>NAVIGRAPH USERNAME / PILOT ID</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doFetch()}
            placeholder="pilot id"
            className={`${INPUT} w-[240px]`}
          />
        </div>
        <DeckKey
          size="sm"
          onClick={doFetch}
          disabled={loading}
          title="Fetch your latest SimBrief OFP"
        >
          {loading ? (
            <>
              <span className="inline-block w-3 h-3 rounded-full border-2 border-cy-fg/30 border-t-cy-fg animate-spin" />
              FETCHING
            </>
          ) : (
            <>
              <Icon name="refresh" size={12} />
              FETCH OFP
            </>
          )}
        </DeckKey>
        <span className="text-[10.5px] text-tx7 pb-2">
          pulls the most recent flight plan on your account
        </span>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {ofp ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Cell label="FLIGHT">
            <div className="font-mono text-[13px] font-semibold text-cy-fg">
              {ofp.callsign || "—"}
            </div>
            <div className="font-mono text-[11px] text-tx5">
              {ofp.origin} → {ofp.dest}
            </div>
          </Cell>
          <Cell label="AIRCRAFT">
            <div className="font-mono text-[13px] font-semibold text-tx1">{ofp.type || "—"}</div>
            <div className="font-mono text-[11px] text-tx5">FL{ofp.cruiseFL}</div>
          </Cell>
          <Cell label="ROUTE">
            <div className="font-mono text-[11px] text-tx3 max-h-[38px] overflow-auto leading-snug">
              {ofp.route || "(none)"}
            </div>
          </Cell>
          <Cell label="SQUAWK">
            <div className="font-mono text-[13px] font-semibold text-tx1">{ofp.squawk || "—"}</div>
          </Cell>
        </div>
      ) : (
        !error && (
          <Empty
            icon="cloud"
            title="No OFP fetched yet"
            hint="Enter your Navigraph username or pilot ID and press FETCH OFP. The plan lands here, then goes to the pool."
          />
        )
      )}
    </div>
  );
}

/* ============================= VATSIM ============================= */
/** One end of a city pair: type an ICAO, or pick a whole country from the list
 *  (which writes the "LE**" wildcard the filter understands). Empty = anywhere. */
function Endpoint({ label, value, onChange, onEnter, tone }: any) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex gap-1.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          placeholder="anywhere"
          maxLength={4}
          className={`${INPUT} w-[104px]`}
          title="An airport (LFPG), a country wildcard (LE**), or blank for anywhere"
        />
        <select
          value=""
          onChange={(e) => e.target.value && onChange(regionValue(e.target.value))}
          className={`${INPUT} w-[132px]`}
          title="Pick a whole country"
        >
          <option value="">country…</option>
          {ICAO_REGIONS.map((r) => (
            <option key={r.prefix} value={r.prefix}>
              {regionLabel(r.prefix)}
            </option>
          ))}
        </select>
        {value && (
          <DeckKey size="sm" onClick={() => onChange("")} title="Clear this end">
            <Icon name="x" size={12} />
          </DeckKey>
        )}
      </div>
      <p className={`mt-1 text-[10.5px] ${value ? tone || "text-tx5" : "text-tx7"}`}>
        {endpointLabel(value)}
      </p>
    </div>
  );
}

function VatsimBody({ cache, setCache, sel, setSel, busyRef }: any) {
  const [icao, setIcao] = useState(cache.icao || "");
  const [mode, setMode] = useState(cache.mode || "arr");
  // PAIRING mode: either end can be one airport ("LFPG"), a whole country
  // ("LE**", picked from the country list) or left blank for anywhere.
  const [from, setFrom] = useState(cache.from || "");
  const [to, setTo] = useState(cache.to || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pilots = cache.pilots || [];
  busyRef.current.vatsimFetch = doFetch;

  const pairing = mode === "pair";
  const pairLabel = `${endpointLabel(from)} → ${endpointLabel(to)}`;

  async function doFetch() {
    if (pairing && !from.trim() && !to.trim())
      return setError("Set at least one end of the pairing — an airport, or a country.");
    if (!pairing && !icao.trim()) return setError("Enter an airport ICAO.");
    setError("");
    setLoading(true);
    setSel(new Set());
    try {
      const data = await fetchVatsimData();
      const filtered = pairing
        ? filterVatsimRoutes(data, from, to)
        : filterVatsimPilots(data, icao, mode);
      setCache({
        pilots: filtered,
        icao: icao.toUpperCase(),
        mode,
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        label: pairing ? pairLabel : icao.toUpperCase(),
        fetchedAt: new Date().toLocaleTimeString(),
      });
      if (!filtered.length)
        setError(
          pairing
            ? `Nothing flying ${pairLabel} right now.`
            : `No ${mode === "both" ? "traffic" : mode} found for ${icao.toUpperCase()} right now.`,
        );
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }
  const toggle = (cs: string) =>
    setSel((prev: Set<string>) => {
      const n = new Set(prev);
      n.has(cs) ? n.delete(cs) : n.add(cs);
      return n;
    });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 flex flex-col gap-3 flex-none">
        <div className="flex items-end gap-2 flex-wrap">
          {pairing ? (
            <>
              <Endpoint
                label="FROM"
                value={from}
                onChange={setFrom}
                onEnter={doFetch}
                tone="text-dep"
              />
              <span className="text-tx6 pb-6 select-none">→</span>
              <Endpoint label="TO" value={to} onChange={setTo} onEnter={doFetch} tone="text-arr" />
            </>
          ) : (
            <div>
              <label className={LABEL}>AIRPORT ICAO</label>
              <input
                value={icao}
                onChange={(e) => setIcao(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && doFetch()}
                placeholder="LFPG"
                maxLength={4}
                className={`${INPUT} w-[96px]`}
              />
            </div>
          )}
          <div>
            <label className={LABEL}>SHOW</label>
            <div className="flex gap-1">
              <Latch size="md" tone="arr" on={mode === "arr"} onClick={() => setMode("arr")}>
                ARRIVALS
              </Latch>
              <Latch size="md" tone="dep" on={mode === "dep"} onClick={() => setMode("dep")}>
                DEPARTURES
              </Latch>
              <Latch size="md" on={mode === "both"} onClick={() => setMode("both")}>
                BOTH
              </Latch>
              <Latch
                size="md"
                on={pairing}
                onClick={() => setMode("pair")}
                title="Filter on a city pair — airport to airport, country to country, or any mix"
              >
                PAIRING
              </Latch>
            </div>
          </div>
          <DeckKey
            size="sm"
            onClick={doFetch}
            disabled={loading}
            title="Snapshot live VATSIM traffic for this airport"
          >
            {loading ? (
              <>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-cy-fg/30 border-t-cy-fg animate-spin" />
                FETCHING
              </>
            ) : (
              <>
                <Icon name="refresh" size={12} />
                FETCH
              </>
            )}
          </DeckKey>
          {cache.fetchedAt && (
            <span className="font-mono text-[10.5px] text-tx7 pb-2">
              {cache.label || cache.icao} · {pilots.length} found · {cache.fetchedAt}
            </span>
          )}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>

      {pilots.length > 0 ? (
        <>
          <div className="flex-none flex items-center gap-1.5 px-4 pb-2">
            <DeckKey size="sm" onClick={() => setSel(new Set(pilots.map((p: any) => p.callsign)))}>
              SELECT ALL
            </DeckKey>
            <DeckKey size="sm" onClick={() => setSel(new Set())} disabled={!sel.size}>
              NONE
            </DeckKey>
            <span className="font-mono text-[10.5px] text-tx7 ml-1">
              {sel.size} of {pilots.length} selected
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto border-t border-bd1">
            <table className="w-full font-mono text-[11.5px]">
              <thead className="sticky top-0 bg-thead text-tx7">
                <tr className="text-[9.5px] tracking-[0.1em]">
                  <th className="w-9 px-3 py-2" />
                  <th className="text-left px-3 py-2">CALLSIGN</th>
                  <th className="text-left px-3 py-2">TYPE</th>
                  <th className="text-left px-3 py-2">DEP</th>
                  <th className="text-left px-3 py-2">ARR</th>
                  <th className="text-left px-3 py-2">FL</th>
                  <th className="text-left px-3 py-2">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {pilots.map((p: any, i: number) => {
                  const on = sel.has(p.callsign);
                  return (
                    <tr
                      key={p.callsign}
                      onClick={() => toggle(p.callsign)}
                      className={`border-t border-rowdiv cursor-pointer transition-colors ${
                        on ? "bg-cy-row" : i % 2 ? "bg-inset/50" : ""
                      } hover:bg-cy-fg/5`}
                    >
                      <td className="px-3 py-1.5">
                        <input type="checkbox" readOnly checked={on} className="accent-cy-fg" />
                      </td>
                      <td className="px-3 py-1.5 text-tx1 font-semibold">{p.callsign}</td>
                      <td className="px-3 py-1.5 text-tx3">{p.type || "—"}</td>
                      <td className="px-3 py-1.5 text-tx5">{p.dep}</td>
                      <td className="px-3 py-1.5 text-tx5">{p.arr}</td>
                      <td className="px-3 py-1.5 text-tx5">
                        {p.cruiseFL ? `FL${p.cruiseFL}` : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            p.isPrefiled
                              ? "text-am-fg bg-am-bg border-am-bd"
                              : "text-gn-fg bg-gn-bg border-gn-bd"
                          }`}
                        >
                          {p.isPrefiled ? "PRE" : "LIVE"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        !error && (
          <Empty
            icon="cloud"
            title="No live traffic fetched yet"
            hint="Type an airport ICAO, choose arrivals or departures, then press FETCH. Pick the flights you want and send them to the pool."
          />
        )
      )}
    </div>
  );
}

/* ============================== POOL ============================== */
const PoolRow = memo(function PoolRow({
  p,
  selected,
  routePreview,
  addedStr,
  onToggle,
  onDeleteOne,
  zebra,
}: any) {
  const s = srcOf(p.source);
  return (
    <tr
      onClick={() => onToggle(p.id)}
      className={`border-t border-rowdiv cursor-pointer transition-colors ${
        selected ? "bg-cy-row" : zebra ? "bg-inset/50" : ""
      } hover:bg-cy-fg/5`}
    >
      <td className="px-3 py-1.5">
        <input type="checkbox" readOnly checked={selected} className="accent-cy-fg" />
      </td>
      <td className="px-3 py-1.5 text-tx1 font-semibold">
        {p.callsign || <span className="text-tx8 italic">no callsign</span>}
      </td>
      <td className="px-3 py-1.5 text-tx3">{p.type || "—"}</td>
      <td className="px-3 py-1.5 text-tx5">{p.origin || "—"}</td>
      <td className="px-3 py-1.5 text-tx5">{p.dest || "—"}</td>
      <td className="px-3 py-1.5 text-tx5">{p.cruiseFL ? `FL${p.cruiseFL}` : "—"}</td>
      <td className="px-3 py-1.5 text-tx6 max-w-[260px] truncate">{routePreview}</td>
      <td className="px-3 py-1.5">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${s.cls}`}>
          {s.label}
        </span>
      </td>
      <td className="px-3 py-1.5 text-tx7">{addedStr}</td>
      <td className="px-3 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onDeleteOne(p.id)}
          title="Remove from pool"
          className="text-tx8 hover:text-rd-fg"
        >
          <Icon name="trash" size={13} />
        </button>
      </td>
    </tr>
  );
});

function PoolBody({
  pool,
  onDelete,
  airac,
  onSetAirac,
  sel,
  setSel,
  filtered,
  fQ,
  setFQ,
  fDep,
  setFDep,
  fArr,
  setFArr,
  fSrc,
  setFSrc,
}: any) {
  const [airacInput, setAiracInput] = useState(airac || "");
  useEffect(() => setAiracInput(airac || ""), [airac]);
  const toggleSel = useCallback(
    (id: string) =>
      setSel((prev: Set<string>) => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      }),
    [setSel],
  );
  const deleteOne = useCallback((id: string) => onDelete([id]), [onDelete]);
  const derived = useMemo(() => {
    const m = new Map<string, { routePreview: string; addedStr: string }>();
    for (const p of pool) {
      const toks = (p.route || "").split(" ");
      m.set(p.id, {
        routePreview: toks.slice(0, 5).join(" ") + (toks.length > 5 ? "…" : ""),
        addedStr: p.addedAt
          ? new Date(p.addedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "",
      });
    }
    return m;
  }, [pool]);
  const counts = useMemo(
    () => pool.reduce((a: any, p: any) => ((a[p.source] = (a[p.source] || 0) + 1), a), {}),
    [pool],
  );
  const anyFilter = fQ || fDep || fArr || fSrc;

  if (!pool.length)
    return (
      <Empty
        icon="layers"
        title="The pool is empty"
        hint="Fetch flight plans from SIMBRIEF or VATSIM above — they stage here, then you send the ones you want to the board."
      />
    );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-none flex items-center gap-2.5 flex-wrap px-4 pt-3.5 pb-2.5">
        <span className="text-[9.5px] font-bold tracking-[0.1em] text-tx8">AIRAC</span>
        <input
          value={airacInput}
          onChange={(e) => setAiracInput(e.target.value)}
          onBlur={() => onSetAirac(airacInput.trim())}
          onKeyDown={(e: any) => e.key === "Enter" && e.target.blur()}
          placeholder="2511"
          className={`${INPUT} w-[78px]`}
        />
        {Object.entries(counts).map(([src, n]: any) => {
          const s = srcOf(src);
          return (
            <span
              key={src}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${s.cls}`}
            >
              {s.label} {n}
            </span>
          );
        })}
        <span className="flex-1" />
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx8 pointer-events-none">
            <Icon name="search" size={12} />
          </span>
          <input
            value={fQ}
            onChange={(e) => setFQ(e.target.value)}
            placeholder="Callsign"
            className={`${INPUT} pl-7 w-[130px]`}
          />
        </div>
        <input
          value={fDep}
          onChange={(e) => setFDep(e.target.value.toUpperCase())}
          placeholder="DEP"
          className={`${INPUT} w-[70px]`}
        />
        <input
          value={fArr}
          onChange={(e) => setFArr(e.target.value.toUpperCase())}
          placeholder="ARR"
          className={`${INPUT} w-[70px]`}
        />
        <select
          value={fSrc}
          onChange={(e) => setFSrc(e.target.value)}
          className={`${INPUT} w-[120px]`}
        >
          <option value="">All sources</option>
          {Object.keys(SRC).map((s) => (
            <option key={s} value={s}>
              {SRC[s].label}
            </option>
          ))}
        </select>
        {anyFilter && (
          <DeckKey
            size="sm"
            onClick={() => {
              setFQ("");
              setFDep("");
              setFArr("");
              setFSrc("");
            }}
          >
            CLEAR FILTERS
          </DeckKey>
        )}
        <span className="font-mono text-[10.5px] text-tx7">
          {filtered.length}/{pool.length}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto border-t border-bd1">
        <table className="w-full font-mono text-[11.5px]">
          <thead className="sticky top-0 bg-thead text-tx7">
            <tr className="text-[9.5px] tracking-[0.1em]">
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  className="accent-cy-fg"
                  checked={sel.size === filtered.length && filtered.length > 0}
                  onChange={(e) =>
                    setSel(e.target.checked ? new Set(filtered.map((p: any) => p.id)) : new Set())
                  }
                />
              </th>
              <th className="text-left px-3 py-2">CALLSIGN</th>
              <th className="text-left px-3 py-2">TYPE</th>
              <th className="text-left px-3 py-2">DEP</th>
              <th className="text-left px-3 py-2">ARR</th>
              <th className="text-left px-3 py-2">FL</th>
              <th className="text-left px-3 py-2">ROUTE</th>
              <th className="text-left px-3 py-2">SOURCE</th>
              <th className="text-left px-3 py-2">ADDED</th>
              <th className="w-9 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any, i: number) => (
              <PoolRow
                key={p.id}
                p={p}
                zebra={i % 2 === 1}
                selected={sel.has(p.id)}
                routePreview={derived.get(p.id)?.routePreview}
                addedStr={derived.get(p.id)?.addedStr}
                onToggle={toggleSel}
                onDeleteOne={deleteOne}
              />
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-tx7 text-[12px]">
                  No entries match these filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================== TRAY ============================== */
export function FplnPoolTray(props: any) {
  const {
    open,
    close,
    toast,
    pool,
    simbriefCache,
    setSimbriefCache,
    vatsimCache,
    setVatsimCache,
    onAddToPool,
    onDeleteFromPool,
    poolAirac,
    onSetPoolAirac,
    onImportPool,
    onAddToBoard,
  } = props;

  const [section, setSection] = useState<Section>("pool");
  useEffect(() => {
    if (open) setSection((pool || []).length ? "pool" : "simbrief");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [vsSel, setVsSel] = useState<Set<string>>(new Set());
  const [poolSel, setPoolSel] = useState<Set<string>>(new Set());
  const [fQ, setFQ] = useState("");
  const [fDep, setFDep] = useState("");
  const [fArr, setFArr] = useState("");
  const [fSrc, setFSrc] = useState("");
  const busyRef = useRef<any>({});
  const importRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () =>
      pool.filter((p: any) => {
        if (fQ && !(p.callsign || "").toUpperCase().includes(fQ.toUpperCase())) return false;
        if (fDep && p.origin !== fDep.toUpperCase()) return false;
        if (fArr && p.dest !== fArr.toUpperCase()) return false;
        if (fSrc && p.source !== fSrc) return false;
        return true;
      }),
    [pool, fQ, fDep, fArr, fSrc],
  );

  const ofp = simbriefCache.ofp;
  const vsPilots = vatsimCache.pilots || [];

  // ---------- commits ----------
  const sbToPool = () => {
    if (!ofp) return;
    onAddToPool(
      [
        {
          callsign: ofp.callsign,
          type: ofp.type,
          origin: ofp.origin,
          dest: ofp.dest,
          route: ofp.route,
          cruiseFL: ofp.cruiseFL,
          squawk: ofp.squawk,
        },
      ],
      "simbrief",
    );
    toast(`<b class="font-mono">${ofp.callsign || "OFP"}</b> → pool`, "ok");
    setSection("pool");
  };
  const vsToPool = () => {
    const items = vsPilots
      .filter((p: any) => vsSel.has(p.callsign))
      .map((p: any) => ({
        callsign: p.callsign,
        type: p.type,
        origin: p.dep,
        dest: p.arr,
        route: p.route,
        cruiseFL: p.cruiseFL || 350,
        squawk: p.squawk,
      }));
    if (!items.length) return;
    onAddToPool(items, "vatsim");
    setVsSel(new Set());
    toast(`${items.length} flight${items.length !== 1 ? "s" : ""} → pool`, "ok");
    setSection("pool");
  };
  const poolToBoard = () => {
    const items = filtered.filter((p: any) => poolSel.has(p.id));
    if (!items.length) return;
    setPoolSel(new Set());
    onAddToBoard(items);
  };
  const exportPool = () => {
    downloadJsonBundle("pool.json", {
      kind: "sweatbox-pool",
      version: 1,
      airac: poolAirac || "",
      exportedAt: new Date().toISOString(),
      pool,
    });
    toast("Exported <b class='font-mono'>pool.json</b>", "ok");
  };
  const importPool = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const bundle = await readJsonFile(file);
      const wrong = wrongKindMessage(bundle, "pool");
      if (wrong) return toast(wrong, "warn");
      onImportPool(bundle);
      toast(`Pool imported — ${(bundle.pool || []).length} entries`, "ok");
    } catch (err: any) {
      toast("Import failed: " + (err.message || err), "err");
    }
  };

  const footer =
    section === "simbrief" ? (
      <>
        <span className="text-[10.5px] text-tx7">
          {ofp ? "Plan ready to stage" : "Fetch a plan to continue"}
        </span>
        <span className="flex-1" />
        <DeckKey
          size="lever"
          variant={ofp ? "primary" : "default"}
          disabled={!ofp}
          onClick={sbToPool}
        >
          <Icon name="plus" size={14} />
          ADD TO POOL
        </DeckKey>
      </>
    ) : section === "vatsim" ? (
      <>
        <span className="text-[10.5px] text-tx7">
          {vsPilots.length
            ? `${vsSel.size} of ${vsPilots.length} selected`
            : "Fetch an airport to continue"}
        </span>
        <span className="flex-1" />
        <DeckKey
          size="lever"
          variant={vsSel.size ? "primary" : "default"}
          disabled={!vsSel.size}
          onClick={vsToPool}
        >
          <Icon name="plus" size={14} />
          ADD {vsSel.size || ""} TO POOL
        </DeckKey>
      </>
    ) : (
      <>
        <DeckKey
          size="sm"
          tone="cy"
          onClick={() => importRef.current?.click()}
          title="Load a previously exported pool.json"
        >
          <Icon name="upload" size={12} />
          IMPORT POOL
        </DeckKey>
        <DeckKey
          size="sm"
          onClick={exportPool}
          disabled={!pool.length}
          title="Save the whole pool as pool.json"
        >
          <Icon name="download" size={12} />
          EXPORT POOL
        </DeckKey>
        {poolSel.size > 0 && (
          <HoldKey
            onHold={() => {
              onDeleteFromPool([...poolSel]);
              setPoolSel(new Set());
            }}
            title="Hold to remove the selected entries"
          >
            DELETE {poolSel.size}
          </HoldKey>
        )}
        {pool.length > 0 && (
          <HoldKey
            onHold={() => {
              onDeleteFromPool(pool.map((p: any) => p.id));
              setPoolSel(new Set());
            }}
            title="Hold to empty the pool"
          >
            CLEAR ALL
          </HoldKey>
        )}
        <span className="flex-1" />
        <DeckKey
          size="lever"
          variant={poolSel.size ? "primary" : "default"}
          disabled={!poolSel.size}
          onClick={poolToBoard}
          title="Put the selected flight plans on the traffic board"
        >
          <Icon name="plane" size={14} />
          ADD {poolSel.size || ""} TO BOARD
        </DeckKey>
      </>
    );

  return (
    <Tray
      open={open}
      title="FPLN POOL"
      onDone={close}
      headExtra={
        <span className="flex items-center gap-1.5 ml-1.5">
          <Latch
            on={section === "simbrief"}
            onClick={() => setSection("simbrief")}
            title="Fetch a SimBrief OFP"
          >
            SIMBRIEF
          </Latch>
          <Latch
            on={section === "vatsim"}
            onClick={() => setSection("vatsim")}
            title="Snapshot live VATSIM traffic"
          >
            VATSIM
          </Latch>
          <span className="w-px self-stretch bg-bd1 mx-1" />
          <Latch
            on={section === "pool"}
            onClick={() => setSection("pool")}
            title="Staged flight plans"
          >
            POOL {(pool || []).length > 0 && <b className="font-mono">{(pool || []).length}</b>}
          </Latch>
        </span>
      }
      footer={footer}
    >
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={importPool}
      />
      <div className="h-full min-h-0">
        {section === "simbrief" && (
          <SimbriefBody cache={simbriefCache} setCache={setSimbriefCache} busyRef={busyRef} />
        )}
        {section === "vatsim" && (
          <VatsimBody
            cache={vatsimCache}
            setCache={setVatsimCache}
            sel={vsSel}
            setSel={setVsSel}
            busyRef={busyRef}
          />
        )}
        {section === "pool" && (
          <PoolBody
            pool={pool}
            onDelete={onDeleteFromPool}
            airac={poolAirac}
            onSetAirac={onSetPoolAirac}
            sel={poolSel}
            setSel={setPoolSel}
            filtered={filtered}
            fQ={fQ}
            setFQ={setFQ}
            fDep={fDep}
            setFDep={setFDep}
            fArr={fArr}
            setFArr={setFArr}
            fSrc={fSrc}
            setFSrc={setFSrc}
          />
        )}
      </div>
    </Tray>
  );
}
