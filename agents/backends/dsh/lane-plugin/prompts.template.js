// TEMPLATE — rendered by `my-workbench --dsh` into the installed preset as
// <DSH_HOME>/.agent-presets/my-workbench/lane-plugin/src/prompts.generated.js
//
// The seven MyWorkbench specialist prompts travel into the packaged lane plugin
// from this repository's SINGLE SOURCE, `agents/prompts/*.md`. Nothing here
// duplicates a prompt body: every value below is the `{{prompt:<agent>}}`
// placeholder the CLI fills with that agent's shared prompt body, JSON-escaped
// (see `fillPromptsJson` in bin/my-workbench.js). Editing a prompt means editing
// `agents/prompts/<agent>.md` and re-running `npx my-workbench --dsh`.
//
// Why a JS data module rather than the YAML literal blocks used inside
// agent.cordis.yml: the packaged host half imports this module
// (`import { LANE_PROMPTS } from './prompts.generated.js'`), so the prompts must
// be values, not indented text. JSON escaping is also what keeps the emitted file
// syntactically valid for prompts containing newlines and non-ASCII text.
//
// A placeholder must NOT be wrapped in quotes: the replacement is a complete JSON
// string literal, so the value position takes the placeholder bare. Writing a
// prompt placeholder between quote marks would produce a double-quoted string and
// `my-workbench assemble` rejects that shape outright (see fillPromptsJson).

/** One specialist prompt per MyWorkbench lane, keyed by the lane's roster key. */
export const LANE_PROMPTS = {
  explorer: {{prompt:explorer}},
  librarian: {{prompt:librarian}},
  oracle: {{prompt:oracle}},
  'ui-designer': {{prompt:ui-designer}},
  fixer: {{prompt:fixer}},
  observer: {{prompt:observer}},
  improver: {{prompt:improver}}
}

export default LANE_PROMPTS
