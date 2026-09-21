# Prototype: per-lane model + reasoning effort for the MyWorkbench specialists

These two files are a **verbatim dump of the dynamic Cordis Package `lanes-4/pkg-7` (run-7)**, taken from the running DSH web profile on 2026-09-20 before the process could lose it. They are the starting point for the packaged ("formal") plugin; they are not a working package by themselves.

| File | What it is |
| --- | --- |
| `host.js` | Host half body: 7 delegation tools (`lane_explorer` … `lane_improver`) that spawn the matching specialist through `ctx.subagents.startContinuable` with a per-lane `agentOptions`, plus the Package-private RPC handlers `get-state` / `set-lanes`. |
| `client.js` | Client half body: one settings page registered in the `settings.section` slot (id `my-workbench-lanes`), with a model select and a reasoning-effort select per lane, and 应用 / 套用推荐映射 / 全部改回继承 / 刷新模型目录. |

Both files hold a **function body that returns a Cordis Plugin** — that is the shape the dynamic-plugin host evaluates. A packaged plugin must wrap the same logic as an ESM module exporting `name`, `inject` and `apply` (confirm the exact contract against `cordis-plugin-loader` before relying on it).

## What the prototype proved

- Pinning provider/model/reasoningEffort per lane works end to end: child sessions' own logs show the pinned route in their first `request/header` (`oracle → deepseek-official/deepseek-v4-pro / max`, `explorer → zai-coding-cn/glm-5.3-flash / low`).
- The settings page renders and writes through `host.call`, in the standard `settings.section` list slot, next to the shipped sections.

## Known limits to fix in the packaged form

1. **Pins live in process memory** — gone on restart. A real package registers a settings namespace (`ctx.settings.register`) so they persist in `~/.dsh/settings.yaml`.
2. **No `toolFilter` on the child** — the read-only guarantee of the preset rows was dropped: passing the preset's `subagent_*` names to `tools.restrict()` fails when the session's preset does not register them (`restrict() names unknown global tools …`). A plugin that owns its own tools knows which names exist and can apply the filter safely.
3. **The persona is scraped** out of the installed preset composition text (`agentPresets.read('my-workbench')` + an indentation parser). The packaged form should ship the prompts instead, rendered from the repository's single source (`agents/prompts/*.md` via the CLI's `{{prompt:<agent>}}` mechanism).
4. **RPC payloads must be lossless JSON** — an explicit `undefined` anywhere in a handler result is rejected (`… must be lossless JSON data`).
