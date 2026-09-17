[English](README.md) | 简体中文

# my-agents

可移植的 [OpenCode](https://opencode.ai) + Claude Code + ZCode 智能体配置，一条命令安装到你的项目（或用 `--user` 安装到用户级；ZCode 恒为用户级）。

> 本文件为参考翻译，以[英文版](README.md)为准。

```bash
npx my-agents
```

`my-agents` 将一套精心整理的多智能体配置复制到当前项目：

- **`.opencode/`** — OpenCode 核心配置与原生 `.opencode/agents/` 子智能体：八个专职智能体 — `orchestrator`、`explorer`、`librarian`、`oracle`、`designer`、`fixer`、`observer`、`improver`。在此之上可用独立的 `--omos` 目标启用 [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) 插件方案（简称 **omos**）：多模型议会预设与提示词覆盖。
- **`.claude/`** — 同一批专家智能体的 Claude Code 原生子智能体形态（`.claude/agents/*.md`）。与 omos 无关：所有目标中安装内容完全一致。
- **`~/.zcode/`** — 可选的 ZCode 支持（`--zcode`）：用户级全局指令，外加各专家子智能体作为 ZCode 用户级 agents（`~/.zcode/agents/*.md`）。不在项目内写入任何内容。

## OpenCode 目标：原生或 omos

OpenCode 支持分为两个独立目标：

- **`--opencode`（原生）** — 核心配置（`opencode.jsonc`）加原生 `.opencode/agents/*.md` 子智能体。要求已安装 OpenCode（PATH 上有 `opencode`）。不下载任何东西。通用行为规则（"Disciplines" 一节）位于 orchestrator 提示词内，并逐字复制到每个委派简报的顶部。检测到用户级 omos 安装（`~/.config/opencode`）时，会改为按 omos 方式安装（省略资产、不装原生 agents），以避免智能体冲突。
- **`--omos`（可选插件方案）** — 仅复制 omos 项目资产（oh-my-opencode-slim.jsonc、提示词覆盖、插件 node 依赖）到 `.opencode/`。要求 OpenCode **且**已存在用户级 omos 安装（`~/.config/opencode`）：插件从用户级加载，因此 my-agents 永不固定 `"plugin"` 条目、永不下载任何东西。不能与 `--opencode` 同时使用。

没有确认流程：显式的 `--omos` 旗标即显式选择；若 omos 尚未安装，前置检查直接快速失败。

## 用法

```bash
npx my-agents                    # 安装 .opencode/ 和 .claude/
npx my-agents --opencode         # 仅 OpenCode 配置
npx my-agents --omos             # 仅 omos 插件方案（无原生 agents）
npx my-agents --claude           # 仅 Claude Code 配置
npx my-agents --user             # 用户级安装：~/.config/opencode/ + ~/.claude/
npx my-agents --force            # 覆盖已存在的文件
npx my-agents --dry-run          # 预览，不写入
npx my-agents --zcode            # 仅 ZCode 用户级安装（~/.zcode）
npx my-agents assemble [--check] # 本仓库内：重新生成 .claude/agents/ 和 .opencode/
```

除非给出 `--force`，已存在的文件会被跳过，因此重复运行是安全的。

## 用户级安装

`npx my-agents --user` 将同样的资产安装到用户级而非当前项目：OpenCode/omos 资产进入 `~/.config/opencode/`（其 XDG 配置目录；全局 agents 从 `~/.config/opencode/agents/` 读取），Claude Code 资产进入 `~/.claude/`（`settings.json` + `agents/*.md`）。用户级文件对所有项目生效，不用于版本控制；命名冲突时项目级 agents 优先于用户级。ZCode 恒为用户级，忽略 `--user`。

## ZCode 目标

`npx my-agents --zcode` 仅在**用户级**安装 ZCode 支持：`~/.zcode/AGENTS.md`（主智能体的全局指令）和 `~/.zcode/agents/*.md`（子智能体）。ZCode 没有可配置的主智能体，也没有项目级子智能体，因此项目内无需安装任何内容。

- 全局文件由 `agents/backends/zcode/AGENTS.md`（平台说明）加 `agents/prompts/orchestrator.md` 组合而成 — orchestrator 提示词驱动主智能体。
- 子智能体以 `injectAgentsMd: false` 运行：全局文件不会注入它们，因此每个委派简报必须自带完整上下文。
- 仅按需启用（`--zcode` 或 `zcode`）— 默认目标仍是 `.opencode/` + `.claude/`。无 omos，不下载任何东西。已存在的文件除非 `--force` 否则跳过。重启 ZCode 会话以生效。

## 单一来源，组装输出

一切由一棵树 `agents/` 生成：

```
agents/
├── prompts/          # 每个智能体的提示词正文，仅一份（含 omos 署名声明）
├── prompts_cn/       # 中文参考翻译（永不打包）
└── backends/         # 所有后端专属内容；每个后端可带 slots/*.md
                      # （后端专属文本，替换 agents/prompts/ 中的 {{slot:...}} 占位符）
    ├── claude/
    │   ├── settings.json   # 主线程智能体设置
    │   └── agents.json     # 每个智能体的 frontmatter（name/tools/model）
    ├── opencode/
    │   ├── agents.json           # 每个智能体的 frontmatter（description/mode/tools）
    │   └── opencode.jsonc        # 核心配置
    ├── omos/
    │   ├── oh-my-opencode-slim.jsonc       # omos 项目配置
    │   ├── oh-my-opencode-slim/  # 提示词覆盖（<agent>_append.md）
    │   └── package.json          # 插件 node 依赖
    └── zcode/
        ├── AGENTS.md       # 全局文件头部，与 prompts/orchestrator.md 组合
        ├── agents.json     # 每个智能体的 frontmatter 字段（description/model/injectAgentsMd）
        └── slots/          # dispatch.md（每个后端都有，不逐一列出）
```

在你的项目中，`.claude/agents/` 和 `.opencode/` 由它组装而来。编辑 `agents/`，然后运行 `npx my-agents assemble`（`--check` 检测漂移）— 同样的工作流适用于本仓库和任何目标项目。提示词正文可以引用 `{{slot:<name>}}` 占位符；每个后端在 `agents/backends/<backend>/slots/` 中提供对应文本，提示词引用了某后端缺失的 slot 会导致组装失败。

## 署名

智能体提示词改编自 [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)（MIT 许可证，© 2025）；每个衍生提示词文件都带有该声明。`agents/prompts_cn/` 仅供参考，永不打包。

## 许可证

MIT。
