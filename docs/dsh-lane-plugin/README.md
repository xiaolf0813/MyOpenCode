# DSH lane plugin — design record

Internal notes for the `--dsh` lane plugin. **Not shipped**: `package.json`'s
`files` whitelist covers `bin/`, `agents/prompts/` and `agents/backends/` only,
so everything here stays in the repository.

| File | What it is |
| --- | --- |
| `BACKLOG.md` | The open follow-ups as a handoff briefing (in Chinese): what is already shipped, the five remaining items with their acceptance criteria and guardrails, the suggested order, and an environment cheat-sheet. Start here to continue the work. |
| `FEASIBILITY.md` | The investigation behind the design: the plugin-package contract, how client halves are discovered and served, how `name:` resolves for a preset row versus a profile row, the settings-persistence contract, and how prompts ship — each claim with a file:line citation from the installed deployment. |
| `PLAN.md` | The chosen form (preset-mounted host half + profile-mounted settings page), package layout, install/verify/rollback steps, variants, and the decisions that were left to the user. Phase-3 amendment at the end. |
| `prototype/` | Verbatim dump of the dynamic Cordis Package (`lanes-4/pkg-7`) that proved the idea end to end before it was packaged. Reference only; superseded by `agents/backends/dsh/lane-plugin/`. |

The shipped code lives beside the composition it belongs to:
`agents/backends/dsh/lane-plugin/` (host half) and
`agents/backends/dsh/lane-plugin-ui/` (settings page).
