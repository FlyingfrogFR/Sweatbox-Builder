# FLIGHTDECK tone contract

Colour on a control is a STATEMENT, never decoration. The deck stays elegant
because most controls are neutral — the few coloured ones therefore mean
something. Adding a tone anywhere means answering "which rule below?".

## The tones

| tone      | meaning                                        | examples |
|-----------|------------------------------------------------|----------|
| `arr` red | arrivals / inbound                             | ARR filters, ARRIVALS fetch latch, arrival runway picker, direction toggle |
| `dep` blue| departures / outbound                          | DEP filters, DEPARTURES latch, departure runway picker |
| `amber`   | ground traffic · caution states                | GROUND latch/banners, FIX: never-dead levers, wingspan caveats |
| `rd` red  | destructive (always via HoldKey)               | CLEAR, DELETE — hold-to-confirm only |
| `gn`      | live / verified data                           | LIVE chips, loaded LEDs, validity dot |
| `cy`      | THE preferred action among siblings            | IMPORT (over PASTE), the workflow's next step |
| `pu`      | orientation / secondary axis (sparingly)       | LEFT turn (vs neutral RIGHT) |
| primary   | a section's single commit lever (filled cyan)  | RUN RULES, EXPORT, ADD TO POOL/BOARD |

Legal tone strings on the `tone` prop: `arr` `dep` `am` (alias `amber`) `gn`
`cy` `pu` `rd`. Anything else silently renders neutral — don't invent one.
Component fences: `cy` is keycap-only (lit latches are already cyan);
`pu` is latch-only; `dep` never tones a keycap and `rd`/red never appears
outside a HoldKey (see rules 5 and 10).

## The restraint rules ("not a christmas tree")

1. Within one visible view (a tray section), at most: ONE filled primary
   lever, ONE `cy` preferred key, plus any latches whose tones are semantic
   (arr/dep/amber). If everything is coloured, nothing is.
2. Sibling actions where we have a preference: preferred gets `cy`, the rest
   stay neutral. No preference → all neutral.
   - "The workflow's next step" still requires a sibling choice in the same
     cluster: a lone action key (e.g. a solitary FETCH) stays neutral — its
     placement already says it's next, so `cy` there is decoration.
3. `arr`/`dep` are reserved for the arrival/departure meaning ONLY. Never
   reuse red/blue for unrelated pairs.
4. Paired opposites that aren't arr/dep (e.g. LEFT/RIGHT turns) distinguish
   by GLYPH first (↺/↻, arrows); one side may add `pu` if the glyph alone is
   too subtle. Never invent a new hue.
5. Destructive is always a HoldKey (red, hold-to-confirm). Red never appears
   on a plain click.
   - Destructive wins over domain tones: a key that clears a semantic domain
     (e.g. CLEAR GND) is still red — the domain lives in the label/badge, not
     the key colour, and the red matches the hold-ring.
6. View-switching controls (section latches, tab-like things) stay neutral —
   the lit cyan latch state is enough — EXCEPT when the section itself is a
   semantic concept (GROUND = amber).
7. Data chips (LIVE/PRE, source badges, rating) use their token colours at
   low intensity: tinted bg + coloured text, never filled.
8. A control that can't be pressed carries no tone — `:disabled` drops keys
   and latches back to neutral (enforced in deck.css); a dead control makes
   no colour statement.
9. A state distinguished by tone must ALSO be distinguishable with tone
   removed — glyph, text, or position (pool counts show ✓ when met, toasts
   carry ✓/!/× as well as a coloured edge, turns carry ↺/↻).
10. Near-collision fences (hues held apart by rule, not by distance):
    `arr` vs `rd` are both red → red on a plain keycap is forbidden; `rd`
    exists only inside HoldKey + hold-ring, `arr` may tone latches, chips and
    figures but never a momentary action key. `cy` vs `dep` are both blue →
    `dep` never tones a keycap; a departure-side action carries DEP in its
    label, not its colour.
11. Budget: at most 4 distinct non-neutral hues simultaneously visible per
    view (`arr`+`dep` count as one pair; `gn` status LEDs exempt). A NEW hue
    requires a new row in the tone table — a meaning no existing tone covers —
    plus owner sign-off, and must ship with both light and dark values.
12. Intensity ladder: tint alphas come ONLY from the `--tint-*` tokens in
    index.css — chip < key < latch-on < FIX lever < filled primary. Never
    hardcode a tint alpha in a tone rule. The filled-primary accent is
    `--primary-bg`, never a hex literal.
13. Light-theme derivation: every tone's light `--*-fg` is the same hue
    deepened until it measures ≥ 4.5:1 (WCAG AA) on its own 9%-tinted key
    face. A new or changed tone must be re-measured, not eyeballed.
