// Toasts.tsx — the deck's single message anchor (bottom-right, above the dock).
// Replaces alert()/flash() feedback. HTML is allowed in messages (bold, mono).
import { useState, useCallback, useRef } from "react";

export function useToasts() {
  const [toasts, setToasts] = useState<any[]>([]);
  const seq = useRef(0);
  const toast = useCallback((html: string, kind: "ok" | "warn" | "err" | "info" = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, html, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3900);
  }, []);
  return { toasts, toast };
}

export function Toasts({ toasts }: any) {
  return (
    <div className="fixed right-3.5 bottom-24 z-[210] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t: any) => (
        <div
          key={t.id}
          className={`dk-toast ${t.kind === "ok" ? "dk-ok" : t.kind === "err" ? "dk-err" : t.kind === "warn" ? "dk-warn" : ""}`}
          dangerouslySetInnerHTML={{ __html: t.html }}
        />
      ))}
    </div>
  );
}
