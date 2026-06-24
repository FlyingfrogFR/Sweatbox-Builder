// prng.mjs — deterministic mulberry32 PRNG shared by the oracle (seeds the VM's
// Math.random) and the parity test (seeds the port's rng). Identical algorithm
// on both sides => identical random stream for a given seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
