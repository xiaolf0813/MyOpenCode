# AGENTS.md

This repository ships **my-workbench**, an npm CLI that installs a portable
OpenCode + Claude Code agent setup into a target project (or, with `--user`,
at user level: `~/.config/opencode/` + `~/.claude/`), plus two opt-in
user-level targets: ZCode (`--zcode`) and DeepSeek Harness agent presets
(`--dsh`). OpenCode support
is split into a native target and an opt-in omos target (the
`oh-my-opencode-slim` plugin, short name: **omos**). This file is
auto-loaded from the repo root on every run — keep it structural and lean.

There is no build and no test suite. Validation means:
`node bin/my-workbench.js assemble --check` passes (it also renders the dsh
composition and the dsh lane plugin, imports the lane settings page's inert host
half, and parse-checks every plugin JavaScript file) and every touched file still
parses. CLI behavior changes apply on the next run.

## Single source & generated files

`agents/` is the only place to edit content. Everything else is assembled:

| Source (edit here) | Generated (do not hand-edit) |
| --- | --- |
| `agents/backends/claude/settings.json` | `.claude/settings.json` |
| `agents/backends/opencode/opencode.jsonc` | `.opencode/opencode.jsonc` |
| `agents/backends/omos/oh-my-opencode-slim.jsonc` | `.opencode/oh-my-opencode-slim.jsonc` |
| `agents/backends/omos/oh-my-opencode-slim/` | `.opencode/oh-my-opencode-slim/` |
| `agents/backends/omos/package.json` | `.opencode/package.json` |
| `agents/prompts/*.md` + `agents/backends/*/agents.json` + `agents/backends/*/slots/*.md` | `.claude/agents/*.md`, target `.opencode/agents/*.md` |
| `agents/backends/zcode/` | `~/.zcode/AGENTS.md` + `~/.zcode/agents/*.md` (user-level; via `npx my-workbench --zcode`; nothing generated inside the repo) |
| `agents/backends/dsh/` | `~/.dsh/.agent-presets/my-workbench/` (user-level; via `npx my-workbench --dsh`; nothing generated inside the repo) |

After editing any source, run `npx my-workbench assemble` in the repo root
(`--check` verifies without writing). The generated `.claude/` and
`.opencode/` are gitignored — they exist only on your machine; a fresh clone
materializes them with `npx my-workbench assemble`. `.opencode/node_modules/`
and `.opencode/package-lock.json` are installed runtime artifacts — never
committed or packaged.

## Layout

| Path | Role |
| --- | --- |
| `bin/my-workbench.js` | The CLI (zero dependencies, ESM). |
| `agents/prompts/` | Agent prompt bodies — single source, omos attribution included. |
| `agents/prompts_cn/` | Chinese reference translations — never packaged. |
| `agents/backends/<name>/` | Everything backend-specific: assets copied to the target, plus `agents.json` (markdown backends) and `slots/` for `{{slot:...}}` text. `dsh/` is template-only — no `agents.json`: its `agent.cordis.yml` lists the rows and pulls prompt bodies with `{{prompt:<agent>}}`, `dsh/lane-plugin/` holds the packaged host half the preset mounts, and `dsh/lane-plugin-ui/` holds the settings page the profile mounts. |
| `docs/dsh-lane-plugin/` | The DSH lane plugin's design record: feasibility findings, the plan, the original dynamic-plugin dump, and `BACKLOG.md` — the open follow-ups as a handoff briefing for whoever continues the work. Reference only, and never shipped (outside the `files` whitelist). |
| `.claude/`, `.opencode/` | This repo's own live agent setup — generated from `agents/`, gitignored; materialize with `npx my-workbench assemble`. |
| `package.json` | npm package **`my-workbench`**; the `files` whitelist is the tarball contract. |

## OpenCode targets (opencode / omos)

- **opencode** (in the default set; requires an `opencode` binary on PATH):
  native setup — core config (`opencode.jsonc`) plus native
  `.opencode/agents/*.md` assembled from the omos-derived prompts. When a
  user-level omos install is detected, it switches to the omos way (omits
  assets, no native agents) to avoid agent conflicts. Nothing is downloaded.
- **omos** (opt-in `--omos`; requires OpenCode **and** a pre-existing
  user-level omos install in `~/.config/opencode`): copies only the omos
  project assets (`oh-my-opencode-slim.jsonc`, prompt overrides,
  `package.json`) into `.opencode/`; the `orchestrator_append.md` override
  carries the universal Disciplines (the omos orchestrator prompt is
  plugin-provided). The plugin loads from the user level,
  so my-workbench never pins a `"plugin"` entry and never downloads anything;
  a missing prerequisite fails fast before any write. Exclusive with
  `--opencode`.

`.claude/` is omos-agnostic and installed identically in every target.

**ZCode target** (opt-in via `--zcode`/`zcode`, never in the default set):
user-level only — `~/.zcode/AGENTS.md` composed from
`agents/backends/zcode/AGENTS.md` (header) + `agents/prompts/orchestrator.md`
(body), plus subagents assembled into `~/.zcode/agents/`. No omos, no
downloads, nothing written inside the repo or the project; existing files
are skipped unless `--force`.

**DSH target** (opt-in via `--dsh`/`dsh`, never in the default set):
user-level only — one agent preset at `<DSH_HOME>/.agent-presets/my-workbench/`
(`DSH_HOME`, else `~/.dsh`), holding `preset.yml` (picker metadata, copied from
the backend), `agent.cordis.yml` (the composition, rendered from the backend
template), `lane-plugin/` (the preset-mounted host half, rendered from
`agents/backends/dsh/lane-plugin/`) and `lane-plugin-ui/` (the settings page,
copied from `agents/backends/dsh/lane-plugin-ui/`). The composition is the
orchestrator prompt as the preset persona plus ONE row naming the host half; that
plugin registers the seven `subagent_*` delegation tools and restricts each child
the way its prompt does (read-only lanes lose `write`/`edit`, observer/improver
also lose the shell, every lane loses the delegation tools). It also owns the
`my-workbench-lanes` settings namespace behind *settings → MyWorkbench 赛道模型*,
where each lane's model and reasoning effort are pinned; a fresh install is
seeded from a recommended mapping shipped as the namespace's `base` layer.
**The tools are preset-scoped; the page needs one profile row.** DSH discovers
browser halves only by scanning the profile loader's own entries, so a row inside
an agent preset is never scanned and its page is never served. `--dsh` therefore
also maintains ONE marked, managed block in
`<DSH_HOME>/profiles/<profile>/cordis.patch.yml` holding a single inert row
(`id: my-workbench-lanes-ui`, `name: file:///…/lane-plugin-ui/src/index.js`). The
block is replaced in place, never touches or reorders the user's own rows, is
regenerated unconditionally, and is skipped with a printed row when no single
profile directory can be found. That row is the whole profile-level footprint: no
tools, no services, no packages installed into any `node_modules`, and no other
preset gains a tool. The page registers SYNCHRONOUSLY from `apply()` and decides
inside the component what to show — live controls while the lane host half's
namespace is registered, an inert placeholder otherwise — because registering
after an `await` left the ledger entry `active: false` and the panel blank. The host half must be named by this preset only, because it registers a settings
namespace and DSH refuses a duplicate registration — and it must TOLERATE an
already-registered namespace, because DSH re-mounts a stale composition without
disposing the previous mount's scope, which leaves the old registration live. It
requires an existing DSH
home, no omos, no downloads, nothing written inside the repo or the project;
existing files are skipped unless `--force`. DSH reads presets at session start,
so a restart of the session is what picks a change up, after which one page
refresh reveals the settings page. A change to the lane plugin's **host** code
needs a full DSH restart: the preset row is imported once per process (Node's
ESM cache; the loader re-imports the same specifier when it re-mounts a stale
composition), while the settings page is a browser module that a page reload
refreshes.

## Editing conventions

- **Agent prompts / roster** → edit `agents/prompts/*.md`; in the same change,
  update the corresponding `agents/prompts_cn/<agent>_cn.md`; keep per-backend
  frontmatter in `agents/backends/*/agents.json` in sync; then assemble.
- **Backend-specific text** → `{{slot:<name>}}` placeholders in
  `agents/prompts/*.md`; per-backend content in
  `agents/backends/<name>/slots/<name>.md`. A slot referenced by any prompt
  must exist for every backend or assembly fails.
- **DSH preset composition** → `agents/backends/dsh/agent.cordis.yml` is the
  template: the orchestrator persona plus ONE row (`- id: lanes`) naming the
  lane plugin with a `./`-relative `name`. A `{{prompt:<agent>}}` placeholder
  must stand alone on its own line and is filled from
  `agents/prompts/<agent>.md` as a YAML block.
- **DSH lane plugin (host half)** → `agents/backends/dsh/lane-plugin/`. The
  roster, the per-lane `toolFilter` deny lists and the recommended model mapping
  live in `host-package/src/index.js`; the prompts are NOT duplicated — they come
  from `prompts.template.js` via the same `{{prompt:<agent>}}` mechanism,
  rendered into `src/prompts.generated.js`. Adding a specialist means adding its
  entry to the roster, its prompt placeholder, its row in the settings page, and
  its `toolName` to every other lane's deny list (a lane must stay a leaf);
  `tools.restrict()` rejects unknown names, so a stale list fails loudly at
  spawn. `assemble --check` proves the three lane tables agree. Reinstall with
  `npx my-workbench --dsh`, then start a new DSH session.
- **DSH lane settings page** → `agents/backends/dsh/lane-plugin-ui/`, mounted by
  a profile row, NOT by the preset (client halves are only discovered on profile
  loader entries). `src/index.js` must stay inert — no tools, no services, no
  settings namespace — and `lib/client.js` must keep using only the shipped
  Remote wire (`ctx.remote.settings.describe()/update()`,
  `ctx.remote.session.modelCatalog()`), never a package-private RPC. Its
  registration must stay SYNCHRONOUS in `apply()` and its own gate is the
  component's placeholder when the namespace is absent — an `await` before
  `slots.register` leaves the ledger entry inactive and the panel blank. The CLI
  maintains the profile row itself (`writeLaneUiPatchRow`); do not hand-edit the
  installed `cordis.patch.yml`.
- **Bare imports in the lane plugin are forbidden** except through a
  `{{dep:<alias>}}` placeholder declared in `DSH_LANE_PLUGIN_DEPS`
  (`bin/my-workbench.js`): a plugin under `$DSH_HOME/.agent-presets/` cannot
  resolve a package by name, so `--dsh` bakes an absolute `file:` URL at install
  time. The settings page declares no dependencies at all, and its browser half
  may only `require` the shell's nine seed modules — `assemble --check` enforces
  both, together with the `dsh.client`/`exports["./client"]` pair DSH scans for.
- **Universal behavior rules** → the "Disciplines" section (Fact/Security/
  Language Discipline and future additions) in `agents/prompts/orchestrator.md`; the
  orchestrator copies it verbatim to the top of every delegation brief. One
  rule per concern.
- **Model / variant / council presets** →
  `agents/backends/omos/oh-my-opencode-slim.jsonc`. Keep JSONC parseable
  (comments and trailing commas allowed).
- **Prompt tuning** → append-only, via
  `agents/backends/omos/oh-my-opencode-slim/<agent>_append.md`
  (`orchestrator_append.md` is the working example). A full `<agent>.md`
  replacement must restate the entire bundled prompt and is a last resort.
- **Terminology**: in prose and docs, call the plugin **omos**. Keep the full
  name `oh-my-opencode-slim` in paths and filenames.
- **No downloads**: my-workbench never pins a `"plugin"` entry and never
  downloads or executes anything. The omos target only copies project assets
  and requires a pre-existing user-level omos install; never widen it
  silently.

## Target projects

After `npx my-workbench`, the target owns the same tree: edit its `agents/`
source and run `npx my-workbench assemble` there; `assemble --check` detects
drift. Retune the model mapping to the providers and budget available in the
target, and replace this root file with the target project's own instructions.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (xiaolf0813/my-workbench) via the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
