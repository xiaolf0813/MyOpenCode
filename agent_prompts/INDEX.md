# oh-my-opencode-slim Agent Prompts

Extracted via runtime `getAgentConfigs()` (includes task-rejection instructions, routing rules, council-mode blocks, and displayName injection as actually served to OpenCode).

- **orchestrator** (primary): `orchestrator.md`
- **explorer** (subagent): `explorer.md`
- **librarian** (subagent): `librarian.md`
- **oracle** (subagent): `oracle.md`
- **designer** (subagent): `designer.md`
- **fixer** (subagent): `fixer.md`
- **observer** (subagent): `observer.md`
- **council** (all): `council.md`
- **councillor** (subagent): `councillor.md` — representative seat prompt; each preset seat (`councillor-<name>`) reuses this template with its own model
