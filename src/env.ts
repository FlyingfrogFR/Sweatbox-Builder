// env.ts — runtime environment detection.
//
// The same React bundle can run inside the Tauri webview (desktop) or a plain
// browser (the optional web build that still needs the CORS proxy). Tauri v2
// injects window.__TAURI_INTERNALS__, which is the supported way to detect the
// native runtime.

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
