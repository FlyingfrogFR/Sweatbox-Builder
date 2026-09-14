// poolShare.ts — sharing flight-plan pools between mentors, with no backend.
//
// Two surfaces, both plain HTTPS against GitHub:
//
//   LIBRARY — pools committed to this repo under pools/. The app fetches
//     pools/index.json at runtime, so adding a pool is a pull request, not a
//     release. Read-only and anonymous: raw.githubusercontent.com has no REST
//     rate limit (the contents API's 60/hr per IP would be hostile behind a
//     vACC's shared NAT).
//
//   LINKS — one-click publish to a GitHub Gist, producing a short code
//     "sbx:<id>" that anyone can paste back. Publishing needs the user's own
//     personal access token (gist scope only); IMPORTING needs nothing at all,
//     because a secret gist is readable by anyone holding its id.
//
// "Secret" gists are unlisted, NOT private. That is the right trade for a share
// code, and it is why publishSharedPool refuses to send anything but the pool.

import { httpFetch } from "../net/http";

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com/FlyingfrogFR/Sweatbox-Builder";
const GIST_FILE = "pool.json";
const UA = "SweatboxBuilder";

/** One entry in pools/index.json. */
export interface LibraryEntry {
  file: string;
  name: string;
  description?: string;
  airac?: string;
  count?: number;
  author?: string;
}

export interface SharedPool {
  pool: any[];
  airac: string;
  name: string;
}

// api.github.com rejects requests with no User-Agent, and the Tauri HTTP
// plugin does not add one. The version pin keeps the response shape stable.
const ghHeaders = (token?: string): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": UA,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

/** A gist id is hex; accept the bare id, the sbx: code, or any gist URL. */
export function parseShareCode(input: string): string | null {
  const s = String(input || "").trim();
  if (!s) return null;
  const code = s.replace(/^sbx:/i, "").trim();
  if (/^[0-9a-f]{16,64}$/i.test(code)) return code;
  const m = s.match(/gist(?:\.github)?(?:usercontent)?\.com\/(?:[^/]+\/)?([0-9a-f]{16,64})/i);
  return m ? m[1] : null;
}

export const shareCodeFor = (gistId: string) => `sbx:${gistId}`;

/**
 * Validate anything claiming to be a pool before it reaches the board. Shared
 * JSON is untrusted input: it arrives from a stranger's gist or a pasted URL,
 * so every entry is rebuilt field by field rather than spread in wholesale.
 */
export function normalizeSharedPool(parsed: any): SharedPool | null {
  const raw = Array.isArray(parsed) ? parsed : parsed?.pool;
  if (!Array.isArray(raw)) return null;
  const str = (v: any, max = 120) => (v == null ? "" : String(v).slice(0, max));
  const pool = raw
    .filter((e: any) => e && typeof e === "object")
    .map((e: any) => ({
      callsign: str(e.callsign, 12).toUpperCase(),
      type: str(e.type, 8).toUpperCase(),
      origin: str(e.origin, 4).toUpperCase(),
      dest: str(e.dest, 4).toUpperCase(),
      route: str(e.route, 2000).toUpperCase(),
      cruiseFL: Math.max(0, Math.min(700, Math.round(+e.cruiseFL || 0))) || 350,
      squawk: /^\d{4}$/.test(String(e.squawk)) ? String(e.squawk) : "1000",
    }))
    .filter((e: any) => e.callsign);
  if (!pool.length) return null;
  return {
    pool,
    airac: str(parsed?.airac, 8),
    name: str(parsed?.name || parsed?.description, 80),
  };
}

/** The payload a share publishes — deliberately just the pool, nothing else. */
export function sharePayload(pool: any[], airac: string, name: string) {
  return {
    kind: "sweatbox-pool",
    version: 1,
    name: String(name || "").slice(0, 80),
    airac: String(airac || ""),
    pool: (pool || []).map((p: any) => ({
      callsign: p.callsign,
      type: p.type,
      origin: p.origin,
      dest: p.dest,
      route: p.route,
      cruiseFL: p.cruiseFL,
      squawk: p.squawk,
    })),
  };
}

async function ghJson(url: string, init?: RequestInit, token?: string) {
  const r = await httpFetch(url, {
    ...init,
    headers: { ...ghHeaders(token), ...(init?.headers as any) },
  });
  if (!r.ok) {
    const detail = r.status === 401 || r.status === 403 ? " — check your GitHub token" : "";
    throw new Error(`GitHub returned ${r.status}${detail}`);
  }
  return r.json();
}

// ---------------------------------------------------------------- library ---

/**
 * The curated library index. `ref` pins which commit-ish is read; raw.github
 * caches for 5 minutes, so a just-merged pool can take that long to appear.
 */
export async function fetchLibraryIndex(ref = "main"): Promise<LibraryEntry[]> {
  const r = await httpFetch(`${RAW}/${ref}/pools/index.json?t=${Date.now()}`);
  if (!r.ok) throw new Error(`Pool library unavailable (${r.status})`);
  const j = await r.json();
  const list = Array.isArray(j) ? j : j?.pools;
  if (!Array.isArray(list)) throw new Error("Pool library index is malformed");
  return list
    .filter((e: any) => e && typeof e.file === "string" && /^[\w.-]+\.json$/.test(e.file))
    .map((e: any) => ({
      file: e.file,
      name: String(e.name || e.file),
      description: e.description ? String(e.description) : undefined,
      airac: e.airac ? String(e.airac) : undefined,
      count: Number.isFinite(+e.count) ? +e.count : undefined,
      author: e.author ? String(e.author) : undefined,
    }));
}

export async function fetchLibraryPool(file: string, ref = "main"): Promise<SharedPool> {
  if (!/^[\w.-]+\.json$/.test(file)) throw new Error("Bad library filename");
  const r = await httpFetch(`${RAW}/${ref}/pools/${file}?t=${Date.now()}`);
  if (!r.ok) throw new Error(`Could not download ${file} (${r.status})`);
  const pool = normalizeSharedPool(await r.json());
  if (!pool) throw new Error(`${file} does not contain a usable pool`);
  return pool;
}

// ------------------------------------------------------------------ links ---

/** Read a shared pool by share code, gist id or gist URL — no token needed. */
export async function fetchSharedPool(codeOrUrl: string): Promise<SharedPool> {
  const id = parseShareCode(codeOrUrl);
  if (!id) {
    // Not a gist — allow any https URL so a vACC can host pools itself.
    const url = String(codeOrUrl || "").trim();
    if (!/^https:\/\//i.test(url)) throw new Error("Not a share code or an https link");
    const r = await httpFetch(url);
    if (!r.ok) throw new Error(`Could not download that link (${r.status})`);
    const pool = normalizeSharedPool(await r.json());
    if (!pool) throw new Error("That link does not contain a usable pool");
    return pool;
  }
  const gist: any = await ghJson(`${API}/gists/${id}`);
  const file = gist?.files?.[GIST_FILE] || Object.values(gist?.files || {})[0];
  if (!file) throw new Error("That share code has no files");
  // Over 1 MB the API truncates and hands back a raw_url instead.
  let content = String((file as any).content || "");
  if ((file as any).truncated && (file as any).raw_url) {
    const r = await httpFetch((file as any).raw_url);
    if (r.ok) content = await r.text();
  }
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("That share code does not contain valid JSON");
  }
  const pool = normalizeSharedPool(parsed);
  if (!pool) throw new Error("That share code does not contain a usable pool");
  if (!pool.name && gist?.description) pool.name = String(gist.description).slice(0, 80);
  return pool;
}

export interface PublishResult {
  id: string;
  code: string;
  url: string;
}

/**
 * Publish (or re-publish) a pool as a secret gist. Passing `gistId` updates
 * that gist in place so a share code already handed out keeps working.
 */
export async function publishSharedPool(
  token: string,
  pool: any[],
  airac: string,
  name: string,
  gistId?: string,
): Promise<PublishResult> {
  if (!token) throw new Error("No GitHub token saved");
  if (!pool?.length) throw new Error("The pool is empty");
  const body = JSON.stringify({
    description: `Sweatbox Builder pool — ${name || "shared pool"}`,
    ...(gistId ? {} : { public: false }),
    files: { [GIST_FILE]: { content: JSON.stringify(sharePayload(pool, airac, name), null, 2) } },
  });
  const gist: any = await ghJson(
    gistId ? `${API}/gists/${gistId}` : `${API}/gists`,
    { method: gistId ? "PATCH" : "POST", body, headers: { "Content-Type": "application/json" } },
    token,
  );
  if (!gist?.id) throw new Error("GitHub did not return a gist id");
  return { id: gist.id, code: shareCodeFor(gist.id), url: gist.html_url || "" };
}

/** Confirm a saved token works and say which account it belongs to. */
export async function checkToken(token: string): Promise<string> {
  const me: any = await ghJson(`${API}/user`, undefined, token);
  return String(me?.login || "");
}

/** Cheap shape check so an obviously wrong paste is caught before a round trip. */
export function looksLikeToken(t: string): boolean {
  return /^(ghp_|github_pat_|gho_)[A-Za-z0-9_]{10,}$/.test(String(t || "").trim());
}
