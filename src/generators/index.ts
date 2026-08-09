// index.ts — static ES-module generator registry.
//
// Replaces the rc3 runtime Babel + plugins.json fetch: importing this module
// loads every generator (side-effect: each calls registerGenerator). Order here
// matches the canonical S1/S2 tab order; the rule-based S3/C1 sub-tabs bypass
// the registry — GeneratorsPanel renders RuleWorkbench for them directly. To add
// a generator, drop a module under src/generators/ that calls registerGenerator
// and import it below.

import "./s1";
import "./s2";

export { getGenerators, registerGenerator, type Generator } from "./registry";
