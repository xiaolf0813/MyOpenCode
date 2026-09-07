# oh-my-opencode-slim 代理提示词

通过运行时 `getAgentConfigs()` 提取（包含任务拒绝指令、路由规则、council 模式块，以及实际提供给 OpenCode 的 displayName 注入）。

- **orchestrator**（主代理）：`orchestrator.md`
- **explorer**（子代理）：`explorer.md`
- **librarian**（子代理）：`librarian.md`
- **oracle**（子代理）：`oracle.md`
- **designer**（子代理）：`designer.md`
- **fixer**（子代理）：`fixer.md`
- **observer**（子代理）：`observer.md`
- **council**（全体）：`council.md`
- **councillor**（子代理）：`councillor.md` — 代表席位的提示词；每个预设席位（`councillor-<name>`）都以自己的模型复用此模板
