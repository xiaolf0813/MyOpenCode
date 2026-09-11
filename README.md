# my-agents

Portable [OpenCode](https://opencode.ai) + Claude Code + ZCode agent setup,
installed into your project (or, for ZCode, your user level) with one command.

```bash
npx my-agents
```

`my-agents` copies a curated multi-agent configuration into the current
project:

- **`.opencode/`** — OpenCode core config, cross-agent discipline rules, and
  native `.opencode/agents/` subagents: eight specialized agents —
  `orchestrator`, `explorer`, `librarian`, `oracle`, `designer`, `fixer`,
  `observer`, `improver`. Add the separate `--omos` target on top for the
  [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)
  plugin scheme (short name: **omos**): multi-model council presets and
  prompt overrides.
- **`.claude/`** — the same specialists as native Claude Code subagents
  (`.claude/agents/*.md`). omos-agnostic: installed identically in every
  target.
- **`~/.zcode/`** — opt-in ZCode support (`--zcode`): user-level global
  instructions plus the specialist subagents as ZCode user agents
  (`~/.zcode/agents/*.md`). Nothing is written inside the project.

## OpenCode targets: native or omos

OpenCode support comes as two independent targets:

- **`--opencode` (native)** — core config (`opencode.jsonc`, `AGENTS.md`)
  plus native `.opencode/agents/*.md` subagents. Requires the OpenCode app
  (`opencode` on PATH). Nothing is downloaded. When a user-level omos
  install is detected (`~/.config/opencode`), it installs the omos way
  instead (omits assets, no native agents) to avoid agent conflicts.
- **`--omos` (opt-in plugin scheme)** — copies only the omos project assets
  (oh-my-opencode-slim.jsonc, prompt overrides, plugin node dependencies)
  into `.opencode/`. Requires OpenCode **and** an existing user-level omos
  install (`~/.config/opencode`): the plugin loads from that user level, so
  my-agents never pins a `"plugin"` entry and never downloads anything.
  It cannot be combined with `--opencode`.

There is no consent flow: the explicit `--omos` flag is the explicit choice,
and the prerequisite check fails fast if omos is not already installed.

## Usage

```bash
npx my-agents                    # install both .opencode/ and .claude/
npx my-agents --opencode         # OpenCode setup only
npx my-agents --omos             # omos plugin scheme only (no native agents)
npx my-agents --claude           # Claude Code setup only
npx my-agents --force            # overwrite files that already exist
npx my-agents --dry-run          # preview without writing
npx my-agents --zcode            # ZCode user-level setup only (~/.zcode)
npx my-agents assemble [--check] # in this repo: regenerate .claude/agents/ and .opencode/
```

Existing files are skipped unless `--force` is given, so re-running is safe.

## ZCode target

`npx my-agents --zcode` installs ZCode support at **user level only**:
`~/.zcode/AGENTS.md` (global instructions for the main agent) and
`~/.zcode/agents/*.md` (subagents). ZCode has no configurable main agent and
no project-level subagents, so there is nothing to install inside a project.

- The global file is composed from `agents/backends/zcode/AGENTS.md`
  (platform notes) plus `agents/prompts/orchestrator.md` — the orchestrator
  prompt drives the main agent.
- Subagents run with `injectAgentsMd: false`: the global file is not
  injected into them, so every delegation brief must carry full context.
- Opt-in only (`--zcode` or `zcode`) — the default targets remain
  `.opencode/` + `.claude/`. No omos, nothing downloaded. Existing files
  are skipped unless `--force`. Restart ZCode sessions to pick up changes.

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
    │   ├── AGENTS.md             # discipline rules
    │   └── opencode.jsonc        # core config
    ├── omos/
    │   ├── oh-my-opencode-slim.jsonc       # omos project config
    │   ├── oh-my-opencode-slim/  # prompt overrides (<agent>_append.md)
    │   └── package.json          # plugin node dependencies
    └── zcode/
        ├── AGENTS.md       # global-file header, composed with prompts/orchestrator.md
        ├── agents.json     # per-agent frontmatter fields (description/model/injectAgentsMd)
        └── slots/          # dispatch.md, fix_targets.md (every backend has these; not enumerated here)
```

In your project, `.claude/agents/` and `.opencode/` are assembled from it.
Edit `agents/`, then run `npx my-agents assemble` (`--check` detects drift)
— the same workflow works in this repository and in any target project.
Prompt bodies may reference `{{slot:<name>}}` placeholders; each backend
supplies their text in `agents/backends/<backend>/slots/`, and a slot
referenced by a prompt but missing for a backend fails assembly.

## Attribution

Agent prompts are adapted from
[oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)
(MIT License, © 2025); every derived prompt file carries the notice.
`agents/prompts_cn/` exists for reference only and is never packaged.

## License

MIT.
