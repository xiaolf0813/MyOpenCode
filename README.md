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
- **`~/.dsh/`** — opt-in DeepSeek Harness support (`--dsh`): one agent preset under `<DSH_HOME>/.agent-presets/my-workbench/` — the orchestrator prompt as the preset persona, plus a packaged **lane plugin** that owns the seven named specialist tools and a settings page for pinning each lane's model and reasoning effort. The tools are preset-scoped; the settings page needs one inert profile row, the entire profile-level footprint. Nothing is written inside the project.

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
- `agent.cordis.yml` — the composition: the orchestrator prompt as the preset's persona, the full standard tool set, and **one row** naming the lane plugin.
- `lane-plugin/` — a packaged plugin the preset mounts. It owns the seven specialist tools and their prompts, so a lane's route can be pinned and persists.
- `lane-plugin-ui/` — the settings page, packaged separately and mounted by **one inert profile row** (see below). This is the whole profile-level footprint.

**Lane plugin layout**

```
lane-plugin/                        # preset row: ./lane-plugin/src/index.js
├── package.json                    # name my-workbench-lanes (host only, no client half)
├── src/index.js                    # host half: the 7 delegation tools + the settings namespace
└── src/prompts.generated.js        # the 7 prompts, rendered from agents/prompts/*.md

lane-plugin-ui/                     # profile row: file:///…/lane-plugin-ui/src/index.js
├── package.json                    # name my-workbench-lanes-ui, exports "./client", dsh.client.platform "web"
├── src/index.js                    # inert host half: registers nothing at all
└── lib/client.js                   # hand-written browser half: the settings page
```

- The host row's `name` is **relative** (`./lane-plugin/src/index.js`): a preset row's bare package name resolves from the host composition's base, not from the preset directory, so a package shipped alongside the composition would not be found.
- The host half's two deployment imports (`@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery`) are baked into its installed `src/index.js` as absolute `file:` URLs **at install time**, resolved from your DSH home. That is why no dependency command is ever needed.
- The plugin must be named by this preset **only**: it registers a settings namespace, and DSH refuses a duplicate registration, so a second preset mounting the same row would fail loudly.

**Why one profile row (and what it costs)**

DSH discovers browser ("client") plugin halves by scanning the **profile loader's own entries** — an agent preset is a separate loader tree mounted under a scope, so a row inside it is never scanned, its page is never served, and `clientModules.clientPath(...)` stays `undefined`. The host half mounts and its settings namespace registers; only the page needs the profile. So `--dsh` also maintains **one marked, managed block** in `<DSH_HOME>/profiles/<profile>/cordis.patch.yml` holding a single inert row:

```yaml
# >>> my-workbench lane settings page (managed block - regenerated by `my-workbench --dsh`) >>>
- insert:
    - id: my-workbench-lanes-ui
      name: 'file:///…/.agent-presets/my-workbench/lane-plugin-ui/src/index.js'
# <<< my-workbench lane settings page <<<
```

- The block is replaced **in place** on every run; your own rows and comments are never touched or reordered. `--dry-run` writes nothing.
- The row is inert: `lane-plugin-ui` declares **no dependencies at all**, registers no tool, no prompt section and no service. No bundle layer changes and nothing is installed into any `node_modules`.
- The page is registered **synchronously** from `apply()` and decides inside the component what to show: live controls while the lane host half's `my-workbench-lanes` namespace is registered, an inert placeholder otherwise. Registering after an `await` left the shell's ledger entry `active: false` and the settings panel blank, which is why the decision moved into the component.
- A deployment that never mounts MyWorkbench therefore sees the nav entry with **no controls and no write path**. Once any MyWorkbench session has mounted the host half (the namespace is process-global), the same page is live from every session — it edits pins that only MyWorkbench sessions consume.
- The component re-reads the namespace each time the section is opened, so the page needs **one page reload** to pick up a changed bundle, not to pick up a mounted host half.
- If no single profile directory can be found, nothing is written to any profile and the exact row is printed for you to paste by hand.

**Delegation and per-lane routing**

- Delegation is native. The model calls `subagent_explorer`, `subagent_librarian`, `subagent_oracle`, `subagent_ui_designer`, `subagent_fixer`, `subagent_observer`, or `subagent_improver` instead of naming a subagent type in a Task tool. Lanes run in the background by default and answer with a durable child id, which `send_message` continues — that is the session handle the orchestrator prompt talks about.
- Each tool carries that specialist's prompt, rendered from `agents/prompts/*.md`, and restricts the child the way the prompt does: read-only lanes lose `write`/`edit`, `observer` and `improver` also lose the shell, and every lane loses the delegation tools, so lanes cannot spawn lanes.
- **Per-lane model and reasoning effort.** Open the DSH web GUI's settings and pick **MyWorkbench 赛道模型**: one row per lane with a model select and a reasoning-effort select, plus 应用 / 全部改回继承 / 刷新模型目录. Writes go to the plugin's own settings namespace and persist to `<DSH_HOME>/settings.yaml`, so they survive a DSH restart. A fresh install is seeded from a recommended mapping shipped as the namespace's composition base layer; leave a lane on 继承会话模型 to inherit the session's route.
- Opt-in only (`--dsh` or `dsh`) — the default targets remain `.opencode/` + `.claude/`. It requires an existing DSH home, downloads nothing, and skips existing files unless `--force`. Open a new DSH session to pick the preset up.

**Install, verify, roll back**

```bash
npx my-workbench --dsh --force        # (re)write ~/.dsh/.agent-presets/my-workbench/
                                      # + the one managed row in ~/.dsh/profiles/web/cordis.patch.yml
```

Order matters: install → **start a new DSH session** on the MyWorkbench preset (that mounts the lane host half) → **reload the web page** (that runs the page's gate) → check `settings → MyWorkbench 赛道模型` shows seven lanes. Also confirm the seven `subagent_*` tools are listed and that a pinned lane's child session header carries the pinned provider/model/effort.

To roll back: remove the managed block from the profile's `cordis.patch.yml` **and** delete `~/.dsh/.agent-presets/my-workbench` (`rm -rf`). `npx my-workbench --dsh --force` restores both. What remains after a rollback is at most an inert `my-workbench-lanes:` section in `~/.dsh/settings.yaml`.

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
        ├── lane-plugin/      # the preset-mounted HOST half (design record: docs/dsh-lane-plugin/)
        │   ├── prompts.template.js    # {{prompt:<agent>}} per lane -> src/prompts.generated.js
        │   └── host-package/          # ESM plugin package: 7 lane tools + settings namespace
        │       ├── package.json
        │       └── src/index.js       # {{dep:<alias>}} is resolved to a file: URL at install
        ├── lane-plugin-ui/   # the profile-mounted settings PAGE
        │   ├── package.json           # exports "./client", dsh.client.platform "web"
        │   ├── src/index.js           # inert host half (registers nothing)
        │   └── lib/client.js          # hand-written browser half
        └── slots/            # dispatch.md ({{slot:dispatch}} inside the orchestrator prompt)
```

In your project, `.claude/agents/` and `.opencode/` are assembled from it. Edit `agents/`, then run `npx my-workbench assemble` (`--check` detects drift) — the same workflow works in this repository and in any target project. Prompt bodies may reference `{{slot:<name>}}` placeholders; each backend supplies their text in `agents/backends/<backend>/slots/`, and a slot referenced by a prompt but missing for a backend fails assembly. A backend template — `agents/backends/dsh/agent.cordis.yml` — may also reference `{{prompt:<agent>}}`, which embeds that whole prompt body in place instead of duplicating it; the lane plugin's `prompts.template.js` uses the same placeholder, rendered into a JS data module rather than a YAML block. `assemble --check` renders both and also proves that the prompt template, the host roster and the settings page name the same seven lanes, that both host modules parse, that the page's package declares the `dsh.client`/`./client` pair DSH scans for with a module id matching its name, that its `require` list stays inside the shell's nine seed modules, and that its inert host half imports and registers nothing — so a placeholder this tree can no longer resolve, or a `require` the browser could never answer, fails the check rather than the install or a DSH session.

## Attribution

Agent prompts are adapted from [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) (MIT License, © 2025); every derived prompt file carries the notice. `agents/prompts_cn/` exists for reference only and is never packaged.

## License

MIT.
