// ThemeToggle.tsx — the titlebar contrast-circle pill from the handoff.
import type { Theme } from "../state/theme";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title="Switch theme"
      className="flex items-center gap-1.5 bg-btn2 border border-bd4 text-tx3 hover:border-bdh hover:text-tx1 rounded-md px-2.5 py-1 font-mono text-[10px] tracking-[0.1em]"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
      </svg>
      <span>{theme === "light" ? "LIGHT" : "DARK"}</span>
    </button>
  );
}
