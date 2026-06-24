// rng.ts
//
// Single injection point for the random-number source. The rc3 shell calls
// Math.random() directly throughout the generation code; the port routes every
// one of those calls through rng() instead. This is a purely mechanical
// substitution — same call order, same semantics — that lets the regression
// suite seed the stream deterministically (matching the oracle, which seeds the
// global Math.random in its VM) so output is byte-for-byte reproducible.
//
// In production rng() is just Math.random.

let _rng: () => number = Math.random;

export function setRng(fn: (() => number) | null | undefined): void {
  _rng = fn || Math.random;
}

export function rng(): number {
  return _rng();
}
