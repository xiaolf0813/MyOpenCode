# AGENTS.md

This repository ships **my-agents**, an npm CLI that installs a portable
OpenCode + Claude Code agent setup into a target project. The setup is built
on the `oh-my-opencode-slim` plugin (short name: **omos**). This file is
auto-loaded from the repo root on every run — keep it structural and lean.

There is no build and no test suite. Validation means:
`node bin/my-agents.js assemble --check` passes and every touched file still
parses. CLI behavior changes apply on the next run.

## Single source & generated files

`agents/` is the only place to edit content. Everything else is assembled:

| Source (edit here) | Generated (do not hand-edit) |
| --- | --- |
| `agents/backends/claude/settings.json` | `.claude/settings.json` |
| `agents/backends/opencode/AGENTS.md` | `.opencode/AGENTS.md` |
| `agents/backends/opencode/opencode.jsonc` | `.opencode/opencode.jsonc` |
| `agents/backends/opencode/oh-my-opencode-slim.jsonc` | `.opencode/oh-my-opencode-slim.jsonc` |
| `agents/backends/opencode/oh-my-opencode-slim/` | `.opencode/oh-my-opencode-slim/` |
| `agents/backends/opencode/package.json` | `.opencode/package.json` |
| `agents/prompts/*.md` + `agents/backends/*/agents.json` + `agents/backends/*/slots/*.md` | `.claude/agents/*.md`, target `.opencode/agents/*.md` |
| `agents/backends/zcode/` | `~/.zcode/AGENTS.md` + `~/.zcode/agents/*.md` (user-level; via `npx my-agents --zcode`; nothing generated inside the repo) |

After editing any source, run `npx my-agents assemble` in the repo root
(`--check` verifies without writing). The generated `.claude/` and
`.opencode/` are gitignored — they exist only on your machine; a fresh clone
materializes them with `npx my-agents assemble`. `.opencode/node_modules/`
and `.opencode/package-lock.json` are installed runtime artifacts — never
committed or packaged.

## Layout

| Path | Role |
| --- | --- |
| `bin/my-agents.js` | The CLI (zero dependencies, ESM). |
| `agents/prompts/` | Agent prompt bodies — single source, omos attribution included. |
| `agents/prompts_cn/` | Chinese reference translations — never packaged. |
| `agents/backends/<name>/` | Everything backend-specific: assets copied to the target plus `agents.json` (per-agent frontmatter used to assemble agent markdown). |
| `.claude/`, `.opencode/` | This repo's own live agent setup — generated from `agents/`, gitignored; materialize with `npx my-agents assemble`. |
| `package.json` | npm package **`my-agents`**; the `files` whitelist is the tarball contract. |

## Schemes (OpenCode target)

- **Non-omos** (default without consent): core config (`opencode.jsonc`,
  `AGENTS.md`) plus native `.opencode/agents/*.md` assembled from the
  omos-derived prompts. Nothing is downloaded.
- **omos** (`--pin-omos` or interactive consent): omos config + prompt
  overrides copied and `"plugin": ["oh-my-opencode-slim"]` pinned; OpenCode
  downloads and executes the plugin from npm on next start. A user-level omos
  install is detected automatically and then omos files are copied without
  pinning (avoids double-loading).

`.claude/` is omos-agnostic and installed identically in both schemes.

**ZCode target** (opt-in via `--zcode`/`zcode`, never in the default set):
user-level only — `~/.zcode/AGENTS.md` composed from
`agents/backends/zcode/AGENTS.md` (header) + `agents/prompts/orchestrator.md`
(body), plus subagents assembled into `~/.zcode/agents/`. No omos, no
downloads, nothing written inside the repo or the project; existing files
are skipped unless `--force`.

## Editing conventions

- **Agent prompts / roster** → edit `agents/prompts/*.md`; in the same change,
  update the corresponding `agents/prompts_cn/<agent>_cn.md`; keep per-backend
  frontmatter in `agents/backends/*/agents.json` in sync; then assemble.
- **Backend-specific text** → `{{slot:<name>}}` placeholders in
  `agents/prompts/*.md`; per-backend content in
  `agents/backends/<name>/slots/<name>.md`. A slot referenced by any prompt
  must exist for every backend or assembly fails.
- **Behavior rules** → `agents/backends/opencode/AGENTS.md`, one rule per
  concern. Do not duplicate rules between this root file and it.
- **Model / variant / displayName / council presets** →
  `agents/backends/opencode/oh-my-opencode-slim.jsonc`. Keep JSONC parseable
  (comments and trailing commas allowed).
- **Prompt tuning** → append-only, via
  `agents/backends/opencode/oh-my-opencode-slim/<agent>_append.md`
  (`orchestrator_append.md` is the working example). A full `<agent>.md`
  replacement must restate the entire bundled prompt and is a last resort.
- **Terminology**: in prose and docs, call the plugin **omos**. Keep the full
  name `oh-my-opencode-slim` in paths and filenames.
- **Consent**: anything that makes OpenCode download or execute code (the
  plugin pin) must stay behind explicit user consent. Never widen it silently.

## Target projects

After `npx my-agents`, the target owns the same tree: edit its `agents/`
source and run `npx my-agents assemble` there; `assemble --check` detects
drift. Retune the model mapping to the providers and budget available in the
target, and replace this root file with the target project's own instructions.
