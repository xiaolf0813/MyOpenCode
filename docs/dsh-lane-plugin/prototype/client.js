// Prototype Client half, transcribed from the dynamic Cordis Package
// lanes-4/pkg-7 (run-7) on 2026-09-20, while it was running in the user's
// DSH web profile. Like host.js, this file holds the Package BODY verbatim: a
// function body that returns a Cordis Plugin (plain JavaScript, no JSX —
// React.createElement only; the sandbox exposes React, host, styles, ctx).
//
// Behaviour: one settings page (`settings.section`, id `my-workbench-lanes`,
// order 25, label "MyWorkbench 赛道模型") listing the 7 lanes, each with a
// model select (live catalog from the Host half) and a reasoning-effort
// select; buttons: 应用 / 套用推荐映射 / 全部改回继承 / 刷新模型目录.
// It talks to the Host half through host.call('get-state' | 'set-lanes') and
// renders only lossless JSON (an explicit `undefined` in a payload is
// rejected by the RPC boundary).
//
// A packaged plugin must rebuild this half against the deployment's client
// plugin pipeline (bundle + `dsh.client` scan) — see PLAN.md. The React logic
// and the Host RPC contract are reusable as-is.

return {
  name: 'workbench-lanes-ui',
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const h = React.createElement
    const RECOMMENDED = {
      explorer: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoningEffort: 'low' },
      librarian: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoningEffort: 'low' },
      fixer: { provider: 'zai-coding-cn', model: 'glm-5.3-flash', reasoningEffort: 'high' },
      observer: { provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp', reasoningEffort: 'low' },
      'ui-designer': { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'high' },
      oracle: { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'max' },
      improver: { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'high' }
    }

    styles.insert('.mwl-page{padding:18px 0;display:flex;flex-direction:column;gap:14px;max-width:720px}' +
      '.mwl-title{margin:0;font-size:18px;font-weight:600;color:var(--dsw-alias-label-primary,#111)}' +
      '.mwl-intro{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary,#666)}' +
      '.mwl-row{display:grid;grid-template-columns:132px 1fr 1fr;gap:10px;align-items:center;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.1));border-radius:12px}' +
      '.mwl-name{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,#111);display:flex;flex-direction:column;gap:2px}' +
      '.mwl-sub{font-size:11px;color:var(--dsw-alias-label-caption,#888)}' +
      '.mwl-select{width:100%;min-height:30px;font-size:12px;padding:4px 6px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.1));background:transparent;color:var(--dsw-alias-label-primary,#111)}' +
      '.mwl-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
      '.mwl-button{min-height:30px;padding:0 14px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l4,rgba(0,0,0,.1));background:transparent;color:var(--dsw-alias-label-primary,#111);font-size:13px;cursor:pointer}' +
      '.mwl-button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}' +
      '.mwl-buttonPrimary{background:var(--dsw-static-neutral-bluish-400,#2b6cb0);color:#fff;border-color:transparent}' +
      '.mwl-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-caption,#888)}' +
      '.mwl-status{font-size:12px;color:var(--dsw-alias-label-tertiary,#666)}' +
      '.mwl-statusError{font-size:12px;color:var(--dsw-alias-state-error-primary,#c00)}')

    function blank(lane) {
      return { key: lane.key, provider: '', model: '', reasoningEffort: '' }
    }

    function LaneSection() {
      const [view, setView] = React.useState({ status: 'loading' })
      const [draft, setDraft] = React.useState([])
      const [message, setMessage] = React.useState(null)

      function adopt(state) {
        if (state === null || typeof state !== 'object' || !Array.isArray(state.lanes)) {
          setView({ status: 'error', error: 'unexpected host response' })
          return
        }
        setView({ status: 'ok', state })
        setDraft(state.lanes.map((lane) => ({
          key: lane.key,
          provider: lane.provider === null ? '' : lane.provider,
          model: lane.model === null ? '' : lane.model,
          reasoningEffort: lane.reasoningEffort === null ? '' : lane.reasoningEffort
        })))
      }

      function load(refresh) {
        host.call('get-state', { refresh: refresh === true }).then(adopt).catch((error) => setView({ status: 'error', error: String(error && error.message ? error.message : error) }))
      }

      React.useEffect(() => { load(false) }, [])

      if (view.status === 'loading') return h('div', { className: 'mwl-page' }, h('p', { className: 'mwl-note' }, '加载中…'))
      if (view.status === 'error') return h('div', { className: 'mwl-page' }, h('h2', { className: 'mwl-title' }, 'MyWorkbench 赛道模型'), h('p', { className: 'mwl-statusError' }, view.error))

      const state = view.state
      const lanes = state.lanes
      const catalog = state.catalog

      function known(provider, model) {
        for (const entry of catalog) {
          if (entry.id !== provider) continue
          for (const item of entry.models) if (item.id === model) return true
        }
        return false
      }

      function options() {
        const list = [h('option', { key: '__inherit', value: '' }, '继承会话模型')]
        for (const provider of catalog) {
          for (const model of provider.models) list.push(h('option', { key: provider.id + '|' + model.id, value: provider.id + '|' + model.id }, provider.name + ' / ' + model.name))
        }
        return list
      }

      function effortOptions(lane) {
        const list = [h('option', { key: '__default', value: '' }, '模型默认')]
        if (lane.provider === '' || lane.model === '') return list
        for (const provider of catalog) {
          if (provider.id !== lane.provider) continue
          for (const model of provider.models) {
            if (model.id !== lane.model) continue
            for (const effort of model.efforts) list.push(h('option', { key: effort.id, value: effort.id }, effort.name))
          }
        }
        return list
      }

      function setLane(key, patch) {
        setDraft(draft.map((lane) => (lane.key === key ? Object.assign({}, lane, patch) : lane)))
      }

      function save() {
        setMessage('保存中…')
        host.call('set-lanes', { lanes: draft }).then((result) => {
          const text = result !== null && typeof result === 'object' && typeof result.result === 'string' ? result.result : 'ok'
          setMessage('已应用：' + text.replace(/\n/g, '; '))
          load(false)
        }).catch((error) => setMessage('保存失败：' + String(error && error.message ? error.message : error)))
      }

      function recommend() {
        const missing = []
        const next = draft.map((lane) => {
          const pick = RECOMMENDED[lane.key]
          if (pick === undefined) return lane
          if (!known(pick.provider, pick.model)) { missing.push(lane.key); return lane }
          return { key: lane.key, provider: pick.provider, model: pick.model, reasoningEffort: pick.reasoningEffort === undefined ? '' : pick.reasoningEffort }
        })
        setDraft(next)
        setMessage('已填入推荐映射，点“应用”生效' + (missing.length === 0 ? '' : '（目录里没有：' + missing.join('、') + '）'))
      }

      function reset() {
        setDraft(lanes.map(blank))
        setMessage('已全部改为“继承”，点“应用”生效')
      }

      const rows = lanes.map((lane) => {
        const item = draft.filter((entry) => entry.key === lane.key)[0] || { key: lane.key, provider: '', model: '', reasoningEffort: '' }
        const value = item.provider === '' || item.model === '' ? '' : item.provider + '|' + item.model
        return h('div', { className: 'mwl-row', key: lane.key },
          h('div', { className: 'mwl-name' }, lane.key, h('span', { className: 'mwl-sub' }, lane.tool + (lane.hasPersona ? '' : ' · 无提示词'))),
          h('select', {
            className: 'mwl-select',
            value,
            onChange: (event) => {
              const next = String(event.target.value)
              if (next === '') { setLane(lane.key, { provider: '', model: '', reasoningEffort: '' }); return }
              const parts = next.split('|')
              setLane(lane.key, { provider: parts[0], model: parts[1], reasoningEffort: '' })
            }
          }, options()),
          h('select', {
            className: 'mwl-select',
            value: item.reasoningEffort,
            disabled: item.provider === '' || item.model === '',
            onChange: (event) => setLane(lane.key, { reasoningEffort: String(event.target.value) })
          }, effortOptions(item))
        )
      })

      const notes = Array.isArray(state.notes) ? state.notes : []

      return h('div', { className: 'mwl-page' },
        h('h2', { className: 'mwl-title' }, 'MyWorkbench 赛道模型'),
        h('p', { className: 'mwl-intro' }, '为 7 条专家赛道分别固定模型与推理等级（左侧选模型，右侧选思考级别）。改动立即对下一次 lane_* 委派生效；不动则继承当前会话模型。'),
        rows,
        h('div', { className: 'mwl-actions' },
          h('button', { className: 'mwl-button mwl-buttonPrimary', onClick: save }, '应用'),
          h('button', { className: 'mwl-button', onClick: recommend }, '套用推荐映射'),
          h('button', { className: 'mwl-button', onClick: reset }, '全部改回继承'),
          h('button', { className: 'mwl-button', onClick: () => load(true) }, '刷新模型目录'),
          message === null ? null : h('span', { className: 'mwl-status' }, message)
        ),
        notes.map((note, index) => h('p', { className: 'mwl-note', key: index }, note))
      )
    }

    slots.inject('settings.section', () => slots.register(
      { name: 'settings.section', id: 'my-workbench-lanes', order: 25, label: 'MyWorkbench 赛道模型' },
      () => h('div', null, h(LaneSection, null))
    ))
  }
}
