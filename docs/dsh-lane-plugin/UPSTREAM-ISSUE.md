# Upstream issue draft — stale preset re-mount leaks the previous mount's settings registration

**Target:** <https://github.com/deepseek-ai/deepseek-harness> (the `@deepseek-ai/dsh` deployment this was observed on) **Environment:** `@deepseek-ai/dsh` **0.1.5-rc.2** · Node **v24.15.0** · Windows **10.0.26200** (the mechanism is platform-independent)

## How to post this (upstream Issues are disabled)

`deepseek-ai/deepseek-harness` has **Issues turned off** and **Discussions turned on**, with the categories *Announcements · General · Ideas · Polls · Q&A · Show Your Plugins!* — there is no bug category. Post it in **Q&A** (or General) with a question-shaped opening, e.g.:

> **Should re-mounting a stale preset composition leak the previous mount's `settings` registration?**
> A preset row that calls `ctx.settings.register(…)` becomes unmountable in a running process once its composition file changes and the preset is mounted again; `remove()` plus a reinstall does not clear it, and only a full DSH restart recovers. Repro and the exact throw sites below — is the leak intended, and is disposing the stale scope before the re-mount the right fix?

Two more channels worth using alongside it:

- **In-app `/feedback`** in the DSH web GUI — the vendor's own surface, and it correlates the report with the session and telemetry, which a Discussion post cannot.
- **A local issue** (`gh issue create -R xiaolf0813/my-workbench`) so the leak stays tracked here while upstream has no issue tracker.

## Suggested title

`agent-presets: re-mounting a stale composition leaks the previous mount's settings namespace, wedging the preset until restart`

## Summary

An agent preset whose composition contains a row that registers a process-global service — concretely a plugin calling `ctx.settings.register(ns, schema, …)` — becomes permanently unmountable in a running process as soon as its composition file changes once and the preset is mounted again. The re-mount throws

```
settings namespace "<ns>" is already registered
```

wrapped as

```
agent-presets: preset "<id>" failed to mount: failed to apply loader entry <group> (cordis:group): failed to apply loader entry <row> (./…/index.js): settings namespace "<ns>" is already registered (<abs path to agent.cordis.yml>)
```

and the web GUI surfaces it as “can not switch to <preset>: …”. Removing the preset (`agentPresets.remove(id)`, the same call the GUI delete action makes) and re-installing it does **not** recover — the leaked registration survives. Only a full DSH restart clears it.

## Root cause

`AgentPresets.ensureStanding()` (`dsh-agent-presets/lib/index.js:1768-1803`) drops the cached standing mount when the composition's stamp changed and immediately re-mounts, **without disposing the previous scope**:

```js
const pending = this.standing.get(preset.id)
if (pending !== void 0) {
  const mounted = await pending
  const current = await compositionStamp(preset.path)          // { mtimeMs, size }
  if (current === void 0 || sameStamp(mounted.stamp, current)) return mounted
  if (this.standing.get(preset.id) === pending) this.standing.delete(preset.id)
  return this.ensureStanding(preset)                           // ← no `await mounted.scope.dispose()`
}
```

Registrations made by the previous mount are owned by that scope's fiber effects — `dsh-settings/lib/index.js:294-297` removes the namespace from the registry **only** from its `ctx.effect` disposer:

```js
this.ctx.effect(() => {
  this.registrations.set(parsedNs, registration)
  return () => this.registrations.delete(parsedNs)
}, `settings.register(${JSON.stringify(String(parsedNs))})`)
```

So an undisposed scope keeps its namespace registered for the process lifetime, and every later mount of the same preset fails at `dsh-settings/lib/index.js:283`:

```js
if (this.registrations.has(parsedNs)) throw new Error(`settings namespace "${parsedNs}" is already registered`)
```

`AgentPresets.remove(id)` shows the same leak: the preset directory is deleted (`Test-Path` → `False`) but the registration survives, so re-creating the preset and mounting it still fails.

## Minimal reproduction (~30 lines, no DSH internals)

1. Create a user preset at `$DSH_HOME/.agent-presets/repro/`:
   - `preset.yml` — `name: repro`, `description: repro`
   - `agent.cordis.yml`: ```yaml
     - id: ns name: ./plugin/src/index.js ```
   - `plugin/package.json` — `{ "name": "repro-ns", "private": true, "type": "module", "main": "src/index.js" }`
   - `plugin/src/index.js` — a preset row resolves `./`-relative names against the composition's own baseUrl (`dsh-agent-presets/lib/index.js:140-143`, `:665-676`), so a bare import of `@deepseek-ai/schemastery` does not resolve; bake an absolute `file:` URL instead: ```js import z from 'file:///ABS/PATH/TO/profiles/node_modules/@deepseek-ai/schemastery/lib/index.mjs' export const name = 'repro-ns' export const inject = ['settings'] export function apply(ctx) { ctx.settings.register('repro-ns', z.object({ value: z.string().default('x') }), {}) } ``` (Equivalently: any plugin row that registers into a host registry from a preset scope.)
2. **Mount it once** — from a plugin tool `await ctx.agentPresets.standingKeyFor('repro')`, or simply start a session on the preset. → succeeds.
3. **Change the composition's stamp** — e.g. append a comment line to `agent.cordis.yml` (mtime/size change is all it takes).
4. **Mount again** — same call. → **throws** `settings namespace "repro-ns" is already registered`. Expected: the second mount succeeds — the stale mount's scope is disposed before the new one applies (or the stale mount is reused rather than silently dropped).
5. Optional, shows the leak is unreachable: `await ctx.agentPresets.remove('repro')` → re-create the directory identically → mount again → **still throws**.

## Observed chronology on 0.1.5-rc.2 (Windows)

| Step | Result |
| --- | --- |
| `standingKeyFor('my-workbench')` | `MOUNT OK` — the plugin registered `my-workbench-lanes` |
| 4 × `my-workbench --dsh --force` (rewrites `agent.cordis.yml`: new mtime **and** size) | files replaced |
| `standingKeyFor('my-workbench')` | `MOUNT FAILED … settings namespace "my-workbench-lanes" is already registered (…\.agent-presets\my-workbench\agent.cordis.yml)` |
| `agentPresets.remove('my-workbench')` | returns; directory gone (`Test-Path` false) |
| `my-workbench --dsh --force` (reinstall, 8 files) | files created |
| `standingKeyFor('my-workbench')` | `MOUNT FAILED` — **same error** ⇒ `remove` did not release the leaked scope |

A corrected plugin cannot recover in-process either, because the row's module stays in Node's ESM cache under the same specifier (see the note below) — the process must be restarted.

## Suggested fix (either is enough)

1. **Dispose before re-mounting**: in `ensureStanding`, `await mounted.scope.dispose()` (or dispose as part of dropping the entry) before `return this.ensureStanding(preset)`, so the previous mount's effects — settings registrations included — are released.
2. **Or keep the old mount**: do not silently drop a settled mount on a stamp change; reuse it and offer an explicit reload path that disposes first.

`AgentPresets.remove(id)` should likewise dispose the mount it deletes.

## Secondary observation (may be intended)

`PresetTree.import` resolves through `ctx.loader.internal.import(row.specifier, base, {})` with no cache-busting query, so a re-mounted composition re-imports the **same module URL** and Node returns the cached module: a stale re-mount never picks up changed row code. Combined with the leak above, that makes “reinstall the plugin, then try again” impossible without a restart. If that is intended, a line in the standing-mount documentation would prevent a lot of confusion; otherwise stamping the specifier with the composition stamp would let re-mounts pick up new code.

## Impact

Any preset-mounted plugin that registers into a host registry (`ctx.settings.register`, and presumably other host registries) becomes unmountable after the first edit of its composition. The web GUI reports it as a switch failure (“无法切换到「…」”) that the user cannot clear from the UI — only a DSH restart helps.
