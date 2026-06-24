// http.ts — single network entry point.
//
// Desktop (Tauri): routes through @tauri-apps/plugin-http, whose fetch() makes
// NATIVE requests that bypass CORS in both dev and production. This is what lets
// the desktop build talk to api.flightplandatabase.com / simbrief / vatsim with
// NO cors proxy (neither the standalone Node/PowerShell proxy nor a Vite
// dev-proxy). The hosts are allow-listed in src-tauri/capabilities/default.json.
//
// Web (fallback): plain window.fetch — which is still CORS-bound, so the optional
// web build needs the fpd-cors-proxy kept under reference/ for that path only.
//
// The plugin is imported dynamically so a pure web build does not hard-depend on
// the Tauri runtime being present.

import { isTauri } from "../env";

export async function httpFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    // plugin-http's fetch is API-compatible with the web fetch signature.
    return tauriFetch(input, init as any) as unknown as Response;
  }
  return window.fetch(input, init);
}
