# Feasibility: a packaged MyWorkbench lane plugin (model + reasoning effort per specialist)

Read-only investigation of the **installed** deployment on 2026-09-20. No process was restarted, no installer was run, nothing under `C:\Users\xiaolf\.dsh` was modified.

## Evidence base (path shorthands)

| Shorthand | Absolute path |
| --- | --- |
| `nm/` | `D:\Programs\node_global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\` |
| `dsh/` | `D:\Programs\node_global\node_modules\@deepseek-ai\dsh\` |
| `profile/` | `C:\Users\xiaolf\.dsh\profiles\web\` |
| `DSH_HOME/` | `C:\Users\xiaolf\.dsh\` |

Installed versions: DSH packages `0.1.5-rc.2` (`nm/dsh-tool-jobs/package.json:5`), `@deepseek-ai/cordis-plugin-loader` `1.0.3`, `@deepseek-ai/schemastery` `3.18.2`. `cordis-plugin-loader` and `cordis-plugin-include` ship readable **TypeScript source** under `src/`; other packages ship bundler output under `lib/` that keeps comments and line structure.

**Mount decision folded in:** the plugin is to be mounted by **one row inside the MyWorkbench agent preset** (`agents/backends/dsh/agent.cordis.yml` → installed as `DSH_HOME/.agent-presets/my-workbench/agent.cordis.yml`). Nothing goes into `profile/cordis.patch.yml` or any bundle layer. This document answers (a)–(e) first and then the five preset-scope consequences.

---

## (a) Host plugin package contract

**What the loader does with a row.** A row's `name` is imported and handed to the cordis registry:

- `nm/cordis-plugin-loader/src/config/entry.ts:280` — `plugin = this.loader.unwrapExports(await this.parent.tree.import(this.options.name, this.getOuterStack))`
- `nm/cordis-plugin-loader/src/config/entry.ts:296` — `fiber = this.fiber = this.ctx.registry.plugin(plugin, this.options.config, this.getOuterStack)`

`unwrapExports` accepts either shape, so **a named-export module is sufficient and a `default` export is optional**:

- `nm/cordis-plugin-loader/src/index.ts:193-198` — `exports = exports.default ?? exports` … `if (exports.__esModule) return exports.default ?? exports`

**What the module must export.** `name` (string), `apply` (function), and optionally `inject` (service names, string or object) and `Config` (a schemastery schema). Confirmed against two shipped packages, both of which use **named exports only**:

- `nm/dsh-tool-jobs/lib/index.js:15` `const name = "tool-jobs";`
- `nm/dsh-tool-jobs/lib/index.js:16-20` `const inject = ["tools","jobs","systemPrompt"];`
- `nm/dsh-tool-jobs/lib/index.js:21-26` `const Config = z.object({ waitTimeoutMs: z.number().min(1).default(3e4), … })`
- `nm/dsh-tool-jobs/lib/index.js:353` `export { Config, apply, inject, name, statusLine };`
- `nm/dsh-tool-todo/lib/index.js:196` `export { Config, apply, inject, name };`

`Config` is validated against the row's `config:` block; when the schema declares defaults, a row may omit those keys (`nm/dsh-tool-todo/lib/index.js` `Config` is consumed by the same `ctx.registry.plugin(plugin, config)` call).

**Row options** (the YAML keys a row may carry) are `EntryOptions`:

- `nm/cordis-plugin-loader/src/config/entry.ts:9-22` — `id`, `name`, `config`, `group`, `disabled`, `inject`.

**package.json fields that matter.** All shipped packages agree on the same three:

- `nm/dsh-tool-jobs/package.json` — `"type": "module"`, `"main": "lib/index.js"`, `"exports": { ".": { "types": "…", "default": "./lib/index.js" } }`.
- `nm/dsh-tool-todo/package.json` — same, plus a second subpath (`"./client"`, `"./invariant"`). A package may export several subpaths; a row names one of them.
- `type: "module"` is load-bearing: the import goes through Node's ESM loader (`nm/cordis-plugin-loader/src/config/tree.ts:155`), so a CommonJS `main` would need the `require`-interop branch of `unwrapExports` instead.

`"files"` is a publish whitelist, not a runtime contract.

**Conclusion.** The contract is: *an ESM module reachable at the row's `name`, exporting `name` + `apply` (+ optional `inject`, `Config`)*. No registration call, no manifest, no default export.

---

## (b) Client half — discovery, serving, and build requirement

### Chain

1. **Discovery is a `package.json` field plus one export key.**
   - `nm/dsh-client-modules/lib/index.js:647` `const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));`
   - `nm/dsh-client-modules/lib/index.js:648-650` `const dsh = pkg.dsh;` … `const decl = parseDshClient(packageName, dsh.client)` … `if (decl === void 0 || decl.platform !== "web") { … return null }` — **`dsh.client.platform` must be `"web"`**.
   - `nm/dsh-client-modules/lib/index.js:654-655` `const clientRel = clientExportOf(packageName, pkg.exports);` … `throw new Error(\`client-modules: ${packageName} declares dsh.client but exports no "./client" bundle\`)`
   - `nm/dsh-client-modules/lib/index.js:158` `const client = exportsField["./client"]` — the **export key `"./client"` is fixed, the file it points at is free** (`dshmarket@1.50.0` points it at `./client/client.js`).
   - `nm/dsh-client-modules/lib/index.js:659` `clientPath: join(dirname(pkgPath), clientRel)`

2. **Serving.** `nm/dsh-client-modules/lib/index.js:481-485` registers a webserver prefix route `{ kind: "prefix", path: "/plugins", handler: this.serveBundle }`; `:515-522` `fetchBundle(request)` is the no-webserver carrier.

3. **Index injection.** `nm/dsh-client-modules/lib/index.js:489-491` `ctx.on("webserver/index-inject", (table) => { table.push(...bootInjections(this.composed)) })`; `:426-430` pushes `{ kind: "global", name: "__DSH_BOOT__", value: graph }`, preceded by the inline queue facade at `:388-409` (`window.__ModuleLoader__={mode:"queue",…}`).

4. **No transform — the file is served verbatim.** `nm/dsh-client-modules/lib/index.js:292-293` `const bundle = \`${prepared.source};\n\`;` … `source += bundle;` — pure string concatenation of file bytes; `:208-212` strips only the `sourceMappingURL`/`sourceURL` trailers. There is **no bundler in this deployment**: `esbuild`, `vite`, `rollup`, `tsdown` and `webpack` are all absent from both `D:\Programs\node_global\node_modules` and the harness's own `node_modules` (verified by directory enumeration). A sourcemap is optional: `nm/dsh-client-modules/lib/index.js:223` — "Parse an optional source-map artifact; missing maps do not prevent plugin execution" — with the `ENOENT` early return at `:229` and the tolerant wrapper at `:765-772`.

5. **Authoring format — a classic script, not ESM.**
   - `nm/dsh-client-ui-agent-preset/lib/client.js:1-3` `window.__ModuleLoader__.load({` / `id: "@deepseek-ai/dsh-client-ui-agent-preset",` / `factory: (require) => {`
   - same head in `nm/dsh-context/lib/client.js:1`, `nm/dsh-client-ui-theme/lib/client.js:1`.
   - Registration/materialization: `nm/dsh-client-modules/lib/client.js:232` `this.factories.set(id, registration.factory)`; `:284` `exports: registered(this.makeRequire(edges))`.
   - The factory returns an exports object carrying `apply` (+ `inject`, `name`): `nm/dsh-client-ui-agent-preset/lib/client.js:1530-1534` `exports.apply = apply; … exports.inject = inject; … return module.exports;`

6. **The factory's `require` is a frozen 9-entry seed table.** Verified in the shipped shell bundle `nm/dsh-web-frontend/dist/assets/index-BKQ_L1z6.js:114`: `function by(){return{react:ec,"react/jsx-runtime":ic,"react-dom":cc,"react-dom/client":fc,"@deepseek-ai/cordis":Ha,"@deepseek-ai/dsh-client-store":Hc,"@deepseek-ai/dsh-client-ui-slots":Ac,"@deepseek-ai/dsh-client-ui-primitives":Zg,"@deepseek-ai/dsh-client-ui-dockkit":Ey}}`, consumed as `r.create({boot:t.__DSH_BOOT__,staticModules:by(),…})`. Anything else throws: `nm/dsh-client-modules/lib/client.js:308` — `missed the module table … a build-time externals drift`. `dsh.client.external` is graph-ordering metadata only.

7. **HMR is file polling on the bundle's own path.** `nm/dsh-client-hmr/lib/index.js:22` `pollIntervalMs: z.number()…default(500)`; `:93` `for (const row of ctx.clientModules.graph().entries)`; `:106` `const timer = setInterval(pollWatches, pollIntervalMs)`. It stat-polls each boot-graph bundle path and re-hashes it (`nm/dsh-client-modules/lib/index.js:541-562` `rebuilt(id)`), so a bundle whose bytes changed on disk is picked up without a rebuild tool. The package README describes the *workflow* it was written for — "Run `pnpm run dev:web` (or any tsdown watch process that writes the plugin's `lib/client.js`)" (`nm/dsh-client-hmr/README.md:32`) — but that is the rebuild half; for a hand-authored bundle, saving the file *is* the rebuild. **Could not determine** without executing whether the browser swap also needs a page refresh; the module-system client memoizes materialized factories (`nm/dsh-client-modules/lib/client.js:284`), which suggests a refresh is the safe expectation.

8. **Existence proof on this machine.** `profile/node_modules/dsh-remote/lib/client.js` is **hand-written and bundler-free** (2479 lines, verified firsthand): `:19-20` "Client entries must be classic scripts registered via window.__ModuleLoader__.load ({ id, factory }); the factory receives a synchronous `require`."; `:21-23` `window.__ModuleLoader__.load({` / `id: 'dsh-remote',` / `factory: (require) => {`; `:24` `var module = { exports: {} }`; `:28` `const React = require('react')` — the only `require(` in the file; `:2474-2476` `exports.name = name` / `exports.inject = ['slots','locale']` / `exports.apply = apply`. No sourcemap is shipped.

### VERDICT: **feasible here**

The host never transforms client source — it concatenates an already-built file from disk (`nm/dsh-client-modules/lib/index.js:292`) — and `dsh-remote@0.8.21`, installed in this very profile, is a working hand-written client half with zero build tooling. Authoring the plugin's `settings.section` page requires exactly two things:

1. one classic-script file calling `window.__ModuleLoader__.load({ id, factory })` whose factory returns `apply(ctx)` and only `require`s one of the nine seed specifiers; and
2. `"exports": { "./client": "<that file>" }` plus `"dsh": { "client": { "platform": "web" } }` in the package's `package.json`.

**No `tsdown`, no `pnpm` build, no DSH source checkout is needed.** The one real constraint is the nine-specifier `require` allowlist, which is satisfied by `require('react')` plus `React.createElement` (exactly what the prototype's `client.js` already does) and — for the settings/model wire — `ctx.remote`, which the plugin ctx carries without any `require`.

---

## (c) Install and mount

### `dsh plugin --profile web add <spec>`

- `dsh/lib/bin.js:105-106` registers the command as "manage a profile's plugins by forwarding the remaining arguments to pnpm in the profile directory", with `--profile` required and the rest forwarded verbatim.
- The core is `dsh/lib/plugin-Ddi42qoW.js:102-113`: `const dir = resolveProfileDir(profile);` … `spawnSync("pnpm", args.map((argument) => anchorPathSpec(argument, process.cwd())), { cwd: dir, stdio: "inherit", shell: process.platform === "win32" … })`. **It shells out to `pnpm` (never `npm`), with `cwd` = the profile directory.**
- Files written: pnpm writes `profile/package.json` dependencies, `profile/pnpm-lock.yaml` and `profile/node_modules/`; dsh then rewrites the manifest's `dsh.profile.bundles` (`dsh/lib/plugin-Ddi42qoW.js:77` → `nm/dsh-app-boot/lib/index.js:764`). First use also materializes `package.json`, `cordis.patch.yml`, `pnpm-workspace.yaml` (`nm/dsh-app-boot/lib/index.js:379-397`).
- **A local directory works.** `anchorPathSpec` (`dsh/lib/plugin-Ddi42qoW.js:90-93`) only re-anchors bare `.`/`..` specs to the invoking cwd; its contract (`:83-85`) is "Absolute specs, registry names, and every other pnpm argument pass through untouched". So `file:<abs path>`, `link:<abs path>` and a bare absolute path all reach pnpm.

### How `name:` resolves — and the preset-specific rule

Two different resolvers are in play, and the preset uses the stricter one.

**Profile/root rows** resolve against the profile directory:

- `nm/cordis-plugin-loader/src/config/tree.ts:145-161` — `import(name, …)` → `this.ctx.loader.internal.import(name, this.ctx.baseUrl!, {})` (Node's internal ESM loader, `parentURL = ctx.baseUrl`).
- `nm/cordis-plugin-include/lib/index.js:133,138` — `Include` rewrites its own context: `this.ctx.baseUrl = new URL(".", pathToFileURL(this.filename)).href`.
- `nm/dsh-app-boot/lib/index.js:1525-1534` — `boot()` sets `ctx.baseUrl = pathToFileURL(dirname(absoluteConfigPath)).href + "/"` before mounting the root include; the `bareModuleBaseUrl` override is not used by this CLI, so `mountRootInclude` installs the plain `Include` (`nm/dsh-app-boot/lib/index.js:1323`).

**Preset rows** are classified first and then imported from a *different* base:

- `nm/dsh-agent-presets/lib/index.js:135-156` `classifyRowSpecifier(name)`: `cordis:` → `builtin`; a leading `.` → `preset`; `file:` → `file`; an absolute path → `file` (converted with `pathToFileURL`, "because Node's ESM resolver rejects a bare drive-letter path on Windows"); anything else → `package`.
- `nm/dsh-agent-presets/lib/index.js:665-676` `PresetTree.import(name, …)`: `builtin`/`preset` → `super.import(...)` (the tree's own `baseUrl`, i.e. **the preset's own directory**); `file`/`package` → `internal.import(row.specifier, base, {})` where `base = harnessBase.get(this.config)`.
- `nm/dsh-agent-presets/lib/index.js:650-654` documents the intent for bare names: "a locally authored preset lives under the user's home, where Node's upward `node_modules` walk never reaches the harness's own dependencies … The mount records the host composition's base instead, which is inside the installed harness, and bare names resolve from there."
- `harnessBase` is recorded at `nm/dsh-agent-presets/lib/index.js:907-909` (`if (agentCtx.baseUrl !== void 0) harnessBase.set(config, agentCtx.baseUrl)`).

**Consequence, with the on-disk anchors that make it work:**

- `DSH_HOME/profiles/node_modules/@deepseek-ai/` holds **250 junctions into the harness install** — e.g. `DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-tool-subagent` is a Junction whose target is `D:\Programs\node_global\…\node_modules\@deepseek-ai\dsh-tool-subagent`. This is the "dependency closure" anchor (`nm/dsh-app-boot/lib/index.js:301-306`, `:449`). The same comment states the two-anchor rule directly: "Module resolution is two-anchor by construction: a bundle name resolves first from the dsh installation (the launcher's own package), then from the profile directory. Pnpm-managed entries in the profile's `node_modules` resolve first." (`:301-304`), and "`$DSH_HOME/profiles/node_modules` supplies the installation dependency closure through Node's ordinary parent-walk" (`:305-306`).
- `profile/node_modules/@deepseek-ai/` holds only `cosmokit`, `dsh-client-ui-primitives`, `schemastery` — the pnpm-managed first anchor (`nm/dsh-app-boot/lib/index.js:827`).
- `profile/.dsh-module-fallback/node_modules/` exists and is profile-owned.

Because `profile` is `DSH_HOME/profiles/web`, Node's upward walk from either candidate base reaches `DSH_HOME/profiles/node_modules`. **Could not determine** the exact runtime string of `ctx.baseUrl` at the standing-mount site without executing; both candidates lead to the same practical answer for a shipped `@deepseek-ai/*` name, and PLAN.md therefore recommends a row form that does not depend on the ambiguity at all (see "two row forms" below).

### Verified mount semantics: one standing composition per preset id

This is the single most important fact for the preset-level decision.

- `nm/dsh-agent-presets/lib/index.js:1768-1776` `ensureStanding(preset)` is single-flight and memoized: `const pending = this.standing.get(preset.id); if (pending !== void 0) { … }`. `mountPreset` is called from **this one place only** (`:1789`).
- `nm/dsh-agent-presets/lib/index.js:1499-1505` `mount(agentCtx, id)` = `const standing = await this.ensureStanding(preset); this.bindings.set(agentKey, bindScopeParent(agentKey, standing.key));` — a session **joins** the standing composition by scope binding; it does not mount its own copy.
- `nm/dsh-agent-presets/lib/index.js:1533-1539` `composeFrom(agentCtx, parentCtx)` gives a child agent "that exact instance — the same plugin objects, the same tool registrations, the same prompt sections".
- `nm/dsh-agent-presets/lib/index.js:918-921` a mount is **rejected** if any row "did not activate" or if a row "published process-global service(s) … a preset service must sit behind an `isolate` realm or move to the host composition".

So the MyWorkbench preset's rows are composed **once per process**, and every MyWorkbench session (and every lane child) shares that one generation. Other presets never bind to it.

---

## (d) Settings persistence

**Host contract.** `ctx.settings.register(ns, schema, options)` returns an owner scope:

- `nm/dsh-settings/lib/index.js:281-297` — `register(ns, schema, options)`: `const parsedNs = parseSettingsNamespace(ns); if (this.registrations.has(parsedNs)) throw new Error(\`settings namespace "${parsedNs}" is already registered\`);` then `this.ctx.effect(() => { this.registrations.set(parsedNs, registration); return () => this.registrations.delete(parsedNs); }, \`settings.register(${JSON.stringify(String(parsedNs))})\`)`.
- The returned scope (`:298-314`) is `{ get, watch, update(patch), replace(section) }`.
- `options` (`:284-292`): `base` (composition layer), `applies: 'live' | 'restart'` (default `'live'`), and an optional `validate`.
- Namespace pattern: `nm/dsh-settings/lib/index.js:82-84` `const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;` — `my-workbench-lanes` matches.
- Resolution order is schema defaults → `base` → user layer: `nm/dsh-settings/lib/index.js:509-513` `const value = schema(mergeLayers(base, section)); validate?.(value);` and the wire view serializes the schema with `registration.schema.toJSON()` (`nm/dsh-settings/lib/index.js:363`).

**Schema library: `@deepseek-ai/schemastery`**, imported as a default export:

- `nm/dsh-tool-jobs/lib/index.js:1` `import z from "@deepseek-ai/schemastery";`
- Real registrant at preset scope: `nm/dsh-agent-presets/lib/index.js:1145` `const SETTINGS_NAMESPACE = "agent-presets";`; `:1151` `const AgentPresetSettingsSchema = z.object({ default: z.string() });`; `:1311-1313` `ctx.inject(["settings"], (settingsCtx) => { this.settings = settingsCtx.settings.register(SETTINGS_NAMESPACE, AgentPresetSettingsSchema, { base: { default: config.default } }); this.settingsService = settingsCtx.settings; … })`.
- `@deepseek-ai/schemastery@3.18.2` is present in **both** `nm/schemastery/` and `profile/node_modules/@deepseek-ai/schemastery/`, with `"main": "lib/index.cjs"`, `"module": "lib/index.mjs"`.
- **A hand-rolled schema object is not recommended.** The host only needs `schema(value)` and `schema.toJSON()`, but `describe()` serializes every registration's schema for the *shipped* settings page, which rehydrates it (`nm/dsh-settings/lib/types/types.d.ts`, `SettingsNamespaceView.schema`: "Serialized schemastery schema envelope (`schema.toJSON()`); rehydrate with `new Schema(json)`"). A fake envelope would risk breaking a shipped surface for every namespace — see PLAN.md, where the schemastery import is resolved by an install-time dependency link rather than faked.

**Client write contract.** The generated Remote namespace is `ctx.remote.settings`, and the update call carries the revision:

- `nm/dsh-api-settings-controller/lib/typert.remote-client.d.ts` — `update: (ns: string, patch: Record<string, JsonValue>, expectedRevision: number | undefined) => Promise<RemoteResult<SettingsNamespaceView>>` (plus `replace`, `mutate`, `describe`, `openSettingsDocument`).
- Host side: `nm/dsh-api-settings-controller/lib/index.js:532-547` `write(ns, mode, input, expectedRevision)` → `:538` `if (mode === "update") await settings.update(namespace, input, expectedRevision);` and a stale revision becomes `settings/conflict` (`:559-563`).
- Real shipped client half: `nm/dsh-client-ui-agent-preset/lib/client.js:416-419` `const response = await ctx.remote.settings.update(AGENT_PRESET_SETTINGS_NS, { default: id }, void 0); return response.ok ? void 0 : response.error.message;`
- Reads: `ctx.remote.settings.describe()` (`nm/dsh-client-ui-settings/lib/client.js:1299`), returning `{ writable, hasDocument, namespaces: [{ ns, schema, value, base?, user?, applies, secrets, revision }] }` (`nm/dsh-settings/lib/types/types.d.ts`).

**Where values persist:** `DSH_HOME/settings.yaml` (present, 2086 bytes).

- `nm/dsh-settings-file/lib/index.js:32` `const filename = resolve(config.path ?? join(resolveDshHome(config.dshHome), "settings.yaml"));` with `:27` "otherwise the document lives at `<harness home>/settings.yaml`"; writes are atomic and file-locked (`:164-171`).

**Per-mount safety (see consequence 5 below):** the namespace is registered once per process because the standing mount is single-flight, and the registration is a fiber effect (`nm/dsh-settings/lib/index.js:294-297`), so it disappears when the mount is disposed.

---

## (e) Prompt shipping

**How the repository renders prompts.** `bin/my-workbench.js` owns both placeholders:

- `bin/my-workbench.js:61` `const SLOT_RE = /\{\{slot:([\w-]+)\}\}/g;`
- `bin/my-workbench.js:64` `const PROMPT_RE = /\{\{prompt:([\w-]+)\}\}/g;`
- `bin/my-workbench.js:393-400` `promptBody(agentName)` reads `agents/prompts/<agentName>.md` and throws if absent.
- `bin/my-workbench.js:410-427` `fillPrompts()` requires the placeholder to stand alone on its line (`:415-417`), indents the body to the placeholder's column (`:418-425`) and fills any `{{slot:...}}` inside it first (`:419`).
- `bin/my-workbench.js:430-436` `renderDshComposition()` renders `agents/backends/dsh/agent.cordis.yml` and rejects an unfilled placeholder.

**The installed rendering confirms the mechanism end to end**: the installed preset (`DSH_HOME/.agent-presets/my-workbench/agent.cordis.yml`, 762 lines) contains, per lane, a `toolName:` line at column 9 followed by a `persona: |` block holding the specialist prompt verbatim — e.g. `:374` `toolName: subagent_explorer` and `:376` `persona: |`. In the repository that block is the single line `{{prompt:explorer}}` (`agents/backends/dsh/agent.cordis.yml:189-190`).

**How a generated JS data file could carry the 7 prompts without duplicating them.** The repository already has the exact machinery: the prompt bodies are read from `agents/prompts/*.md` at assembly time (`bin/my-workbench.js:393-400`). A generated data module is therefore just another `fillPrompts` target — a template under `agents/backends/dsh/lane-plugin/` whose one placeholder per lane is replaced with the JSON-escaped body, e.g.

```js
// generated — do not edit; assembled from agents/prompts/*.md
export const LANE_PROMPTS = {
  explorer: "…",   // {{prompt:explorer}} rendered by the CLI
  …
}
```

Two constraints follow from the existing code and must be respected by whoever implements this:

1. `fillPrompts` emits **YAML literal-block** content, indented to the placeholder's column (`bin/my-workbench.js:418-425`). A JS/JSON target needs `JSON.stringify` escaping, not indent-preserving insertion, so the existing helper cannot be reused verbatim — a new sibling function is required.
2. The prompts contain non-ASCII text and newlines, so the generated file must be UTF-8 and the escaping must be real JSON escaping (`JSON.stringify(body)`), otherwise the module is syntactically invalid. `PROMPT_RE` only matches `[\w-]+`, so lane keys must stay hyphen/underscore-safe (`ui-designer` is fine; a key with a dot would not match).

The alternative — shipping the prompts as `*.md` files next to the plugin and reading them at runtime — needs `node:fs` plus a path relative to the plugin module (`import.meta.url`), which works but re-introduces runtime file I/O and a second copy of the truth; a generated data module keeps `agents/prompts/*.md` as the single source.

---

## Preset-scope consequences (variant B)

### 1. Tool names — keep `subagent_*`

**Recommendation: register the seven tools under their current names** (`subagent_explorer`, `subagent_librarian`, `subagent_oracle`, `subagent_ui_designer`, `subagent_fixer`, `subagent_observer`, `subagent_improver`) and delete the preset's seven `@deepseek-ai/dsh-tool-subagent` rows.

Reasons, in order of weight:

- The DSH dispatch text the orchestrator reads already names them: `agents/backends/dsh/slots/dispatch.md` — "Dispatch specialists through their dedicated delegation tools: `subagent_explorer`, `subagent_librarian`, …". Keeping the names means `slots/dispatch.md` (and therefore every rendered backend) needs no edit.
- The `toolFilter` deny lists are already written against these names (`agents/backends/dsh/agent.cordis.yml:192,203,214,227,239,250,261`), and they can be reused verbatim.
- **Preset scoping makes a global collision impossible.** Tools are registered into the standing composition's scope, and a session only sees them if it is bound to that scope (`nm/dsh-agent-presets/lib/index.js:1504` `bindScopeParent(agentKey, standing.key)`; `:1533-1539`). No other preset binds there, so `subagent_*` exists only inside MyWorkbench sessions.
- The `lane_*` alternative buys nothing here: it was a workaround for *coexisting* with the preset's rows (prototype README, "keep `lane_*` and coexist"). Once the plugin replaces those rows there is nothing to coexist with, and `lane_*` would force an edit to `slots/dispatch.md` plus a rewrite of every deny list.

The one hard requirement this creates: **the plugin must register exactly the names its deny lists reference.** `ctx.tools.restrict()` rejects unknown names — `nm/dsh-tools/lib/index.js:2803` `throw new Error(\`tools.restrict() names unknown global tool${…} "${n}"\`)` — and it requires a scoped context (`nm/dsh-tools/lib/index.js:2792`).

### 2. What must exist on disk for the row to load

**Two row forms work; they differ in what must be installed.**

**Form R (relative / plugin inside the preset directory) — no install at all.** `name: ./lane-plugin/src/index.js` is classified `preset` (`nm/dsh-agent-presets/lib/index.js:140-143`) and imported via `super.import`, i.e. against the tree's `baseUrl`, which `Include` set to the composition's own directory (`nm/cordis-plugin-include/lib/index.js:138`; doc at `nm/dsh-agent-presets/lib/index.js:112` — "A preset composition is read by `Include`, which rewrites its context's `baseUrl` to the composition's own directory"). This resolves to `DSH_HOME/.agent-presets/my-workbench/lane-plugin/src/index.js`. Nothing is installed, nothing under the profile is touched, and the plugin travels with the preset. *Open item:* a plugin loaded this way cannot `import '@deepseek-ai/schemastery'` by bare name — Node's walk from `DSH_HOME/.agent-presets/my-workbench/` reaches `.agent-presets/node_modules`, `DSH_HOME/node_modules` (does not exist), `C:\Users\xiaolf\node_modules`, `C:\node_modules` — none of which hold it. Form R therefore needs a **preset-local dependency link** (see PLAN.md) or an absolute `file:` import.

**Form P (package name / installed into the profile) — a dependency install, no row.** `name: my-workbench-lanes` is classified `package` and imported from `harnessBase` (`nm/dsh-agent-presets/lib/index.js:665-676`). The anchors reachable from the profile side are the pnpm-managed `profile/node_modules` and the 250-junction `DSH_HOME/profiles/node_modules` (`nm/dsh-app-boot/lib/index.js:301-306`, `:449`, `:827`), both of which contain the shipped `@deepseek-ai/*` closure. Installing the package with `dsh plugin --profile web add <abs path>` puts it in `profile/node_modules` and adds a `dependencies` entry to `profile/package.json` plus `profile/pnpm-lock.yaml` — **but adds no row anywhere**, so no other preset and no other surface mounts it. This is the "minimal install that does not create a profile-level row". *Residual uncertainty:* the exact value of `harnessBase` (profile directory vs. a path inside the harness install) could not be determined without executing. Both candidates resolve the shipped `@deepseek-ai/*` names; only the profile-side candidate resolves a newly installed package. Form R does not have this uncertainty.

**Recommended: Form R**, with the schemastery dependency supplied by a preset-local link created at install time. `dsh plugin add` exists as the documented fallback and is described in PLAN.md as variant P.

### 3. `toolFilter` — the exact deny lists

`toolFilter` is a first-class field of the subagent request and is applied by the spawn driver:

- `nm/dsh-tool-subagent/lib/index.js:518` `...config.toolFilter !== void 0 ? { toolFilter: config.toolFilter } : {}`
- `nm/dsh-subagent/lib/index.js:554` `if (composition.toolFilter !== void 0) childCtx.tools.restrict(composition.toolFilter);`
- `nm/dsh-tools/lib/index.js:2792` restrict needs a scoped context; `:2803` unknown names throw.

Because a lane child joins the parent's standing composition (`nm/dsh-agent-presets/lib/index.js:1533-1539`), the plugin's own seven tool names **are** registered in the child's scope, so the same lists that work today keep working. The exact lists to reproduce from `agents/backends/dsh/agent.cordis.yml`:

| Lane | `deny` |
| --- | --- |
| `subagent_explorer` (`:192`) | `write`, `edit`, `subagent_librarian`, `subagent_oracle`, `subagent_ui_designer`, `subagent_fixer`, `subagent_observer`, `subagent_improver` |
| `subagent_librarian` (`:203`) | `write`, `edit`, `subagent_explorer`, `subagent_oracle`, `subagent_ui_designer`, `subagent_fixer`, `subagent_observer`, `subagent_improver` |
| `subagent_oracle` (`:214`) | `write`, `edit`, `subagent_explorer`, `subagent_librarian`, `subagent_ui_designer`, `subagent_fixer`, `subagent_observer`, `subagent_improver` |
| `subagent_ui_designer` (`:227`) | the other six lane names only (keeps `write`/`edit`) |
| `subagent_fixer` (`:239`) | the other six lane names only |
| `subagent_observer` (`:250`) | `write`, `edit`, the other six lane names, **+ platform shell** |
| `subagent_improver` (`:261`) | `write`, `edit`, the other six lane names, **+ platform shell** |

**Platform-dependent shell name.** The template currently does this in YAML with the loader's `!!js` dialect (`agent.cordis.yml:250`):

```
deny: !!js "['write','edit', … ].concat(process.platform === 'win32' ? ['pwsh'] : ['bash'])"
```

The plugin has no YAML expression language, but it runs in Node, so the equivalent is a plain runtime expression evaluated **once at registration time**: `const SHELL = process.platform === 'win32' ? 'pwsh' : 'bash'` and then `deny: [...READ_ONLY, ...LANE_TOOLS, SHELL]`. That is strictly safer than the current form: the conditional is evaluated in the process that actually spawns the child, and it keeps naming only the tool this platform registers — naming the other one would make `restrict()` throw (`nm/dsh-tools/lib/index.js:2803`) and the spawn fail.

### 4. Client-half scope — the page can render in presets that never mounted the plugin

`settings.section` is declared **root-scoped** by the shipped settings shell:

- `nm/dsh-client-ui-settings-general/lib/client.js:621-624` — `"settings.section": { kind: "list", scope: "root" }`
- Registration pattern used by a shipped settings section: `nm/dsh-client-ui-agent-preset/lib/client.js:1519-1526` `ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "agent-presets", order: 20, label: () => …, locale: …, inject: sectionInjected }, AgentPresetSection));`

So the section is browser-wide: it renders in a `standard`/`ptc`/`minimal`/`cordis` session too. Since the MyWorkbench host half will not be mounted there, the page must not show live-looking controls. Intended behaviour, to be stated in PLAN.md:

- The page reads its state from `ctx.remote.settings.describe()` and looks for its own namespace. `describe()` lists **registered** namespaces only (`nm/dsh-settings/lib/index.js:351-352` iterates `this.registrations`), so an unmounted plugin simply is not in the list.
- When the namespace is absent, render a neutral empty state (e.g. "此会话未挂载 MyWorkbench 预设 / this session does not mount the MyWorkbench preset"), no selects, no write controls. No Host RPC is attempted, so no error surfaces.
- Never write from that state: `settings.update` on an unregistered namespace is refused by the settings service, and the plugin must not paper over it.

This keeps the "do not pollute other presets" requirement true for the UI as well as the model-facing plane — the section appears everywhere (that is the shell's own root scope and cannot be changed from a plugin), but it is inert outside MyWorkbench.

### 5. Settings namespace — per-mount-safe, persists in `DSH_HOME/settings.yaml`

**Safe, and here is why.** `settings.register` throws on a duplicate namespace (`nm/dsh-settings/lib/index.js:283`), which would be fatal if two sessions each mounted the preset. They do not:

- the preset composition is mounted **once per preset id per process** — single-flight `ensureStanding` (`nm/dsh-agent-presets/lib/index.js:1768-1776`), the only `mountPreset` call site (`:1789`);
- sessions join it by scope binding (`:1499-1505`), and child lanes join the same instance (`:1533-1539`);
- the registration is a fiber effect (`nm/dsh-settings/lib/index.js:294-297`), so it is removed when the mount is disposed.

The one collision risk is a **second preset** naming the same plugin package; since the plugin row is added to `agents/backends/dsh/agent.cordis.yml` only, and the shipped presets (`standard`, `ptc`, `minimal`, `cordis`) are untouched, that cannot happen. The rule to write down: *this plugin must be mounted by exactly one preset.*

Persistence target: `DSH_HOME/settings.yaml` (`nm/dsh-settings-file/lib/index.js:32`, `:27`), atomic writes under a file lock (`:164-171`). Read/write from the GUI goes through `ctx.remote.settings.describe()` / `.update(ns, patch, revision)` — **no package-private RPC is needed**, which is a genuine simplification over the prototype's `host.call('get-state' | 'set-lanes')`: those Package-private handlers do not exist for a packaged plugin.

Bonus: the model/effort catalog the page needs is also already on the wire, so the page does not need a Host RPC at all:

- `ctx.remote.session.modelCatalog()` — `nm/dsh-api-session-controller/lib/typert.remote-client.d.ts:23` `modelCatalog: () => Promise<RemoteResult<ModelCatalog>>`, whose `ModelCatalog.groups[].models[].reasoning.efforts[]` is exactly the per-model effort list (`nm/dsh-api-session-controller/lib/types/types.d.ts`: `interface ModelReasoning { readonly efforts: readonly ModelReasoningEffort[] }`, `ModelReasoningEffort { id, name, description? }`), plus `routableProviders`.
- `ctx.remote.llm.listProviders()` exists too (`nm/dsh-llm/lib/typert.remote-client.d.ts`) but returns only `{ id, name }` (`nm/dsh-llm/lib/types/types.d.ts:180-185`) — **no models and no efforts** — so `session.modelCatalog()` is the right source for the effort dropdown, not `llm.listProviders()`.

---

## Could not determine

- The exact runtime string of `ctx.baseUrl` at the standing-mount site (profile directory vs. a path inside the harness install). Both candidates resolve the shipped `@deepseek-ai/*` names through `DSH_HOME/profiles/node_modules` (junctions), but only the profile-side candidate resolves a **newly installed** package. This is why PLAN.md recommends the relative row form, which sidesteps the question.
- Whether `dsh-client-modules` finds the plugin's `package.json` when the host row names a **relative** path (`./lane-plugin/src/index.js`): `resolveMeta`/`locatePkgJson` (`nm/dsh-client-modules/lib/index.js:637-679`) resolve the row specifier through Loader resolution and take the nearest ancestor manifest, which *should* find `<preset dir>/lane-plugin/package.json`, but this was not executed. PLAN.md makes it a verification step, with Form P (installed package) as the fallback if it does not.
- Whether a dropped directory enters the profile's pnpm install without `dsh plugin add`. Not needed by the recommended form; relevant only to variant P.
- The exact JSON envelope `@deepseek-ai/schemastery`'s `toJSON()` emits (not needed — the plan imports the real library rather than hand-rolling a schema).
