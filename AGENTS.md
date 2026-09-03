# AGENTS.md

This repository is a **template**, not an application: it ships a portable
OpenCode agent setup built on the `oh-my-opencode-slim` plugin (short name:
**omos**). The deliverable is the `.opencode/` tree. This file is auto-loaded
from the repo root on every run, so keep it structural and lean.

There is no build and no test suite. Validation means: the edited file still
parses, and the change applies on the next OpenCode run (restart OpenCode to
activate immediately).

## Layout

| Path | Role |
| --- | --- |
| `.opencode/opencode.jsonc` | OpenCode core config. Its `instructions` array loads `.opencode/AGENTS.md` into every run. |
| `.opencode/AGENTS.md` | Agent behavior rules (currently Fact Discipline). Single source of truth for cross-agent discipline. |
| `.opencode/oh-my-opencode-slim.jsonc` | omos project config: per-agent model, variant, displayName (e.g. `fixer` → `SoftwareEngineer`) and council presets. Merged over the user-level omos config. |
| `.opencode/oh-my-opencode-slim/` | Prompt overrides for omos agents. |
| `.opencode/package.json` | Plugin node dependencies (auto-installed by opencode). |

`.opencode/.gitignore` keeps `node_modules/`, lockfiles, and `package.json`
out of git: commit the configuration, never the installed artifacts.

## Editing conventions

- **Behavior rules** → append to `.opencode/AGENTS.md`, one rule per concern.
  Do not duplicate rules between this root file and `.opencode/AGENTS.md`.
- **Model / variant / displayName / council presets** → edit the matching
  block in `.opencode/oh-my-opencode-slim.jsonc`. Keep JSONC parseable
  (comments and trailing commas allowed).
- **Prompt tuning** → append-only, via
  `.opencode/oh-my-opencode-slim/<agent>_append.md` (`orchestrator_append.md`
  is the working example). This template standardizes on append files; a full
  `<agent>.md` replacement must restate the entire bundled prompt and is a
  last resort.
- **Terminology**: in prose and docs, call the plugin **omos**. Keep the full
  name `oh-my-opencode-slim` in paths and filenames.

## Adopting the template

Copy `.opencode/` into the target project, then retune the agent model mapping
to the providers and budget available there. Replace this root file with the
target project's own instructions.
