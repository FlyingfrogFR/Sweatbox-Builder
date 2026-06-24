// squawk.ts — squawk assignment, copied VERBATIM from the rc3 shell.
// Math.random() routed through rng() for deterministic tests.

import { HJ_TYPES } from "./tables";
import { rng } from "./rng";

export function assignSquawk(rule: any, type: string) {
  if (rule.squawkMode !== "random") return rule.squawk || "1000";
  const isHJ = HJ_TYPES.has((type || "").toUpperCase());
  let opts = (rule.squawkOptions || ["1000"]).filter((o: string) => !(isHJ && o === "1000"));
  if (!opts.length) opts = ["2000"];
  const choice = opts[Math.floor(rng() * opts.length)];
  if (choice === "5600") return `56${Math.floor(rng() * 8)}${Math.floor(rng() * 8)}`;
  return choice;
}
