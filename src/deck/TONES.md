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

## The restraint rules ("not a christmas tree")

1. Within one visible view (a tray section), at most: ONE filled primary
   lever, ONE `cy` preferred key, plus any latches whose tones are semantic
   (arr/dep/amber). If everything is coloured, nothing is.
2. Sibling actions where we have a preference: preferred gets `cy`, the rest
   stay neutral. No preference → all neutral.
3. `arr`/`dep` are reserved for the arrival/departure meaning ONLY. Never
   reuse red/blue for unrelated pairs.
4. Paired opposites that aren't arr/dep (e.g. LEFT/RIGHT turns) distinguish
   by GLYPH first (↺/↻, arrows); one side may add `pu` if the glyph alone is
   too subtle. Never invent a new hue.
5. Destructive is always a HoldKey (red, hold-to-confirm). Red never appears
   on a plain click.
6. View-switching controls (section latches, tab-like things) stay neutral —
   the lit cyan latch state is enough — EXCEPT when the section itself is a
   semantic concept (GROUND = amber).
7. Data chips (LIVE/PRE, source badges, rating) use their token colours at
   low intensity: tinted bg + coloured text, never filled.
