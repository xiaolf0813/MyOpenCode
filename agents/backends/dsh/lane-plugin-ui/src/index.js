/**
 * my-workbench-lanes-ui — HOST half.
 *
 * DELIBERATELY INERT. This module exists only so the package has a host entry
 * the DSH loader can mount from a profile row; it registers no tool, no prompt
 * section, no service, and no settings namespace. Everything this package does
 * happens in `lib/client.js` (the browser half), which reads and writes the
 * settings namespace that the MyWorkbench preset's lane host half owns.
 *
 * Why the page is a PROFILE-layer row rather than part of the preset:
 * `dsh-client-modules` discovers client halves by scanning the profile Loader's
 * own entries (`nm/dsh-client-modules/lib/index.js:775-781` iterates
 * `this.ctx.loader.entries()`). An agent preset is a separate Loader tree
 * mounted under a scope, so its rows are never scanned and
 * `clientModules.clientPath('my-workbench-lanes')` stays undefined — the host
 * half mounts and its settings namespace registers, but no page is ever served.
 * A profile row is the only way in, so this one inert row is the entire
 * profile-level footprint. See ../lane-plugin/PLAN.md and the package README.
 *
 * `nm/` abbreviates
 * `D:\Programs\node_global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\`.
 *
 * @module my-workbench-lanes-ui
 */

/** Plugin name reported to the loader. */
export const name = 'my-workbench-lanes-ui'

/**
 * No dependencies: this half never runs, so it must not make the profile row
 * wait on a service the deployment might not compose.
 */
export const inject = []

/** Does nothing, on purpose. */
export function apply() {}
