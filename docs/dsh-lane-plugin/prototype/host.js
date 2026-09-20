// Prototype Host half, transcribed from the dynamic Cordis Package
// lanes-4/pkg-7 (run-7) on 2026-09-20, while it was running in the user's
// DSH web profile. This file holds the Package BODY verbatim: a function body
// that returns a Cordis Plugin. A packaged plugin must wrap it as an ESM
// module whose exports are `name`, `inject` and `apply` (see PLAN.md).
//
// Behaviour: seven model-facing delegation tools (lane_explorer …
// lane_improver) that spawn the matching MyWorkbench specialist through the
// host `subagents` registry, with a per-lane provider/model/reasoningEffort
// read from an in-memory pin map; plus two Package-private RPC handlers the
// Client half calls (`get-state`, `set-lanes`).
//
// Known prototype limits (the packaged form must fix them):
//   * pins live in process memory — they do not survive a restart;
//   * no `toolFilter` is applied to the child (the preset applies it; passing
//     the preset's names fails when the session's preset does not register
//     them);
//   * the persona is scraped out of the installed preset composition text.

return {
  name: 'workbench-lanes',
  inject: ['subagents', 'tools'],
  apply(ctx) {
    const PRESET_ID = 'my-workbench'
    const LANES = [
      { key: 'explorer', tool: 'subagent_explorer' },
      { key: 'librarian', tool: 'subagent_librarian' },
      { key: 'oracle', tool: 'subagent_oracle' },
      { key: 'ui-designer', tool: 'subagent_ui_designer' },
      { key: 'fixer', tool: 'subagent_fixer' },
      { key: 'observer', tool: 'subagent_observer' },
      { key: 'improver', tool: 'subagent_improver' }
    ]
    const suffix = (key) => key.replace(/-/g, '_')
    const pins = new Map()
    let rows = null
    let rowsError = null
    let catalog = null
    let catalogError = null

    function errorText(error) {
      if (error !== null && typeof error === 'object' && typeof error.message === 'string') return error.message
      return String(error)
    }

    function parseComposition(text) {
      const lines = String(text).split('\n')
      const found = []
      let current = null
      for (const line of lines) {
        const head = /^(\s*)- id:\s*(subagent-[\w-]+)\s*$/.exec(line)
        if (head !== null) {
          if (current !== null) found.push(current)
          current = { indent: head[1].length, body: [] }
          continue
        }
        if (current === null) continue
        if (line.trim() !== '' && line.match(/^\s*/)[0].length <= current.indent) {
          found.push(current)
          current = null
          continue
        }
        current.body.push(line)
      }
      if (current !== null) found.push(current)
      const out = []
      for (const row of found) {
        let toolName = null
        let persona
        for (let i = 0; i < row.body.length; i++) {
          const name = /^\s*toolName:\s*(\S+)\s*$/.exec(row.body[i])
          if (name !== null) { toolName = name[1]; continue }
          const block = /^(\s*)persona:\s*\|\s*$/.exec(row.body[i])
          if (block !== null) {
            const indent = block[1].length + 2
            const collected = []
            for (let j = i + 1; j < row.body.length; j++) {
              const text = row.body[j]
              if (text.trim() === '') { collected.push(''); continue }
              if (text.match(/^\s*/)[0].length < indent) break
              collected.push(text)
            }
            const first = collected.filter((text) => text.trim() !== '')[0]
            const base = first === undefined ? indent : first.match(/^\s*/)[0].length
            persona = collected.map((text) => (text.trim() === '' ? '' : text.slice(base))).join('\n').replace(/\s+$/, '')
          }
        }
        if (toolName !== null) out.push({ toolName, persona })
      }
      return out
    }

    async function ensureRows() {
      if (rows !== null) return rows
      let text = null
      const presets = ctx.get('agentPresets')
      if (presets === undefined) rowsError = 'agentPresets service unavailable'
      else {
        try { text = await presets.read(PRESET_ID) } catch (error) { rowsError = errorText(error) }
      }
      const parsed = typeof text === 'string' ? parseComposition(text) : []
      if (parsed.length === 0) {
        rows = LANES.map((lane) => ({ toolName: lane.tool, persona: undefined }))
        if (rowsError === null) rowsError = 'no subagent rows found in the preset composition'
      } else {
        rows = parsed
        rowsError = null
      }
      return rows
    }

    function rowFor(toolName) {
      const list = rows === null ? [] : rows
      for (const row of list) if (row.toolName === toolName) return row
      return { toolName, persona: undefined }
    }

    async function buildCatalog(refresh) {
      if (catalog !== null && refresh !== true) return catalog
      const llm = ctx.get('llm')
      if (llm === undefined) {
        catalog = []
        catalogError = 'llm service unavailable'
        return catalog
      }
      const providers = []
      let infos = []
      try { infos = llm.listProviders() } catch (error) { catalogError = errorText(error) }
      for (const info of infos) {
        const entry = { id: String(info.id), name: String(info.name === undefined ? info.id : info.name), models: [] }
        let models = []
        try { models = await llm.listModels(entry.id) } catch (error) { providers.push(entry); catalogError = entry.id + ': ' + errorText(error); continue }
        for (const model of models) {
          const item = { id: String(model.id), name: String(model.name === undefined ? model.id : model.name), efforts: [] }
          try {
            const resolved = await llm.resolveModelInfo(entry.id, item.id)
            const reasoning = resolved === null || resolved === undefined ? undefined : resolved.reasoning
            if (reasoning !== undefined && reasoning !== null && Array.isArray(reasoning.efforts)) {
              item.efforts = reasoning.efforts.map((effort) => ({ id: String(effort.id), name: String(effort.name === undefined ? effort.id : effort.name) }))
            }
          } catch (error) { /* a model without resolvable metadata still appears, with no effort list */ }
          entry.models.push(item)
        }
        providers.push(entry)
      }
      catalog = providers
      catalogError = null
      return catalog
    }

    function pinFor(key) {
      const pin = pins.get(key)
      return pin === undefined ? null : pin
    }

    async function snapshot(refresh) {
      await ensureRows()
      const providers = await buildCatalog(refresh === true)
      const lanes = LANES.map((lane) => {
        const row = rowFor(lane.tool)
        const pin = pinFor(lane.key)
        return {
          key: lane.key,
          tool: 'lane_' + suffix(lane.key),
          presetTool: lane.tool,
          hasPersona: typeof row.persona === 'string' && row.persona.length > 0,
          provider: pin === null ? null : pin.provider,
          model: pin === null ? null : pin.model,
          reasoningEffort: pin === null || pin.reasoningEffort === undefined ? null : pin.reasoningEffort
        }
      })
      const hasPersona = lanes.filter((lane) => lane.hasPersona).length
      return {
        presetId: PRESET_ID,
        lanes,
        catalog: providers,
        notes: [
          '提示词（persona）从已安装的 preset 组合文件中读取，共 ' + String(hasPersona) + '/' + String(lanes.length) + ' 条；' + (rowsError === null ? '读取正常' : '读取问题：' + rowsError),
          catalogError === null ? '模型目录来自当前已注册的提供方' : '模型目录告警：' + catalogError,
          '本原型不落盘：DSH 重启后设置回到“继承”；只读工具限制暂未复刻（会随正式插件回到 preset 一侧，避免名字解析失败）'
        ]
      }
    }

    function applyPins(input) {
      if (input === null || typeof input !== 'object' || !Array.isArray(input.lanes)) return 'expected { lanes: [...] }'
      const applied = []
      for (const lane of input.lanes) {
        if (lane === null || typeof lane !== 'object') continue
        const key = String(lane.key)
        if (LANES.filter((item) => item.key === key).length === 0) continue
        const provider = typeof lane.provider === 'string' && lane.provider !== '' ? lane.provider : null
        const model = typeof lane.model === 'string' && lane.model !== '' ? lane.model : null
        if (provider === null || model === null) { pins.set(key, null); applied.push(key + '=inherit'); continue }
        const effort = typeof lane.reasoningEffort === 'string' && lane.reasoningEffort !== '' ? lane.reasoningEffort : undefined
        pins.set(key, effort === undefined ? { provider, model } : { provider, model, reasoningEffort: effort })
        applied.push(key + '=' + provider + '/' + model + (effort === undefined ? '' : '/' + effort))
      }
      return applied.join('\n')
    }

    harness.handle('get-state', async (args) => {
      const refresh = args !== null && typeof args === 'object' && args.refresh === true
      return await snapshot(refresh)
    })

    harness.handle('set-lanes', (args) => {
      const result = applyPins(args)
      return { result }
    })

    function textOf(result) {
      const parts = []
      if (result !== null && typeof result === 'object' && Array.isArray(result.output)) {
        for (const block of result.output) {
          if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
        }
      }
      return parts.join('')
    }

    for (const lane of LANES) {
      const name = 'lane_' + suffix(lane.key)
      harness.registerTool(ctx, harness.defineTool({
        name,
        description: 'Delegate to the ' + lane.key + ' specialist of the MyWorkbench roster using the model and reasoning effort pinned for this lane in the MyWorkbench lane settings page (settings → MyWorkbench 赛道模型). The persona is the same prompt the preset\'s ' + lane.tool + ' uses. Starts a background continuable subagent by default and returns its durable child id; pass run_in_background: false to wait for the final report instead.',
        parameters: {
          prompt: { type: 'string', required: true, description: 'The complete, self-contained task for this specialist.' },
          run_in_background: { type: 'boolean', description: 'Defaults to true: start a background child and return its id. Set false to wait for the final text.' }
        },
        output: {
          schema: { type: 'string' },
          render(args, value) { return [{ type: 'text', text: value }] }
        },
        async execute(args, exec) {
          const parent = exec.agent
          if (parent === undefined) return 'Error: this tool needs a calling agent'
          await ensureRows()
          const row = rowFor(lane.tool)
          const pin = pinFor(lane.key)
          const route = pin === null ? 'inherit' : pin.provider + '/' + pin.model + (pin.reasoningEffort === undefined ? '' : ' · ' + pin.reasoningEffort)
          const agentOptions = pin === null ? undefined : (pin.reasoningEffort === undefined ? { provider: pin.provider, model: pin.model } : { provider: pin.provider, model: pin.model, reasoningEffort: pin.reasoningEffort })
          const hasPersona = typeof row.persona === 'string' && row.persona.length > 0
          const base = { prompt: [{ type: 'text', text: String(args.prompt) }], parent, maxDepth: 3 }
          if (agentOptions !== undefined) base.agentOptions = agentOptions
          if (hasPersona) base.persona = row.persona
          const background = args.run_in_background !== false
          try {
            if (background) {
              const started = await ctx.subagents.startContinuable({ provider: 'spawn', label: lane.key + ' lane', request: base, signal: exec.signal })
              return 'started subagent ' + String(started.childId) + ' — lane ' + lane.key + ', route ' + route + (hasPersona ? '' : ' (no persona found)') + '. Continue it with send_message.'
            }
            const request = { label: lane.key + ' lane', prompt: base.prompt, parent, signal: exec.signal, maxDepth: 3 }
            if (agentOptions !== undefined) request.agentOptions = agentOptions
            if (hasPersona) request.persona = base.persona
            const run = await ctx.subagents.start('spawn', request)
            try {
              const result = await run.result
              const text = textOf(result)
              if (result !== null && typeof result === 'object' && result.stopReason !== undefined && result.stopReason !== 'completed') {
                return 'Error: ' + String(result.stopReason) + (result.diagnostic === undefined ? '' : ' — ' + String(result.diagnostic)) + (text === '' ? '' : '\n\n' + text)
              }
              return text === '' ? '(lane ' + lane.key + ' returned no text; route ' + route + ')' : text
            } finally {
              await run.dispose()
            }
          } catch (error) {
            return 'Error: lane ' + lane.key + ' (' + route + ') failed: ' + errorText(error)
          }
        }
      }))
    }

    const prompt = ctx.get('systemPrompt')
    if (prompt !== undefined) {
      prompt.section({
        name: 'my-workbench-lanes',
        order: 2850,
        text: 'Delegation lanes: the lane_explorer, lane_librarian, lane_oracle, lane_ui_designer, lane_fixer, lane_observer and lane_improver tools delegate to the same MyWorkbench specialists as the preset\'s subagent_* tools, but each reads its model and reasoning effort from the MyWorkbench lane settings page (settings → MyWorkbench 赛道模型). Prefer a lane_* tool when the user names a model or effort for that specialist; otherwise either tool is equivalent.'
      })
    }
  }
}
