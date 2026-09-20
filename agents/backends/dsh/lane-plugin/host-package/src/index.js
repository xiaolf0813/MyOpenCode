/**
 * MyWorkbench lane plugin — HOST half.
 *
 * One packaged DSH agent-preset plugin that owns the seven MyWorkbench
 * specialist lanes: it registers one model-facing delegation tool per
 * specialist, reads each lane's provider/model/reasoningEffort pin from its own
 * persisted settings namespace, and applies that specialist's read-only
 * `toolFilter` to the child it spawns.
 *
 * Mounted by ONE row inside the MyWorkbench agent preset composition
 * (`agents/backends/dsh/agent.cordis.yml`, installed as
 * `<DSH_HOME>/.agent-presets/my-workbench/agent.cordis.yml`):
 *
 *     - id: lanes
 *       name: ./lane-plugin/src/index.js
 *
 * Preset scope, not profile scope. The preset composition is composed once per
 * preset id per process (single-flight `ensureStanding`, nm/dsh-agent-presets/lib/index.js:1768-1776,
 * the only `mountPreset` call site at :1789) and sessions join it by scope
 * binding (:1499-1505, child lanes at :1533-1539). So these tools, this settings
 * namespace and these personas reach MyWorkbench sessions only — no other preset
 * gains a tool, a prompt section or a UI control. Nothing is mounted at profile
 * level, and nothing is installed into the profile's `node_modules`.
 *
 * `nm/` below abbreviates
 * `D:\Programs\node_global\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\`;
 * see ../FEASIBILITY.md for the evidence trail and ../PLAN.md for the plan.
 *
 * ── PLACEHOLDERS RENDERED AT INSTALL TIME ──────────────────────────────────
 * The two `{{dep:…}}` import specifiers below are replaced by
 * `my-workbench --dsh` with absolute `file:` URLs to the deployment's own copies
 * of those packages. A plugin living under `$DSH_HOME/.agent-presets/` cannot
 * reach them by bare name: Node's upward `node_modules` walk from there reaches
 * no package that carries them. Baking the resolved URL is what lets the user
 * install with no dependency command of any kind.
 *
 * @module my-workbench-lanes
 */

import { defineTool } from '{{dep:dsh-tools}}'
import z from '{{dep:schemastery}}'
import { LANE_PROMPTS } from './prompts.generated.js'

/** Plugin name reported to the loader. */
export const name = 'my-workbench-lanes'

/**
 * Hard dependencies. `settings` is provided on the host plane by
 * `@deepseek-ai/dsh-settings-file` (part of the `@deepseek-ai/dsh-base` bundle),
 * so a preset-scoped row resolves the root instance.
 */
export const inject = ['tools', 'subagents', 'settings']

/**
 * Row config (`config:` in the composition). Kept minimal on purpose: a
 * schemastery schema with defaults lets the row omit the key entirely.
 */
export const Config = z.object({
  /** Child depth budget for a lane, matching the preset rows' `maxDepth: 3`. */
  maxDepth: z.natural().default(3)
})

// ── the roster ──────────────────────────────────────────────────────────────

/**
 * The seven lanes. `key` is the settings key, the prompt key and the lane
 * label; `tool` is the model-facing tool name; `zh` is display-only text the
 * settings page shows beside the lane.
 *
 * Tool names stay `subagent_*`: the dispatch text the orchestrator already reads
 * names them (`agents/backends/dsh/slots/dispatch.md`), the `toolFilter` deny
 * lists are written against them, and preset scoping makes a global collision
 * impossible — no other preset binds to this composition's standing scope.
 */
const LABELS = [
  { key: 'explorer', tool: 'subagent_explorer', zh: '代码库导航' },
  { key: 'librarian', tool: 'subagent_librarian', zh: '文档与外部代码研究' },
  { key: 'oracle', tool: 'subagent_oracle', zh: '战略技术顾问 / 评审' },
  { key: 'ui-designer', tool: 'subagent_ui_designer', zh: 'UI 设计' },
  { key: 'fixer', tool: 'subagent_fixer', zh: '实现' },
  { key: 'observer', tool: 'subagent_observer', zh: '视觉分析' },
  { key: 'improver', tool: 'subagent_improver', zh: '失败复盘与改进' }
]

/** Every lane tool name, in roster order. */
const LANE_TOOLS = LABELS.map((lane) => lane.tool)

/**
 * The shell tool this platform registers. Resolved in-process at registration
 * time, which is strictly safer than the composition's `!!js` conditional
 * (agents/backends/dsh/agent.cordis.yml:250): `ctx.tools.restrict()` throws on
 * an unknown name (nm/dsh-tools/lib/index.js:2802-2803), and naming the other
 * platform's shell would make every observer/improver spawn fail.
 */
const SHELL = process.platform === 'win32' ? 'pwsh' : 'bash'

/** Every lane tool except `tool`. */
function otherLanes(tool) {
  return LANE_TOOLS.filter((candidate) => candidate !== tool)
}

/**
 * Per-lane tool restrictions, copied verbatim from the preset rows these tools
 * replace (`agents/backends/dsh/agent.cordis.yml:192,203,214,227,239,250,261`).
 *
 * These work because `toolFilter` is applied by the spawn driver
 * (nm/dsh-subagent/lib/index.js:554 `childCtx.tools.restrict(composition.toolFilter)`)
 * and `restrict()` accepts a name only if it is in the child's restrictable set —
 * the global layer plus every ANCESTOR layer on the child's scope chain, never
 * its own (nm/dsh-tools/lib/index.js:2865-2868, rationale at :2839-2850). A lane
 * child joins its parent's standing composition
 * (nm/dsh-agent-presets/lib/index.js:1533-1539), so the tools registered here are
 * an ancestor contribution to the child: restrictable and effective.
 */
const TOOL_FILTERS = {
  explorer: { deny: ['write', 'edit', ...otherLanes('subagent_explorer')] },
  librarian: { deny: ['write', 'edit', ...otherLanes('subagent_librarian')] },
  oracle: { deny: ['write', 'edit', ...otherLanes('subagent_oracle')] },
  // ui-designer writes its own mockup/spec deliverables, so it keeps write/edit;
  // it still never touches app source (its prompt's job).
  'ui-designer': { deny: otherLanes('subagent_ui_designer') },
  // fixer is the only lane that implements: full tools, still a leaf.
  fixer: { deny: otherLanes('subagent_fixer') },
  observer: { deny: ['write', 'edit', SHELL, ...otherLanes('subagent_observer')] },
  improver: { deny: ['write', 'edit', SHELL, ...otherLanes('subagent_improver')] }
}

/**
 * The recommended lane mapping, shipped as the settings namespace's composition
 * `base` layer: a fresh install already routes each lane sensibly, and
 * `settings.describe()` keeps reporting it as inherited rather than
 * user-overridden, which is what the shipped settings surface understands.
 *
 * The route must exist in the deployment's DSH profile. The settings page's
 * 改回继承 action writes explicit empty strings into the USER layer, which
 * overrides the base per lane — so a deployment whose profile lacks one of these
 * routes can be cleared lane by lane without editing this file.
 */
const RECOMMENDED = {
  explorer: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoningEffort: 'low' },
  librarian: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoningEffort: 'low' },
  oracle: { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'max' },
  'ui-designer': { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'high' },
  fixer: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoningEffort: 'high' },
  observer: { provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp', reasoningEffort: 'low' },
  improver: { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'high' }
}

// ── the settings namespace ──────────────────────────────────────────────────

/**
 * Settings namespace key. Must match `/^[a-z][a-z0-9-]*$/`
 * (nm/dsh-settings/lib/index.js:82-84).
 */
const LANE_NAMESPACE = 'my-workbench-lanes'

/**
 * One lane's pin. Empty strings mean "inherit the session's route" — modelling
 * inherit as an empty value rather than an absent key keeps the GUI on the
 * simpler `settings.update` merge path instead of needing path-addressed
 * `settings.mutate` ops to remove a key.
 */
const LanePinSchema = z.object({
  provider: z.string().default(''),
  model: z.string().default(''),
  reasoningEffort: z.string().default('')
})

/**
 * The namespace's value: a dictionary keyed by lane key.
 *
 * Registrant contract: `register(ns, schema, options)` returns
 * `{ get, watch, update, replace }`, installed as a fiber effect so it unwinds
 * with the mount, resolving as `schema(mergeLayers(base, section))`
 * (nm/dsh-settings/lib/index.js:281-315, :509-513).
 */
const LaneSettingsSchema = z.dict(LanePinSchema).default({})

// ── helpers ─────────────────────────────────────────────────────────────────

/** Human-readable text of one thrown value. */
function errorText(error) {
  if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
  return String(error)
}

/** Concatenate the text blocks of one subagent run result. */
function textOf(result) {
  const parts = []
  if (result !== null && typeof result === 'object' && Array.isArray(result.output)) {
    for (const block of result.output) {
      if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    }
  }
  return parts.join('')
}

/**
 * One lane's route as an `agentOptions` value, or undefined for "inherit".
 * The shape matches the preset rows' documented `agentOptions`
 * (agents/backends/dsh/agent.cordis.yml:161-169).
 *
 * @param {{ provider?: string, model?: string, reasoningEffort?: string } | undefined} pin - stored pin.
 * @returns {{ provider: string, model: string, reasoningEffort?: string } | undefined} the route override.
 */
function routeOf(pin) {
  if (pin === undefined || pin === null || typeof pin !== 'object') return undefined
  const provider = typeof pin.provider === 'string' ? pin.provider : ''
  const model = typeof pin.model === 'string' ? pin.model : ''
  if (provider === '' || model === '') return undefined
  const effort = typeof pin.reasoningEffort === 'string' ? pin.reasoningEffort : ''
  return effort === '' ? { provider, model } : { provider, model, reasoningEffort: effort }
}

/** Printable form of a lane's route, for tool output. */
function routeText(route) {
  if (route === undefined) return 'inherit'
  return route.provider + '/' + route.model + (route.reasoningEffort === undefined ? '' : ' · ' + route.reasoningEffort)
}

/**
 * This lane's specialist prompt, taken from the generated prompt module that
 * `my-workbench --dsh` renders out of `agents/prompts/*.md`.
 *
 * @param {string} laneKey - roster key.
 * @returns {string} the specialist prompt.
 * @throws {Error} when the lane has no prompt — a packaging bug, and one that must
 *   fail the mount loudly rather than delegate without a persona.
 */
function lanePrompt(laneKey) {
  const value = LANE_PROMPTS[laneKey]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('my-workbench-lanes: lane "' + laneKey + '" has no persona; src/prompts.generated.js was not rendered (run `my-workbench --dsh`)')
  }
  return value
}

/**
 * Build one lane's model-facing tool.
 *
 * @param {object} ctx - the preset-scoped plugin context (for `ctx.subagents`).
 * @param {object} lane - roster entry `{ key, tool, zh }`.
 * @param {() => Record<string, object>} pins - live pins reader.
 * @param {string} persona - the lane's specialist prompt.
 * @param {number} maxDepth - child depth budget from the row config.
 * @returns {object} a registry-ready tool definition.
 */
function laneTool(ctx, lane, pins, persona, maxDepth) {
  const filter = TOOL_FILTERS[lane.key]
  return defineTool({
    name: lane.tool,
    description:
      'Delegate to the ' + lane.key + ' specialist of the MyWorkbench roster using the model and reasoning effort pinned for this lane in the MyWorkbench lane settings page (settings → MyWorkbench 赛道模型). ' +
      'Starts a background continuable subagent by default and returns its durable child id; pass run_in_background: false to wait for the final report instead.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'The complete, self-contained task for this specialist.' },
      run_in_background: { type: 'boolean', description: 'Defaults to true: start a background child and return its id. Set false to wait for the final text.' }
    },
    output: {
      schema: { type: 'string' },
      render(_args, value) {
        return [{ type: 'text', text: value }]
      }
    },
    async execute(args, exec) {
      const parent = exec.agent
      if (parent === undefined) return 'Error: this tool needs a calling agent'
      const route = routeOf(pins()[lane.key])
      const background = args.run_in_background !== false
      const base = {
        prompt: [{ type: 'text', text: String(args.prompt) }],
        parent,
        maxDepth,
        persona,
        toolFilter: filter
      }
      if (route !== undefined) base.agentOptions = route
      try {
        if (background) {
          const started = await ctx.subagents.startContinuable({ provider: 'spawn', label: lane.key + ' lane', request: base, signal: exec.signal })
          return 'started subagent ' + String(started.childId) + ' — lane ' + lane.key + ', route ' + routeText(route) + '. Continue it with send_message.'
        }
        const request = { label: lane.key + ' lane', prompt: base.prompt, parent, signal: exec.signal, maxDepth, persona, toolFilter: filter }
        if (route !== undefined) request.agentOptions = route
        const run = await ctx.subagents.start('spawn', request)
        try {
          const result = await run.result
          const text = textOf(result)
          if (result !== null && typeof result === 'object' && result.stopReason !== undefined && result.stopReason !== 'completed') {
            return 'Error: ' + String(result.stopReason) + (result.diagnostic === undefined ? '' : ' — ' + String(result.diagnostic)) + (text === '' ? '' : '\n\n' + text)
          }
          return text === '' ? '(lane ' + lane.key + ' returned no text; route ' + routeText(route) + ')' : text
        } finally {
          await run.dispose()
        }
      } catch (error) {
        return 'Error: lane ' + lane.key + ' (' + routeText(route) + ') failed: ' + errorText(error)
      }
    }
  })
}

// ── the plugin ──────────────────────────────────────────────────────────────

/**
 * Register the settings namespace and the seven lane tools.
 *
 * @param {object} ctx - the preset-scoped plugin context.
 * @param {{ maxDepth: number }} config - validated row config.
 */
export function apply(ctx, config) {
  const maxDepth = config.maxDepth

  // Pins live in the plugin's own settings namespace, so they persist across a
  // DSH restart (`<DSH_HOME>/settings.yaml` — nm/dsh-settings-file/lib/index.js:32)
  // and every GUI write is a normal settings write with a revision check.
  //
  // Per-mount safety: `register` throws when the namespace is already taken
  // (nm/dsh-settings/lib/index.js:283). Safe here only because this plugin is
  // named by exactly ONE preset — the composition is mounted once per preset id
  // per process (nm/dsh-agent-presets/lib/index.js:1768-1776) and sessions join
  // that mount (:1499-1505). Naming this row from a second preset would make the
  // second mount fail loudly.
  const scope = ctx.settings.register(LANE_NAMESPACE, LaneSettingsSchema, { base: RECOMMENDED })

  // `scope.get()` already resolves schema defaults → composition base → user
  // layer (nm/dsh-settings/lib/index.js:509-513). Read it per spawn instead of
  // caching, so a live write applies to the very next delegation.
  const pins = () => {
    const value = scope.get()
    return value !== null && typeof value === 'object' ? value : {}
  }

  // Resolve every persona once, at registration: a missing generated prompt
  // module is a packaging bug and must fail the mount, not degrade a delegation.
  const personas = {}
  for (const lane of LABELS) personas[lane.key] = lanePrompt(lane.key)

  for (const lane of LABELS) {
    // `ctx.tools.register` inserts into the calling scope's layer, returns the
    // exact disposer, and is already a fiber effect
    // (nm/dsh-tools/lib/index.js:2773-2782). The calling scope is the preset's
    // standing scope — not the root realm — which is what keeps these names
    // invisible to every other preset.
    ctx.tools.register(laneTool(ctx, lane, pins, personas[lane.key], maxDepth))
  }

  // No `ctx.systemPrompt.section()` on purpose. The preset's dispatch text
  // (`agents/backends/dsh/slots/dispatch.md`, rendered into the orchestrator
  // persona) already names the seven `subagent_*` tools, so an extra section
  // would only duplicate it and perturb request caching.
}
