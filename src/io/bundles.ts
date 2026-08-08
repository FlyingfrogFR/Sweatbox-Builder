// bundles.ts — JSON/text file IO helpers, ported from the rc3 shell.
// These cover bundle EXPORT (blob download) and IMPORT (FileReader) for navdata,
// pool and scenario bundles. The .scn / ruleset native Save-As lives in
// io/fileSave.ts, which reuses blobDownload for its web fallback.

export function blobDownload(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJsonBundle(filename: string, payload: any) {
  blobDownload(filename, JSON.stringify(payload, null, 2), "application/json");
}

export function readJsonFile(file: File): Promise<any> {
  return readTextFile(file).then((text) => JSON.parse(text));
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve(String(e.target?.result || ""));
    r.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    r.readAsText(file);
  });
}
