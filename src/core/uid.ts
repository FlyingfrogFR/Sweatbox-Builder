// uid.ts — verbatim from the rc3 shell. Note: ids never reach the .scn output,
// so this does not affect generation parity (and deliberately uses the global
// Math.random fallback, not the seeded rng, so it never perturbs that stream).
export function uid(): string {
  return crypto.randomUUID?.() ?? String(Date.now() + Math.random());
}
