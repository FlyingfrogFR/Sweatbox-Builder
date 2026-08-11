# Colorscheme proposals (advisory — not yet applied)

Output of the stage-3 design-advisory pass over the tone system (TONES.md).
The current scheme was judged elegant; these are refinements that lock the
existing logic in place. S = small tweak, M = token refactor, L = owner decision.

Measured baseline (WCAG contrast of toned text on its own 9% tint):
dark theme all tones pass ≥ 4.98:1 (cy 8.2, gn 7.7, am 7.3, dep 5.8, arr 5.4,
rd 4.98). Light theme all seven fail 4.5:1 (worst: gn 2.96, am 3.28, cy 3.44).
Hue separations: cy↔dep only 30°, arr↔rd only 11°, everything else ≥ 35°.

1. **Deepen the light-theme `--*-fg` family to AA contrast — S.**
   Darken only the light-theme foregrounds, same hue, until CR ≥ 4.5 on the
   9% tint (candidates: gn→`rgb(9 113 78)`, cy→`rgb(7 110 134)`,
   am→`rgb(138 97 6)`, rd→`rgb(186 44 66)`, arr→`rgb(176 53 48)`).
   Dark theme untouched. Risk: near-zero.

2. **Neutralize tone on `:disabled` — S.**
   A disabled arr key currently reads red at ~2.15:1. One CSS rule strips
   tone from disabled keys/latches. New rule: "a control that can't be
   pressed carries no tone."

3. **Tokenize the intensity ladder — M.**
   Tint alphas are scattered literals (key bg .09, latch-on .11–.13, borders
   .4–.6). Define `--tint-chip-bg/--tint-key-bg/--tint-key-bd/--tint-latch-bg/
   --tint-latch-bd` tokens and document the ladder:
   chip < key < latch-on < FIX lever < filled primary.

4. **Fence arr vs rd by affordance, not hue — S.**
   `--arr` and `--rd-fg` are 11° apart. Codify: red on a plain keycap is
   forbidden; `rd` exists only inside HoldKey + hold-ring; `arr` may tone
   latches, chips, figures — never a momentary action key.

5. **Fence cy vs dep by component class — S.**
   30° apart, both "blue" at a glance. Codify: `dep` never tones a keycap;
   `cy` never tones a latch (lit latches are already cyan).

6. **Fill mechanical CSS gaps — S.**
   `.dk-latch.dk-tone-gn` / `.dk-tone-pu` lack `:hover` border rules;
   `.dk-key.dk-tone-pu` has no implementation (declare pu latch-only in
   TONES.md instead); `.dk-amber` is a deprecated alias.

7. **One tone vocabulary: `am` vs `amber` — S.**
   `Latch tone="amber"` vs `Line tone="am"` vs tokens `--am-*`. Pick `am`
   canonical (keep `amber` as alias in ui.tsx) and list legal tone strings
   in TONES.md.

8. **Color-independent cue on color-only readouts — S.**
   GroundSection PoolCell (green=met/red-blue=partial/amber=empty) and toast
   severity (border color only) carry state by color alone. Add a tiny glyph
   (`✓ ! ×`). New rule: "a state distinguished by tone must also be
   distinguishable with tone removed."

9. **Numeric budget + new-tone gate — S doc / L enforcement.**
   Append: ≤ 4 distinct non-neutral hues simultaneously visible per view
   (arr+dep count as one pair; gn LEDs exempt). A new hue requires a new
   tone-table row + owner sign-off, shipping light+dark values together.

10. **Tokenize the hardcoded primary cyan — M.**
    `#5ccfe0` is a literal in `.dk-primary` and `::selection`, bypassing the
    theme system. Introduce `--primary-bg` per theme.

Verdict: the palette is small and meaning-anchored, dark theme is comfortably
above AA, and the restraint rules held through the audit. The weaknesses are
codification gaps, not design flaws: light-theme foregrounds run ~30% short
of AA, and the two near-collisions (arr/rd, cy/dep) are held apart by
convention rather than rule. Items 1–7 are an afternoon of low-risk work.
