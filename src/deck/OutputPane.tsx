// OutputPane.tsx — FLIGHTDECK right zone: the live .scn preview. Header carries
// the validity dot (green when navdata is loaded, amber warning otherwise) and
// a rolling line ticker; the body renders the output with dimmed comment lines
// and a cyan flash on the changed line range (common prefix/suffix diff against
// the previous output, exactly like the mockup's renderOutput). The SHIPPED
// stamp replays whenever the shell reports a fresh export. The parent zone in
// DeckApp supplies position, borders and the relative context for the stamp.
import { useEffect, useMemo, useRef, useState } from "react";
import { DeckKey, pulse } from "./ui";

const MAX_LINES = 3000;

// "1482" -> "1 482" (space-grouped thousands, like the mockup ticker)
const fmtN = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export function OutputPane({ output, navLoaded, shipped }: { output: string; navLoaded: boolean; shipped: { t: string } | null }) {
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const prevRef = useRef("");
  const tickerRef = useRef<HTMLSpanElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<any>(null);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const doCopy = () => {
    try {
      navigator.clipboard.writeText(output);
    } catch {}
    setCopied(true);
    pulse(document.getElementById("dk-copy"), "dk-pulse-ok");
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1200);
  };

  // One pass over the lines: diff against the previous output (common prefix /
  // suffix), wrap changed lines in span.dk-chg and comment lines in dim spans,
  // and merge untouched runs into plain strings so the array stays small.
  const { nodes, lineCount, hidden } = useMemo(() => {
    const lines = output.split("\n");
    const prev = prevRef.current;
    const flash = !!prev && prev !== output;
    let a = 0;
    let b = 0;
    if (flash) {
      const pl = prev.split("\n");
      while (a < lines.length && a < pl.length && lines[a] === pl[a]) a++;
      while (b < lines.length - a && b < pl.length - a && lines[lines.length - 1 - b] === pl[pl.length - 1 - b]) b++;
    }
    prevRef.current = output;
    const limit = showAll ? lines.length : Math.min(lines.length, MAX_LINES);
    const out: any[] = [];
    let buf = "";
    for (let i = 0; i < limit; i++) {
      const l = lines[i];
      const chg = flash && i >= a && i < lines.length - b;
      const cmt = l.startsWith(";");
      if (!chg && !cmt) {
        buf += l + "\n";
        continue;
      }
      if (buf) {
        out.push(buf);
        buf = "";
      }
      out.push(
        <span key={i} className={chg ? (cmt ? "dk-chg text-tx7" : "dk-chg") : "text-tx7"}>
          {l || " "}
        </span>,
      );
      out.push("\n");
    }
    if (buf) out.push(buf);
    return { nodes: out, lineCount: lines.length, hidden: lines.length - limit };
  }, [output, showAll]);

  // Line ticker rolls whenever the count changes.
  const prevCount = useRef(lineCount);
  useEffect(() => {
    if (prevCount.current !== lineCount) {
      prevCount.current = lineCount;
      pulse(tickerRef.current, "dk-ticker-roll");
    }
  }, [lineCount]);

  // SHIPPED stamp replays on every fresh export (the shell mints a new object).
  useEffect(() => {
    if (shipped) pulse(stampRef.current, "dk-show");
  }, [shipped]);

  return (
    <>
      {/* ===== header ===== */}
      <div className="flex-none bg-inset border-b border-bd1 px-3.5 py-2 flex items-center gap-2">
        <span className="text-[10px] font-extrabold tracking-widest text-tx6 select-none">.SCN OUTPUT</span>
        <span
          className={`w-2 h-2 rounded-full flex-none transition-colors ${
            navLoaded
              ? "bg-gn-fg shadow-[0_0_7px_rgb(var(--gn-fg)_/_0.7)]"
              : "bg-am-fg shadow-[0_0_7px_rgb(var(--am-fg)_/_0.7)]"
          }`}
          title={navLoaded ? "navdata loaded — pre-entry offsets live" : "navdata missing — pre-entry offsets zero"}
        />
        {!navLoaded && <span className="text-[9.5px] text-am-fg truncate">navdata missing — pre-entry offsets zero</span>}
        <span ref={tickerRef} className="ml-auto font-mono text-[10.5px] text-tx6 whitespace-nowrap">
          {fmtN(lineCount)} LINES
        </span>
        <DeckKey size="sm" id="dk-copy" onClick={doCopy} title="Copy the .scn text to the clipboard">
          {copied ? "COPIED ✓" : "COPY"}
        </DeckKey>
      </div>

      {/* ===== .scn body ===== */}
      <pre className="flex-1 min-h-0 overflow-auto whitespace-pre px-3.5 py-3 font-mono text-[10.5px] leading-relaxed text-tx2">
        {nodes}
        {hidden > 0 && (
          <DeckKey size="sm" className="my-2" onClick={() => setShowAll(true)} title="Render the remaining lines">
            SHOW ALL <span className="dk-badge">+{fmtN(hidden)}</span>
          </DeckKey>
        )}
      </pre>

      {/* ===== SHIPPED stamp (self-fades via CSS) ===== */}
      <div ref={stampRef} className="dk-stamp">
        {shipped ? `SHIPPED ✓ ${shipped.t}` : ""}
      </div>
    </>
  );
}
