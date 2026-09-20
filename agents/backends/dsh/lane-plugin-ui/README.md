# lane-plugin-ui — the MyWorkbench lane settings page

A tiny DSH **client** plugin (plus a deliberately inert host half) that renders
*settings → MyWorkbench 赛道模型*: one row per specialist lane with a model select
and a reasoning-effort select, plus 应用 / 全部改回继承 / 刷新模型目录.

It owns no state. The pins themselves live in the `my-workbench-lanes` settings
namespace, registered by the lane host half in the MyWorkbench agent preset
(`../lane-plugin/`). This package only reads that namespace through
`ctx.remote.settings.describe()` and writes it through
`ctx.remote.settings.update(ns, patch, revision)` — there is no host RPC, and the
inert host half exists solely because the loader needs a module to mount.

## Why this is a profile row and not part of the preset

`dsh-client-modules` discovers client halves by scanning the **profile Loader's
own entries**:

- `nm/dsh-client-modules/lib/index.js:775-781` — `processOne()` iterates
  `this.ctx.loader.entries()`.
- An agent preset is a separate Loader tree mounted under a scope, so its rows are
  never scanned and `clientModules.clientPath('my-workbench-lanes')` stays
  `undefined`.
- `locatePkgJson` (`:679-709`) *does* support `./`-relative and `file:` row names —
  the Loader tree is the blocker, not the name form.

The lane host half therefore mounts correctly and its settings namespace is
registered, but no page is served from inside the preset. One profile row is the
only way in, and that row is this package's entire profile-level footprint.

## Footprint

| Where | What |
| --- | --- |
| `<DSH_HOME>/.agent-presets/my-workbench/lane-plugin-ui/` | this package, copied by `my-workbench --dsh` |
| `<DSH_HOME>/profiles/<profile>/cordis.patch.yml` | ONE marked, managed block containing one `insert:` row (`id: my-workbench-lanes-ui`, `name: file:///…/lane-plugin-ui/src/index.js`) |

Nothing else: no tools, no prompt sections, no services, no packages installed
into any `node_modules`, no dependencies at all (`package.json` declares none).

## Registration

`apply()` registers the `settings.section` page **synchronously** — no probe, no
`await` before `slots.register`. The component decides what to show:

- **Namespace present** → the seven lanes with a model select and an effort
  select.
- **Namespace absent** → an inert placeholder: no selects, no writes.

Why the gate moved into the component: registering *after* an `await` (the first
implementation probed `describe()` up to six times, 500 ms apart, before
registering) left the shell's ledger entry for this section `active: false`
while every other section was `active: true`. The nav entry appeared, the panel
rendered blank, and `clientPath(...)` was fine — the registration itself was the
problem, not discovery.

Consequences: a deployment that never mounts MyWorkbench shows the nav entry
with no controls and no write path; once any MyWorkbench session has mounted the
host half the namespace is process-global, so the page is live from every
session (it edits pins only MyWorkbench sessions consume). The component
re-reads the namespace every time the section is opened, so a page reload is
only needed to pick up a changed bundle.

A class error boundary (`RenderGuard`) wraps the page, so a throw in its render
pass shows the message in place instead of a blank panel.

## Verifying and rolling back

```powershell
# after `npx my-workbench --dsh --force` and a page refresh:
#   settings → MyWorkbench 赛道模型 shows seven lanes
Select-String -Path "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml" -Pattern 'my-workbench-lanes-ui'

# rollback: remove the preset directory AND the marked block
Remove-Item -Recurse -Force "$env:USERPROFILE\.dsh\.agent-presets\my-workbench"
```

`my-workbench --dsh --force` restores the preset and the block.
