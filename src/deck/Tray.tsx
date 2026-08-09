// Tray.tsx — the shared tray shell: slides up over the board zone only (rail,
// output pane and dock stay live), title bar with a DONE keycap, optional
// footer. Exactly one tray is open at a time (DeckApp owns that).
import { DeckKey } from "./ui";

export function Tray({ open, title, children, footer, onDone, headExtra }: any) {
  return (
    <div className={`dk-tray ${open ? "dk-open" : ""}`}>
      <div className="flex-none flex items-center gap-2.5 px-4 py-2.5 border-b border-bd1 bg-inset">
        <span className="text-[11px] font-extrabold tracking-[0.12em] text-tx6">{title}</span>
        {headExtra}
        <span className="flex-1" />
        <DeckKey size="sm" onClick={onDone}>
          DONE
        </DeckKey>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
      {footer && (
        <div className="flex-none flex items-center gap-2.5 px-4 py-2.5 border-t border-bd1 bg-inset">{footer}</div>
      )}
    </div>
  );
}
