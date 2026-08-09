// ui.tsx — FLIGHTDECK primitives: keycap buttons with press physics, latches,
// hold-to-confirm keys, and small shared chrome. Styling lives in deck.css.
import { useRef, useState, useCallback } from "react";

// One-shot animation class helper (rim pulse, badge tick, sweep...).
export function pulse(el: HTMLElement | null, cls: string) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function DeckKey({
  children,
  onClick,
  size = "md", // "sm" | "md" | "lever"
  variant = "default", // "default" | "primary" | "fix"
  led, // undefined = no LED; boolean = LED on/off
  badge, // string | number badge
  breathe = false,
  className = "",
  title,
  disabled = false,
  id,
}: any) {
  const cls = [
    "dk-key",
    size === "sm" && "dk-sm",
    size === "lever" && "dk-lever",
    variant === "primary" && "dk-primary",
    variant === "fix" && "dk-fix",
    breathe && "dk-breathe",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button id={id} className={cls} onClick={onClick} title={title} disabled={disabled}>
      {led !== undefined && <span className={`dk-led ${led ? "dk-on" : ""}`} />}
      {children}
      {badge !== undefined && <span className="dk-badge">{badge}</span>}
    </button>
  );
}

export function Latch({ on, onClick, children, disabled = false, title, className = "" }: any) {
  return (
    <button
      className={`dk-latch ${on ? "dk-on" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span className="dk-led" />
      {children}
    </button>
  );
}

// Press-and-hold 600ms to confirm; releasing early cancels. Replaces confirm().
export function HoldKey({ onHold, children, size = "sm", className = "", title, ms = 600 }: any) {
  const ref = useRef<HTMLButtonElement>(null);
  const raf = useRef<number>(0);
  const start = useCallback(
    (e: any) => {
      e.preventDefault();
      const el = ref.current;
      if (!el) return;
      const t0 = performance.now();
      el.classList.add("dk-holding");
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        el.style.setProperty("--dk-hold", String(p));
        if (p >= 1) {
          el.classList.remove("dk-holding");
          el.style.setProperty("--dk-hold", "0");
          onHold();
          return;
        }
        raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [onHold, ms],
  );
  const cancel = useCallback(() => {
    const el = ref.current;
    if (!el || !el.classList.contains("dk-holding")) return;
    cancelAnimationFrame(raf.current);
    el.classList.remove("dk-holding");
    el.style.setProperty("--dk-hold", "0");
  }, []);
  return (
    <button
      ref={ref}
      className={`dk-key ${size === "sm" ? "dk-sm" : ""} dk-holdable ${className}`}
      title={title || "Hold to confirm"}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={(e: any) => e.preventDefault()}
    >
      {children}
      <span className="dk-hold-ring" />
    </button>
  );
}

export const RATINGS = ["S1", "S2", "S3", "C1"] as const;

export function RatingChip({ rating, className = "" }: any) {
  if (!rating) return null;
  return <span className={`dk-rating ${className}`}>{rating}</span>;
}

// Dock cluster with its silkscreen label.
export function Cluster({ label, children, className = "" }: any) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[8.5px] font-extrabold tracking-[0.18em] text-tx8 pl-0.5 select-none">{label}</span>
      <div className="flex gap-2 items-center">{children}</div>
    </div>
  );
}
