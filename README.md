# my-agents

Portable [OpenCode](https://opencode.ai) + Claude Code + ZCode agent setup,
installed into your project (or, for ZCode, your user level) with one command.

```bash
npx my-agents
```

`my-agents` copies a curated multi-agent configuration into the current
project:

- **`.opencode/`** — OpenCode core config, cross-agent discipline rules, and
  (optionally) the
  [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)
  plugin setup (short name: **omos**): eight specialized agents —
  `orchestrator`, `explorer`, `librarian`, `oracle`, `designer`, `fixer`,
  `observer`, `improver` — plus multi-model council presets.
- **`.claude/`** — the same specialists as native Claude Code subagents
  (`.claude/agents/*.md`). omos-agnostic: installed identically in every
  scheme.
- **`~/.zcode/`** — opt-in ZCode support (`--zcode`): user-level global
  instructions plus the specialist subagents as ZCode user agents
  (`~/.zcode/agents/*.md`). Nothing is written inside the project.

## Two OpenCode schemes

| | non-omos (default) | omos (consent required) |
| --- | --- | --- |
| `.opencode/agents/*.md` | ✅ native subagents | — (the plugin provides agents) |
| omos config + prompt overrides | — | ✅ |
| `"plugin": ["oh-my-opencode-slim"]` in `opencode.jsonc` | — | ✅ pinned |
| network download / plugin execution | none | on next `opencode` start, via Bun |

Consent is asked on interactive terminals (`[Y/n]`); non-interactive runs
default to the non-omos scheme — nothing is ever downloaded without your
explicit agreement. The actual download and plugin execution are performed by
OpenCode itself on the next start, driven solely by the pin you consented to.

If a user-level omos install is detected (`~/.config/opencode`), omos files
are copied without pinning the plugin entry, to avoid double-loading.

## Usage

```bash
npx my-agents                    # install both .opencode/ and .claude/
npx my-agents --opencode         # OpenCode setup only
npx my-agents --claude           # Claude Code setup only
npx my-agents --pin-omos         # enable the omos scheme without asking
npx my-agents --no-omos          # keep the non-omos scheme
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
    │   ├── opencode.jsonc        # core config
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
