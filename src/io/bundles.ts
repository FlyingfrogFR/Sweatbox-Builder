// bundles.ts — JSON/text file IO helpers, copied VERBATIM from the rc3 shell.
// These cover bundle EXPORT (blob download) and IMPORT (FileReader) for navdata,
// pool and scenario bundles. The .scn / ruleset native Save-As lives in
// io/fileSave.ts; these stay as-is for the JSON bundle round-trips.

export function downloadJsonBundle(filename: string, payload: any) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readJsonFile(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        resolve(JSON.parse(String(e.target?.result || "")));
      } catch (err) {
        reject(err);
      }
    };
    r.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    r.readAsText(file);
  });
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => resolve(String(e.target?.result || ""));
    r.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    r.readAsText(file);
  });
}
