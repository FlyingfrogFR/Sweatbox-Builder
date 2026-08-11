// SlotRail.tsx — FLIGHTDECK left rail (232px, the grid's first column): one
// card per save slot with counts, rating, arr/dep mix bar and freshness;
// double-click-to-rename inline; a per-card "⋯" menu (rename / clone / export
// .scenario.json / hold-to-delete); footer IMPORT + AIRAC chip. All slot
// mutations live in DeckApp — this component only renders and calls back.
import { useEffect, useRef, useState } from "react";
import { DeckKey, HoldKey, RatingChip, pulse } from "./ui";
import { Icon } from "../ui/Icon";
import { downloadJsonBundle, readJsonFile } from "../io/bundles";
import { wrongKindMessage } from "../state/bundleKind";
import * as slots from "../state/slots";

// Local one-off animations (shake on rejected rename, menu pop-in).
const railCss = `
.sr-shake{animation:sr-shake .3s ease}
@keyframes sr-shake{25%,75%{transform:translateX(-3px)}50%{transform:translateX(3px)}}
.sr-menu{animation:sr-pop .13s ease}
@keyframes sr-pop{from{opacity:0;transform:translateY(-4px)}}
@media (prefers-reduced-motion: reduce){.sr-shake,.sr-menu{animation:none}}
`;

function fmtRel(ts: number): string {
  if (!ts) return "—";
  const s = (Date.now() - ts) / 1000;
  if (s < 90) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

const MENU_W = 190;

export function SlotRail({
  slotList,
  active,
  activeScenario,
  airac,
  onSwitch,
  onNew,
  onRename,
  onClone,
  onDelete,
  onImportBundle,
  trayOpen,
  toast,
}: {
  slotList: string[];
  active: string;
  activeScenario: any;
  airac: string;
  onSwitch: (name: string) => void;
  onNew: () => void;
  onRename: (oldName: string, newName: string) => string | null;
  onClone: (name: string) => void;
  onDelete: (name: string) => void;
  onImportBundle: (bundle: any) => void;
  trayOpen?: boolean;
  toast: (html: string, kind?: "ok" | "warn" | "err" | "info") => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const escRef = useRef(false);

  // Close the menu on outside click / Escape (capture beats the deck's global
  // Escape handler so closing the menu doesn't also close a tray).
  useEffect(() => {
    if (!menu) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenu(null);
      }
    };
    document.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  const openMenu = (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    if (menu?.name === name) {
      setMenu(null);
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ name, x: Math.min(r.left, window.innerWidth - MENU_W), y: r.bottom + 4 });
  };

  const startRename = (name: string) => {
    setMenu(null);
    setVal(name);
    setRenaming(name);
  };

  const commitRename = (fromBlur = false) => {
    const old = renaming;
    if (!old) return;
    const v = val.trim();
    if (!v || v === old) {
      setRenaming(null);
      return;
    }
    const err = onRename(old, v);
    if (err) {
      toast(err, "err");
      pulse(cardRefs.current[old] ?? null, "sr-shake");
      if (fromBlur) setRenaming(null); // focus is gone — give up instead of trapping
    } else {
      setRenaming(null);
      toast(`Renamed to <b>${esc(v)}</b>`, "ok");
    }
  };

  const exportBundle = (name: string) => {
    // The active slot's freshest state lives in memory (autosave lags 2s).
    const scenario = name === active ? activeScenario : slots.readSlot(name);
    if (!scenario) {
      toast("Slot not found", "err");
      return;
    }
    downloadJsonBundle(`${name.replace(/\s+/g, "_")}.scenario.json`, {
      kind: "sweatbox-scenario",
      version: 1,
      exportedAt: new Date().toISOString(),
      scenario,
    });
    toast("Bundle exported", "ok");
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const parsed = await readJsonFile(f);
      const wrong = wrongKindMessage(parsed, "scenario");
      if (wrong) {
        toast(wrong, "warn");
        return;
      }
      onImportBundle(parsed);
    } catch (err: any) {
      toast(`Import failed: ${esc(err?.message || String(err))}`, "err");
    }
  };

  return (
    <div className="relative flex flex-col min-h-0 bg-rail border-r border-bd1">
      <style>{railCss}</style>

      {/* header */}
      <div className="flex-none flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[10px] font-bold tracking-[0.14em] text-tx7 select-none">SCENARIOS</span>
        <DeckKey size="sm" onClick={onNew} title="New empty slot (Ctrl+N)">
          + NEW
        </DeckKey>
      </div>

      {/* slot cards */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5 pt-0.5 flex flex-col gap-2">
        {slotList.map((name) => {
          const s = slots.slotSummary(name, activeScenario);
          const isActive = name === active;
          const ap = s.ac ? Math.round((s.arr / s.ac) * 100) : 50;
          return (
            <div
              key={name}
              ref={(el) => {
                cardRefs.current[name] = el;
              }}
              role="button"
              tabIndex={0}
              title={isActive ? undefined : "Switch to this slot"}
              onClick={() => {
                if (renaming !== name) onSwitch(name);
              }}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && renaming !== name) {
                  e.preventDefault();
                  onSwitch(name);
                }
              }}
              className={`group relative w-full text-left rounded-[10px] border pl-3.5 pr-2.5 pt-[9px] pb-2 cursor-pointer select-none transition-all duration-150 ${
                isActive
                  ? "bg-cy-soft border-cy-bd/70 shadow-[inset_0_2px_5px_rgb(0_0_0_/_0.14)]"
                  : "bg-panel border-bd2 hover:border-bdh hover:-translate-y-px"
              }`}
            >
              {/* active left bar */}
              <span
                className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-[3px] transition-colors duration-150 ${
                  isActive ? "bg-cy-fg" : "bg-transparent"
                }`}
              />

              {/* name row */}
              <span className="flex items-center justify-between gap-1.5">
                {renaming === name ? (
                  <input
                    autoFocus
                    value={val}
                    onChange={(e) => setVal(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") {
                        escRef.current = true;
                        setRenaming(null);
                      }
                    }}
                    onBlur={() => {
                      if (escRef.current) {
                        escRef.current = false;
                        return;
                      }
                      commitRename(true);
                    }}
                    className="w-[130px] min-w-0 bg-inset border border-bd3 rounded px-1 py-px text-[12.5px] font-semibold text-tx1 outline-none focus:border-cy-bd"
                  />
                ) : (
                  <span
                    className="text-[13px] font-semibold text-tx1 truncate min-w-0"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(name);
                    }}
                    title="Double-click to rename"
                  >
                    {name}
                  </span>
                )}
                <span className="flex items-center gap-[5px] flex-none">
                  <RatingChip rating={s.rating} />
                  <span
                    className={`text-tx6 font-bold leading-none px-[3px] py-0.5 rounded hover:bg-bd1 transition-opacity duration-100 ${
                      menu?.name === name ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    }`}
                    onClick={(e) => openMenu(e, name)}
                    title="Slot actions"
                  >
                    ⋯
                  </span>
                </span>
              </span>

              {/* meta line */}
              <span className="flex justify-between font-mono text-[10px] text-tx6 mt-[3px]">
                <span>
                  {s.ac} AC · {s.rules} RULES
                </span>
                <span>{fmtRel(s.updatedAt)}</span>
              </span>

              {/* arr/dep mix bar */}
              <span className="flex h-[3px] mt-1.5 rounded-sm overflow-hidden bg-bd1">
                <span className="block h-full" style={{ width: `${ap}%`, background: "rgb(var(--arr))" }} />
                <span className="block h-full" style={{ width: `${100 - ap}%`, background: "rgb(var(--dep))" }} />
              </span>
            </div>
          );
        })}
      </div>

      {/* footer — the scenario import hides while a tray is open so exactly one
          import button is ever on screen (the navdata section aside). */}
      <div className="flex-none flex items-center gap-2 p-2.5 border-t border-bd1">
        {!trayOpen && (
          <DeckKey size="sm" onClick={() => fileRef.current?.click()} title="Import a saved scenario (.scenario.json) as a new slot">
            <Icon name="upload" size={13} />
            IMPORT SCENARIO
          </DeckKey>
        )}
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
        {airac && (
          <span className="ml-auto font-mono text-[10px] text-tx6 bg-panel border border-bd1 rounded-md px-[7px] py-[3px]">
            AIRAC {airac}
          </span>
        )}
      </div>

      {/* slot menu */}
      {menu && (
        <div
          ref={menuRef}
          className="sr-menu fixed z-[150] min-w-[170px] bg-panel border border-bd2 rounded-[9px] p-[5px] shadow-[0_10px_28px_rgb(0_0_0_/_0.35)]"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            className="flex w-full items-center gap-2 text-left px-2.5 py-[7px] rounded-md text-[12px] text-tx2 hover:bg-btn2"
            onClick={() => {
              const n = menu.name;
              setMenu(null);
              startRename(n);
            }}
          >
            <Icon name="edit" size={13} className="text-tx5" />
            Rename
          </button>
          <button
            className="flex w-full items-center gap-2 text-left px-2.5 py-[7px] rounded-md text-[12px] text-tx2 hover:bg-btn2"
            onClick={() => {
              const n = menu.name;
              setMenu(null);
              onClone(n);
            }}
          >
            <Icon name="copy" size={13} className="text-tx5" />
            Clone
          </button>
          <button
            className="flex w-full items-center gap-2 text-left px-2.5 py-[7px] rounded-md text-[12px] text-tx2 hover:bg-btn2"
            onClick={() => {
              const n = menu.name;
              setMenu(null);
              exportBundle(n);
            }}
          >
            <Icon name="download" size={13} className="text-tx5" />
            Export .scenario.json
          </button>
          <div className="mt-1 pt-1.5 pb-0.5 px-0.5 border-t border-bd2">
            <HoldKey
              size="sm"
              className="w-full text-rd-fg"
              title="Hold to delete this slot"
              onHold={() => {
                const n = menu.name;
                setMenu(null);
                onDelete(n);
              }}
            >
              <Icon name="trash" size={13} />
              DELETE — HOLD
            </HoldKey>
          </div>
        </div>
      )}
    </div>
  );
}
