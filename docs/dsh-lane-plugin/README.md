# DSH lane plugin — design record

Internal notes for the `--dsh` lane plugin. **Not shipped**: `package.json`'s `files` whitelist covers `bin/`, `agents/prompts/` and `agents/backends/` only, so everything here stays in the repository.

| File | What it is |
| --- | --- |
| `FEASIBILITY.md` | The investigation behind the design: the plugin-package contract, how client halves are discovered and served, how `name:` resolves for a preset row versus a profile row, the settings-persistence contract, and how prompts ship — each claim with a file:line citation from the installed deployment. |
| `PLAN.md` | The chosen form (preset-mounted host half + profile-mounted settings page), package layout, install/verify/rollback steps, variants, and the decisions that were left to the user. Phase-3 amendment at the end. |
| `UPSTREAM-ISSUE.md` | Draft report for the upstream stale-remount leak: the minimal reproduction, the root cause with file:line citations, and how to post it (upstream Issues are off; Discussions Q&A is the channel). |

The shipped code lives beside the composition it belongs to: `agents/backends/dsh/lane-plugin/` (host half) and `agents/backends/dsh/lane-plugin-ui/` (settings page).

## Runtime mechanics that constrain edits

Two deployment behaviours are not visible in the source and routinely surprise a change to the lane plugin.

**Reinstalling re-mounts without disposing the previous mount.** `ensureStanding` (`nm/dsh-agent-presets/lib/index.js:1768-1776`) drops a standing mount whose composition stamp changed and mounts a fresh one *without* disposing the old scope, so the previous `my-workbench-lanes` registration is still live when the new `apply()` runs. `settings.register()` therefore throws on the taken name — the shipped host half catches that, logs it, and reads through the surviving registration, whose schema and base are identical. Removing that tolerance makes `my-workbench --dsh --force` wedge the preset until a DSH restart.

**A host-half change needs a full DSH restart.** The preset row is imported once per process: Node's ESM cache holds the first import, and the loader re-imports the same specifier when it re-mounts a stale composition. So `--dsh --force` alone leaves a running DSH on the previous host code. The settings page is a browser module instead — a page reload picks up a changed bundle.
