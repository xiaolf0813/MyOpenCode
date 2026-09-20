# my-workbench

English | [简体中文](README_CN.md)

Portable [OpenCode](https://opencode.ai) + Claude Code + ZCode + DeepSeek Harness agent setup, installed into your project (or at user level with `--user`; ZCode and DSH are always user-level) with one command.

```bash
npx my-workbench
```

`my-workbench` copies a curated multi-agent configuration into the current project:

- **`.opencode/`** — OpenCode core config and native `.opencode/agents/` subagents: eight specialized agents — `orchestrator`, `explorer`, `librarian`, `oracle`, `ui-designer`, `fixer`, `observer`, `improver`. Add the separate `--omos` target on top for the [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) plugin scheme (short name: **omos**): multi-model council presets and prompt overrides.
- **`.claude/`** — the same specialists as native Claude Code subagents (`.claude/agents/*.md`). omos-agnostic: installed identically in every target.
- **`~/.zcode/`** — opt-in ZCode support (`--zcode`): user-level global instructions plus the specialist subagents as ZCode user agents (`~/.zcode/agents/*.md`). Nothing is written inside the project.
- **`~/.dsh/`** — opt-in DeepSeek Harness support (`--dsh`): one agent preset under `<DSH_HOME>/.agent-presets/my-workbench/` — the orchestrator prompt as the preset persona, plus one named delegation tool per specialist. Nothing is written inside the project.

## OpenCode targets: native or omos

OpenCode support comes as two independent targets:

- **`--opencode` (native)** — core config (`opencode.jsonc`) plus native `.opencode/agents/*.md` subagents. Requires the OpenCode app (`opencode` on PATH). Nothing is downloaded. Universal behavior rules (the "Disciplines" section) live inside the orchestrator prompt and are copied verbatim to the top of every delegation brief. When a user-level omos install is detected (`~/.config/opencode`), it installs the omos way instead (omits assets, no native agents) to avoid agent conflicts.
- **`--omos` (opt-in plugin scheme)** — copies only the omos project assets (oh-my-opencode-slim.jsonc, prompt overrides, plugin node dependencies) into `.opencode/`. Requires OpenCode **and** an existing user-level omos install (`~/.config/opencode`): the plugin loads from that user level, so my-workbench never pins a `"plugin"` entry and never downloads anything. It cannot be combined with `--opencode`.

There is no consent flow: the explicit `--omos` flag is the explicit choice, and the prerequisite check fails fast if omos is not already installed.

## Usage

```bash
npx my-workbench                    # install both .opencode/ and .claude/
npx my-workbench --opencode         # OpenCode setup only
npx my-workbench --omos             # omos plugin scheme only (no native agents)
npx my-workbench --claude           # Claude Code setup only
npx my-workbench --user             # user-level install: ~/.config/opencode/ + ~/.claude/
npx my-workbench --force            # overwrite files that already exist
npx my-workbench --dry-run          # preview without writing
npx my-workbench --zcode            # ZCode user-level setup only (~/.zcode)
npx my-workbench --dsh              # DSH agent preset only (~/.dsh)
npx my-workbench assemble [--check] # in this repo: regenerate .claude/agents/ and .opencode/
```

Existing files are skipped unless `--force` is given, so re-running is safe.

## User-level install

`npx my-workbench --user` installs the same assets at user level instead of the current project: OpenCode/omos assets go to `~/.config/opencode/` (its XDG config directory; global agents are read from `~/.config/opencode/agents/`) and Claude Code assets to `~/.claude/` (`settings.json` + `agents/*.md`). User-level files apply to every project and are not meant for version control; on name conflicts project-level agents win over user-level ones. ZCode is always user-level and ignores `--user`.

## ZCode target

`npx my-workbench --zcode` installs ZCode support at **user level only**: `~/.zcode/AGENTS.md` (global instructions for the main agent) and `~/.zcode/agents/*.md` (subagents). ZCode has no configurable main agent and no project-level subagents, so there is nothing to install inside a project.

- The global file is composed from `agents/backends/zcode/AGENTS.md` (platform notes) plus `agents/prompts/orchestrator.md` — the orchestrator prompt drives the main agent.
- Subagents run with `injectAgentsMd: false`: the global file is not injected into them, so every delegation brief must carry full context.
- Opt-in only (`--zcode` or `zcode`) — the default targets remain `.opencode/` + `.claude/`. No omos, nothing downloaded. Existing files are skipped unless `--force`. Restart ZCode sessions to pick up changes.

## DSH target

`npx my-workbench --dsh` installs one [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) **agent preset** at user level: `<DSH_HOME>/.agent-presets/my-workbench/` (`DSH_HOME`, else `~/.dsh`). DSH reads presets from its home, so there is nothing to install inside a project.

- `preset.yml` — display name and description for the preset picker.
- `agent.cordis.yml` — the composition: the orchestrator prompt as the preset's persona, the full standard tool set, and one `@deepseek-ai/dsh-tool-subagent` row per specialist.
- Each specialist row carries that specialist's prompt as its child persona and restricts the child's tools the way the prompt does: read-only lanes lose `write`/`edit`, `observer` and `improver` also lose the shell, and every lane loses the delegation tools, so lanes cannot spawn lanes.
- Delegation is native. The model calls `subagent_explorer`, `subagent_librarian`, `subagent_oracle`, `subagent_ui_designer`, `subagent_fixer`, `subagent_observer`, or `subagent_improver` instead of naming a subagent type in a Task tool. Lanes run in the background by default and answer with a durable child id, which `send_message` continues — that is the session handle the orchestrator prompt talks about.
- Opt-in only (`--dsh` or `dsh`) — the default targets remain `.opencode/` + `.claude/`. It requires an existing DSH home, downloads nothing, and skips existing files unless `--force`. Open a new DSH session to pick the preset up. Lanes inherit the orchestrator's model route unless you pin `agentOptions` on a row (the installed file documents where).

## Single source, assembled output

Everything is generated from one tree, `agents/`:

```
agents/
├── prompts/          # each agent prompt body, once (omos attribution included)
├── prompts_cn/       # Chinese reference translations (never packaged)
└── backends/         # everything backend-specific; each backend may carry slots/*.md
                      # (per-backend text substituted for {{slot:...}} placeholders in agents/prompts/)
    ├── claude/
    │   ├── settings.json   # main-thread agent setting
    │   └── agents.json     # per-agent frontmatter (name/tools/model)
    ├── opencode/
    │   ├── agents.json           # per-agent frontmatter (description/mode/tools)
    │   └── opencode.jsonc        # core config
    ├── omos/
    │   ├── oh-my-opencode-slim.jsonc       # omos project config
    │   ├── oh-my-opencode-slim/  # prompt overrides (<agent>_append.md)
    │   └── package.json          # plugin node dependencies
    ├── zcode/
    │   ├── AGENTS.md       # global-file header, composed with prompts/orchestrator.md
    │   ├── agents.json     # per-agent frontmatter fields (description/model/injectAgentsMd)
    │   └── slots/          # dispatch.md (every backend has it; not enumerated here)
    └── dsh/
        ├── agent.cordis.yml  # preset composition; {{prompt:<agent>}} embeds prompts/<agent>.md
        ├── preset.yml        # preset display metadata (name/description)
        └── slots/            # dispatch.md ({{slot:dispatch}} inside the orchestrator prompt)
```

In your project, `.claude/agents/` and `.opencode/` are assembled from it. Edit `agents/`, then run `npx my-workbench assemble` (`--check` detects drift) — the same workflow works in this repository and in any target project. Prompt bodies may reference `{{slot:<name>}}` placeholders; each backend supplies their text in `agents/backends/<backend>/slots/`, and a slot referenced by a prompt but missing for a backend fails assembly. A backend template — `agents/backends/dsh/agent.cordis.yml` — may also reference `{{prompt:<agent>}}`, which embeds that whole prompt body in place instead of duplicating it; `assemble --check` renders the DSH composition so a placeholder this tree can no longer resolve fails the check rather than the install.

## Attribution

Agent prompts are adapted from [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) (MIT License, © 2025); every derived prompt file carries the notice. `agents/prompts_cn/` exists for reference only and is never packaged.

## License

MIT.
