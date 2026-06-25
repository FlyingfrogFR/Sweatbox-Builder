// theme.ts — light/dark theme state (handoff: persistence key "sbx-theme",
// dark default). data-theme is applied pre-paint by the inline script in
// index.html; this hook keeps it in sync and persists changes.
import { useState, useEffect, useCallback } from "react";

export type Theme = "dark" | "light";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("sbx-theme");
    if (t === "light" || t === "dark") return t;
  } catch {}
  return "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("sbx-theme", theme);
    } catch {}
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}
