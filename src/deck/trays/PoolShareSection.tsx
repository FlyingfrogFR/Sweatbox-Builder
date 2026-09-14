// PoolShareSection.tsx — FPLN POOL → SHARE. Three blocks, in the order a
// mentor meets them:
//
//   LIBRARY          pools committed to the repo, one click to load
//   IMPORT FROM LINK an sbx: code from a colleague, or any https URL
//   PUBLISH          push this pool to a secret gist and get a code back
//
// Shared pools MERGE into the pool (source chip SHARED/LIBRARY) rather than
// replacing it — the file-import path is the one that replaces, and losing a
// session's staged traffic to a colleague's link would be a nasty surprise.
//
// Tone contract: LOAD/GET are neutral siblings of each other; PUBLISH is this
// section's single commit lever (rule 1). The token row is neutral — a missing
// token is a prerequisite, not a caution.
import { useCallback, useEffect, useRef, useState } from "react";
import { DeckKey } from "../ui";
import { Icon } from "../../ui/Icon";
import { storage, KEYS } from "../../state/storage";
import {
  checkToken,
  fetchLibraryIndex,
  fetchLibraryPool,
  fetchSharedPool,
  looksLikeToken,
  publishSharedPool,
  type LibraryEntry,
} from "../../core/poolShare";

const INPUT =
  "h-8 bg-inset border border-bd3 rounded-md px-2.5 font-mono text-[12px] text-tx1 outline-none focus:border-cy-fg";
const LABEL = "block text-[9.5px] font-bold tracking-[0.1em] text-tx8 mb-1";
const HEAD = "text-[11px] font-extrabold tracking-[0.14em] text-tx6";

function Block({ title, hint, children, action }: any) {
  return (
    <section className="bg-panel border border-bd1 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-bd1 bg-inset">
        <span className={HEAD}>{title}</span>
        {hint && <span className="text-[10.5px] text-tx7 min-w-0 truncate">{hint}</span>}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

function Note({ tone = "tx7", children }: any) {
  const cls =
    tone === "am"
      ? "text-am-fg"
      : tone === "gn"
        ? "text-gn-fg"
        : tone === "rd"
          ? "text-rd-fg"
          : "text-tx7";
  return <div className={`text-[10.5px] ${cls}`}>{children}</div>;
}

export function PoolShareSection({ pool, poolAirac, onAddToPool, toast }: any) {
  // ---------- library ----------
  const [lib, setLib] = useState<LibraryEntry[] | null>(null);
  const [libErr, setLibErr] = useState("");
  const [libBusy, setLibBusy] = useState(false);
  const [loadingFile, setLoadingFile] = useState("");

  const loadIndex = useCallback(async () => {
    setLibBusy(true);
    setLibErr("");
    try {
      setLib(await fetchLibraryIndex());
    } catch (e: any) {
      setLibErr(String(e?.message || e));
      setLib(null);
    } finally {
      setLibBusy(false);
    }
  }, []);
  const indexOnce = useRef(false);
  useEffect(() => {
    if (indexOnce.current) return;
    indexOnce.current = true;
    loadIndex();
  }, [loadIndex]);

  const loadFromLibrary = async (e: LibraryEntry) => {
    setLoadingFile(e.file);
    try {
      const sp = await fetchLibraryPool(e.file);
      onAddToPool(sp.pool, "library");
      toast(`<b>${e.name}</b> — ${sp.pool.length} flight plans added`, "ok");
    } catch (err: any) {
      toast(String(err?.message || err), "err");
    } finally {
      setLoadingFile("");
    }
  };

  // ---------- import from link ----------
  const [code, setCode] = useState("");
  const [getBusy, setGetBusy] = useState(false);
  const getShared = async () => {
    if (!code.trim()) return;
    setGetBusy(true);
    try {
      const sp = await fetchSharedPool(code);
      onAddToPool(sp.pool, "shared");
      toast(
        `${sp.pool.length} flight plans added${sp.name ? ` from <b>${sp.name}</b>` : ""}`,
        "ok",
      );
      setCode("");
    } catch (err: any) {
      toast(String(err?.message || err), "err");
    } finally {
      setGetBusy(false);
    }
  };

  // ---------- publish ----------
  const [token, setToken] = useState<string>(() => storage.get(KEYS.ghToken) || "");
  const [tokenDraft, setTokenDraft] = useState("");
  const [account, setAccount] = useState("");
  const [shareName, setShareName] = useState("");
  const [pubBusy, setPubBusy] = useState(false);
  const [share, setShare] = useState<any>(() => storage.get(KEYS.poolShare) || null);

  const saveToken = async () => {
    const t = tokenDraft.trim();
    if (!looksLikeToken(t)) {
      toast("That doesn't look like a GitHub token — it starts with ghp_ or github_pat_", "err");
      return;
    }
    try {
      const login = await checkToken(t);
      storage.set(KEYS.ghToken, t);
      setToken(t);
      setAccount(login);
      setTokenDraft("");
      toast(`Token saved — publishing as <b>${login}</b>`, "ok");
    } catch (e: any) {
      toast(`Token rejected: ${String(e?.message || e)}`, "err");
    }
  };
  const forgetToken = () => {
    storage.del(KEYS.ghToken);
    setToken("");
    setAccount("");
    toast("Token removed from this machine", "warn");
  };

  const publish = async (asNew: boolean) => {
    setPubBusy(true);
    try {
      const r = await publishSharedPool(
        token,
        pool,
        poolAirac,
        shareName,
        asNew ? undefined : share?.id,
      );
      const rec = { id: r.id, code: r.code, url: r.url, name: shareName, at: Date.now() };
      storage.set(KEYS.poolShare, rec);
      setShare(rec);
      try {
        await navigator.clipboard.writeText(r.code);
        toast(`Published — <b class="font-mono">${r.code}</b> copied to the clipboard`, "ok");
      } catch {
        toast(`Published — share code <b class="font-mono">${r.code}</b>`, "ok");
      }
    } catch (e: any) {
      toast(String(e?.message || e), "err");
    } finally {
      setPubBusy(false);
    }
  };

  const copyCode = async () => {
    if (!share?.code) return;
    try {
      await navigator.clipboard.writeText(share.code);
      toast(`<b class="font-mono">${share.code}</b> copied`, "ok");
    } catch {
      toast("Could not reach the clipboard", "err");
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3.5 overflow-y-auto h-full">
      {/* ============================ LIBRARY ============================ */}
      <Block
        title="LIBRARY"
        hint="pools published for everyone"
        action={
          <DeckKey
            size="sm"
            onClick={loadIndex}
            disabled={libBusy}
            title="Re-read the library index"
          >
            <Icon name="refresh" size={12} />
            {libBusy ? "LOADING…" : "REFRESH"}
          </DeckKey>
        }
      >
        {libErr ? (
          <div className="px-3.5 py-3">
            <Note tone="am">
              Library unavailable — {libErr}. This needs an internet connection; everything else in
              the app works offline.
            </Note>
          </div>
        ) : lib === null ? (
          <div className="px-3.5 py-6 text-center text-[11.5px] text-tx7">Reading the library…</div>
        ) : lib.length === 0 ? (
          <div className="px-3.5 py-6 text-center text-[11.5px] text-tx7">
            No pools published yet — yours could be the first. See{" "}
            <span className="font-mono text-tx5">pools/README.md</span> in the repository.
          </div>
        ) : (
          <div className="divide-y divide-rowdiv">
            {lib.map((e) => (
              <div key={e.file} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-tx2 truncate">{e.name}</div>
                  {e.description && (
                    <div className="text-[10.5px] text-tx7 truncate">{e.description}</div>
                  )}
                </div>
                {e.airac && (
                  <span className="font-mono text-[9.5px] text-tx6 border border-bd3 rounded px-1.5 py-px">
                    AIRAC {e.airac}
                  </span>
                )}
                {e.count != null && (
                  <span className="font-mono text-[11px] text-tx6 w-12 text-right">{e.count}</span>
                )}
                <DeckKey
                  size="sm"
                  onClick={() => loadFromLibrary(e)}
                  disabled={!!loadingFile}
                  title={`Add ${e.name} to the pool`}
                >
                  {loadingFile === e.file ? "…" : "LOAD"}
                </DeckKey>
              </div>
            ))}
          </div>
        )}
      </Block>

      {/* ======================= IMPORT FROM LINK ======================= */}
      <Block title="IMPORT FROM LINK" hint="a code from a colleague">
        <div className="px-3.5 py-3 flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className={LABEL}>SHARE CODE OR URL</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && getShared()}
              placeholder="sbx:8f3a21c9… or https://…"
              className={`${INPUT} w-full`}
            />
          </div>
          <DeckKey
            size="sm"
            onClick={getShared}
            disabled={!code.trim() || getBusy}
            title="Fetch and add to the pool"
          >
            <Icon name="download" size={12} />
            {getBusy ? "FETCHING…" : "GET"}
          </DeckKey>
        </div>
        <div className="px-3.5 pb-3">
          <Note>Adds to the pool — nothing already staged is removed.</Note>
        </div>
      </Block>

      {/* ============================ PUBLISH ============================ */}
      <Block title="PUBLISH" hint={`${(pool || []).length} flight plans in this pool`}>
        {!token ? (
          <div className="px-3.5 py-3 flex flex-col gap-2.5">
            <Note>
              Publishing needs a GitHub token so the pool can be written to your own account.
              Importing never does — anyone can open a code you hand them.
            </Note>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <label className={LABEL}>PERSONAL ACCESS TOKEN</label>
                <input
                  type="password"
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveToken()}
                  placeholder="github_pat_… or ghp_…"
                  className={`${INPUT} w-full`}
                />
              </div>
              <DeckKey
                size="sm"
                onClick={saveToken}
                disabled={!tokenDraft.trim()}
                title="Check the token and keep it on this machine"
              >
                SAVE TOKEN
              </DeckKey>
            </div>
            <Note>
              GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
              Give it{" "}
              <span className="font-mono text-tx5">
                Account permissions → Gists → Read and write
              </span>{" "}
              and nothing else. It is stored on this machine only.
            </Note>
          </div>
        ) : (
          <div className="px-3.5 py-3 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10.5px] text-gn-fg bg-gn-bg border border-gn-bd rounded px-1.5 py-px">
                TOKEN SAVED{account ? ` · ${account}` : ""}
              </span>
              <span className="flex-1" />
              <DeckKey size="sm" onClick={forgetToken} title="Remove the token from this machine">
                FORGET TOKEN
              </DeckKey>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <label className={LABEL}>NAME THIS POOL</label>
                <input
                  value={shareName}
                  onChange={(e) => setShareName(e.target.value)}
                  placeholder="LFBB evening rush"
                  className={`${INPUT} w-full`}
                />
              </div>
              {share?.id && (
                <DeckKey
                  size="sm"
                  onClick={() => publish(false)}
                  disabled={pubBusy || !(pool || []).length}
                  title="Overwrite the pool behind the code you already shared"
                >
                  UPDATE {share.code}
                </DeckKey>
              )}
              <DeckKey
                variant="primary"
                onClick={() => publish(true)}
                disabled={pubBusy || !(pool || []).length}
                title="Publish as a new secret gist and copy the share code"
              >
                <Icon name="upload" size={13} />
                {pubBusy ? "PUBLISHING…" : share?.id ? "PUBLISH NEW" : "PUBLISH POOL"}
              </DeckKey>
            </div>
            {share?.code && (
              <div className="flex items-center gap-2 bg-inset border border-bd1 rounded-md px-2.5 py-2">
                <span className="text-[9.5px] tracking-wide text-tx7 uppercase">
                  LAST PUBLISHED
                </span>
                <span className="font-mono text-[12.5px] text-cy-fg">{share.code}</span>
                <span className="flex-1" />
                <DeckKey size="sm" onClick={copyCode} title="Copy the share code">
                  COPY
                </DeckKey>
              </div>
            )}
            <Note>
              The pool goes into a <b>secret</b> gist: unlisted, but readable by anyone you give the
              code to. Don't publish anything you wouldn't put in a public file.
            </Note>
          </div>
        )}
      </Block>
    </div>
  );
}
