import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import test from 'node:test'
import React from 'react'
import { build } from 'esbuild'
import { HISTORICAL_MESSAGES, historicalErrorHint } from '../src/client/historical-launcher-state.js'

const sourcePath = new URL('../src/client/index.jsx', import.meta.url).pathname
const source = await readFile(sourcePath, 'utf8')
const start = source.indexOf('function historicalError(')
const end = source.indexOf('\nfunction DashboardView(', start)
assert.ok(start > 0 && end > start, 'Compile the real HistoricalLauncher without adding production exports')
const launcher = source.slice(start, end)
const bundle = await build({
  stdin: { contents: `
    import React, { useState, useEffect, useRef } from 'react'
    import { historicalErrorHint } from './historical-launcher-state.js'
    const useHarborApi = () => environment.request
    const useHarborMutation = () => environment.update
    const HarborErrorState = 'test-error'
    const oceanBackground = 'data:image/jpeg;base64,test-ocean'
    ${launcher}
    export { HistoricalLauncher }
  `, loader: 'jsx', resolveDir: dirname(sourcePath) },
  bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'],
})
const tick = () => new Promise(resolve => setImmediate(resolve))
const preview = (overrides = {}) => ({
  scope: 'dsh-history', previewId: 'preview-a', expiresAt: '2026-09-06T12:00:00Z',
  selected: [1, 2, 3].map(index => ({ trialId: `trial-${index}`, title: `历史会话 ${index}`, turnCount: index, toolCallCount: 2 })),
  dataPolicy: { mode: 'source-text-with-secret-redaction', localPaths: 'preserved' },
  evaluation: { judge: { provider: 'test-provider', model: 'review-model' } }, ...overrides,
})
const operation = (status, overrides = {}) => ({ operationId: 'operation-a', status, selectedCount: 3, workspace: 'workspace-a', ...overrides })

function harness({ request = async () => ({ status: 'idle' }), update, language = 'zh' } = {}) {
  const values = [], effects = new Map(), queue = [], timers = new Map(), listeners = new Map()
  const writes = [], reads = [], completed = [], reloads = [], stateWrites = []
  let cursor = 0, timerId = 0
  const hooks = { ...React,
    useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial; return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next; stateWrites.push({ slot, value: values[slot] }) }] },
    useRef(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot] },
    useEffect(fn, deps) { const slot = cursor++, previous = effects.get(slot); if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) queue.push(() => { previous?.dispose?.(); effects.set(slot, { deps, dispose: fn() }) }) },
  }
  const environment = {
    request: async (route, args) => { reads.push({ route, args }); return request(route, args) },
    update: async (route, args) => { writes.push({ route, args }); return update ? update(route, args) : route === 'historical-preview' ? preview() : operation('queued') },
  }
  const window = {
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id },
    clearTimeout(id) { timers.delete(id) },
    addEventListener(type, fn) { listeners.set(type, fn) },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type) },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'environment', 'window', bundle.outputFiles[0].text)(name => { assert.equal(name, 'react'); return hooks }, module, module.exports, environment, window)
  const t = key => HISTORICAL_MESSAGES[language][key] ?? ({ close: '关闭' })[key] ?? key
  let props = { snapshot: { workspace: { id: 'workspace-a', label: '/private/workspace' } }, t,
    reload: async force => { reloads.push(force) }, onCompleted: value => completed.push(value),
  }
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : ''
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)]
  const render = () => { cursor = 0; const tree = module.exports.HistoricalLauncher(props); for (const fn of queue.splice(0)) fn(); return flatten(tree) }
  return { writes, reads, completed, reloads, stateWrites, render, text, t,
    async click(predicate) { const node = render().find(value => value.type === 'button' && (typeof predicate === 'string' ? text(value) === t(predicate) : predicate(value))); assert.ok(node, `Button missing: ${predicate}`); assert.equal(Boolean(node.props.disabled), false); node.props.onClick(); await tick() },
    async launch() { render(); await tick(); await this.click(node => node.props.className === 'hse-launch-button') },
    async poll() { const next = timers.entries().next().value; assert.ok(next, 'The running operation must schedule a status read'); timers.delete(next[0]); next[1](); await tick() },
    escape() { listeners.get('keydown')?.({ key: 'Escape' }) },
    setProps(next) { props = { ...props, ...next } },
    dispose() { for (const effect of effects.values()) effect.dispose?.() },
  }
}

test('compact Hero consolidates identity, health, core metrics, refresh, and Historical launch', async () => {
  const ui = harness()
  ui.setProps({
    variant: 'hero',
    snapshot: {
      workspace: { id: 'workspace-a', label: '/private/workspace' },
      overview: { totalJobs: 4, totalTrials: 12, totalExceptions: 2, attention: { blocked: 1 } },
    },
  })
  try {
    const nodes = ui.render()
    const hero = nodes.find(node => node.type === 'section' && node.props.className === 'hse-hero')
    assert.ok(hero)
    assert.match(hero.props.style['--ocean-image'], /test-ocean/)
    assert.match(ui.text(hero), /Harbor.*health.*health_blocked.*jobs4.*trials12.*exceptions2/s)
    assert.equal(nodes.some(node => node.props?.className === 'hse-launch-card'), false)
    assert.ok(nodes.some(node => node.props?.className === 'hse-refresh'))
    await ui.click(node => node.props.className === 'hse-hero-primary')
    assert.deepEqual(ui.writes, [{ route: 'historical-preview', args: { workspace: 'workspace-a', limit: 3, includeFeedback: true } }])
  } finally { ui.dispose() }
})

test('launcher finds at most three Sessions automatically and runs only after a clear model disclosure and confirmation', async () => {
  const ui = harness()
  try {
    await ui.launch()
    assert.deepEqual(ui.writes, [{ route: 'historical-preview', args: { workspace: 'workspace-a', limit: 3, includeFeedback: true } }])
    const nodes = ui.render(), content = ui.text(nodes)
    assert.equal(nodes.filter(node => node.type === 'article').length, 3)
    assert.match(content, /会话数据.*评审模型.*模型费用/)
    assert.match(content, /数据策略.*原文.*凭据与会话标识脱敏.*绝对路径保留/)
    assert.match(content, /Judge 数据边界.*初始目标.*可见对话.*不发送 reasoning、工具载荷或附件/)
    assert.match(content, /test-provider.*review-model/)
    assert.doesNotMatch(content, /private\/workspace|当前目录|显式 Dataset|最近 30 天/)
    assert.equal(nodes.some(node => ['input', 'select'].includes(node.type)), false, 'No directory, source, date, or project picker')
    assert.equal(ui.writes.some(item => item.route === 'historical-run'), false)
    await ui.click('historicalConfirm')
    assert.deepEqual(ui.writes.at(-1), { route: 'historical-run', args: { workspace: 'workspace-a', previewId: 'preview-a' } })
    assert.match(ui.text(ui.render()), /正在评测历史会话/)
  } finally { ui.dispose() }
})

test('empty, unreadable, and bounded-window exhaustion stay distinct and offer the same path-free retry', async t => {
  for (const [code, expected] of [
    ['NO_ELIGIBLE_SESSIONS', 'noEligibleHint'],
    ['SESSION_HISTORY_READ_FAILED', 'historyReadFailedHint'],
    ['SESSION_HISTORY_WINDOW_EXHAUSTED', 'historyWindowExhaustedHint'],
  ]) await t.test(code, async () => {
    const ui = harness({ update: async () => { throw new Error(`${code}: diagnostic`) } })
    try {
      await ui.launch()
      const nodes = ui.render(), error = nodes.find(node => node.type === 'test-error')?.props.error
      assert.equal(error.code, code)
      assert.equal(error.nextStep, ui.t(expected))
      const details = nodes.find(node => node.type === 'details')
      assert.ok(details, 'Raw diagnostics must remain available on demand')
      assert.equal(Boolean(details.props.open), false, 'Technical details must start closed')
      assert.equal(React.Children.toArray(details.props.children).some(node => node.type === 'test-error'), true, 'The raw error renderer must be inside closed technical details')
      assert.equal(ui.text(nodes.find(node => node.props?.role === 'alert')), ui.t(expected), 'The default error is the localized user-facing guidance')
      assert.equal(ui.text(nodes.find(node => node.type === 'summary')), ui.t('historicalErrorDetails'))
      for (const node of nodes.filter(node => ['h2', 'h3', 'p'].includes(node.type))) assert.doesNotMatch(ui.text(node), /diagnostic|NO_ELIGIBLE_SESSIONS|SESSION_HISTORY_READ_FAILED|SESSION_HISTORY_WINDOW_EXHAUSTED/)
      assert.doesNotMatch(ui.text(nodes), /确认前只读取|不启动评测/)
      assert.match(ui.text(nodes), /评测暂时无法继续/)
      assert.equal(nodes.some(node => ['input', 'select'].includes(node.type)), false)
      assert.doesNotMatch(ui.text(nodes), /最近 30 天|当前目录|显式 Dataset/)
      await ui.click('previewAgain')
      assert.equal(ui.writes.length, 2)
      assert.deepEqual(ui.writes[1].args, { workspace: 'workspace-a', limit: 3, includeFeedback: true })
      assert.equal(ui.writes.some(item => item.route === 'historical-run'), false)
    } finally { ui.dispose() }
  })
})

test('a usable partial sample discloses unscanned or unreadable history without exposing scan controls', async () => {
  const ui = harness({ update: async () => preview({ scan: { partial: true, unscannedCount: 12345 }, excludedCounts: { unreadable: 2 } }) })
  try {
    await ui.launch()
    const nodes = ui.render(), content = ui.text(nodes)
    assert.match(content, /未遍历全部历史/)
    assert.match(content, /部分历史记录未能读取/)
    assert.doesNotMatch(content, /12345|最近 30 天/)
    assert.equal(nodes.some(node => ['input', 'select'].includes(node.type)), false)
    assert.equal(ui.writes.some(item => item.route === 'historical-run'), false)
  } finally { ui.dispose() }
})

test('closing a confirmed evaluation does not cancel it; polling opens only the completed operation result', async () => {
  const ui = harness({ request: async (_route, args) => args.operationId ? operation('completed', { jobName: 'completed-job' }) : { status: 'idle' } })
  try {
    await ui.launch(); await ui.click('historicalConfirm'); ui.render()
    await ui.click('close')
    assert.equal(ui.render().some(node => node.props?.role === 'dialog'), false)
    assert.equal(ui.completed.length, 0)
    await ui.poll()
    assert.deepEqual(ui.reloads, [true])
    assert.equal(ui.completed[0].jobName, 'completed-job')
    assert.deepEqual(ui.writes.map(item => item.route), ['historical-preview', 'historical-run'])
  } finally { ui.dispose() }
})

test('completion opens its exact result after an asynchronous dashboard refresh and terminal-state render', async () => {
  let finishReload
  const ui = harness({ request: async (_route, args) => args.operationId ? operation('completed', { jobName: 'completed-job' }) : { status: 'idle' } })
  ui.setProps({ reload: () => new Promise(resolve => { finishReload = resolve }) })
  try {
    await ui.launch(); await ui.click('historicalConfirm'); ui.render(); await ui.poll()
    assert.equal(typeof finishReload, 'function')
    // React renders the terminal operation before the real dashboard HTTP
    // request resolves, disposing the effect that observed the running status.
    ui.render()
    assert.equal(ui.completed.length, 0, 'Result navigation waits for the dashboard refresh')
    finishReload(); await tick(); ui.render()
    assert.deepEqual(ui.completed, [operation('completed', { jobName: 'completed-job' })])
    assert.deepEqual(ui.writes.map(item => item.route), ['historical-preview', 'historical-run'])
  } finally { ui.dispose() }
})

test('deferred completion cannot navigate after workspace change, Session disposal, or a newer preview', async t => {
  for (const change of ['workspace', 'unmount', 'preview']) await t.test(change, async () => {
    let finishReload
    const ui = harness({ request: async (_route, args) => args.operationId ? operation('completed', { jobName: 'completed-job' }) : { status: 'idle' } })
    ui.setProps({ reload: () => new Promise(resolve => { finishReload = resolve }) })
    try {
      await ui.launch(); await ui.click('historicalConfirm'); ui.render(); await ui.poll(); ui.render()
      assert.equal(typeof finishReload, 'function')
      if (change === 'workspace') {
        ui.setProps({ snapshot: { workspace: { id: 'workspace-b', label: 'Other' } } }); ui.render(); await tick()
      } else if (change === 'unmount') ui.dispose()
      else await ui.click(node => node.props.className === 'hse-launch-button')
      const before = ui.stateWrites.length
      finishReload(); await tick()
      assert.equal(ui.stateWrites.length, before, 'A completed old operation must not update the newer UI')
      assert.equal(ui.completed.length, 0, 'A completed old operation must not take over the current page')
      assert.equal(ui.writes.filter(item => item.route === 'historical-run').length, 1, 'Completion never starts another evaluation')
      if (change === 'preview') {
        assert.equal(ui.render().some(node => node.props?.role === 'dialog'), true)
        assert.equal(ui.render().filter(node => node.type === 'article').length, 3)
      }
    } finally { ui.dispose() }
  })
})

test('running failures remain failures instead of being shown as empty history or successful completion', async () => {
  const ui = harness({ request: async (_route, args) => args.operationId ? operation('failed', { error: { code: 'HISTORICAL_JOB_FAILED', message: 'runner unavailable' } }) : { status: 'idle' } })
  try {
    await ui.launch(); await ui.click('historicalConfirm'); ui.render(); await ui.poll()
    const error = ui.render().find(node => node.type === 'test-error')?.props.error
    assert.equal(error.code, 'HISTORICAL_JOB_FAILED')
    assert.equal(error.nextStep, ui.t('historicalGenericError'))
    assert.doesNotMatch(error.nextStep, /没有启动|历史记录.*不存在/)
    assert.doesNotMatch(ui.text(ui.render()), /确认前只读取|不启动评测/)
    assert.match(ui.text(ui.render()), /评测暂时无法继续/)
    assert.equal(ui.completed.length, 0)
  } finally { ui.dispose() }
})

test('late previews cannot repopulate a closed dialog or a different workspace', async () => {
  for (const action of ['close', 'workspace']) {
    let finish
    const ui = harness({ update: async () => new Promise(resolve => { finish = resolve }) })
    try {
      await ui.launch(); ui.render()
      if (action === 'close') ui.escape()
      else { ui.setProps({ snapshot: { workspace: { id: 'workspace-b', label: 'Other' } } }); ui.render() }
      finish(preview()); await tick()
      assert.equal(ui.render().some(node => node.type === 'article'), false)
      assert.equal(ui.render().some(node => node.props?.role === 'dialog'), false)
      assert.equal(ui.writes.some(item => item.route === 'historical-run'), false)
    } finally { ui.dispose() }
  }
})

test('late run responses and failures cannot update another workspace or an unmounted Session', async t => {
  for (const change of ['workspace', 'unmount']) for (const outcome of ['success', 'failure']) await t.test(`${change}: ${outcome}`, async () => {
    let finish, reject
    const ui = harness({ update: async route => route === 'historical-preview' ? preview() : new Promise((resolve, fail) => { finish = resolve; reject = fail }) })
    try {
      await ui.launch(); await ui.click('historicalConfirm'); ui.render()
      assert.match(ui.text(ui.render()), /正在提交已确认的评测/)
      assert.doesNotMatch(ui.text(ui.render()), /确认前只读取|不启动评测/)
      if (change === 'workspace') { ui.setProps({ snapshot: { workspace: { id: 'workspace-b', label: 'Other' } } }); ui.render(); await tick() }
      else ui.dispose()
      const before = ui.stateWrites.length
      if (outcome === 'success') finish(operation('queued'))
      else reject(new Error('HISTORICAL_JOB_FAILED: failed request'))
      await tick()
      assert.equal(ui.stateWrites.length, before, 'An old launch must not write after ownership changes')
      assert.equal(ui.completed.length, 0)
      if (change === 'workspace') {
        assert.equal(ui.render().some(node => node.props?.role === 'dialog'), false)
        assert.doesNotMatch(ui.text(ui.render()), /正在评测历史会话/)
      }
    } finally { ui.dispose() }
  })
})

test('an already-running recovery response also stays bound to its original workspace', async () => {
  let finishRecovery, reads = 0
  const ui = harness({
    update: async route => { if (route === 'historical-preview') return preview(); throw new Error('HISTORICAL_JOB_ALREADY_RUNNING: existing operation') },
    request: async () => ++reads === 2 ? new Promise(resolve => { finishRecovery = resolve }) : { status: 'idle' },
  })
  try {
    await ui.launch(); await ui.click('historicalConfirm'); ui.render()
    assert.equal(typeof finishRecovery, 'function')
    ui.setProps({ snapshot: { workspace: { id: 'workspace-b', label: 'Other' } } }); ui.render(); await tick()
    const before = ui.stateWrites.length
    finishRecovery(operation('running')); await tick()
    assert.equal(ui.stateWrites.length, before)
    assert.doesNotMatch(ui.text(ui.render()), /正在评测历史会话/)
  } finally { ui.dispose() }
})

test('closing a starting dialog preserves the confirmed run and its eventual state in the same workspace', async () => {
  let finish
  const ui = harness({ update: async route => route === 'historical-preview' ? preview() : new Promise(resolve => { finish = resolve }) })
  try {
    await ui.launch(); await ui.click('historicalConfirm'); ui.render()
    await ui.click(node => node.props.className === 'hse-dialog-close')
    assert.equal(ui.render().some(node => node.props?.role === 'dialog'), false)
    finish(operation('queued')); await tick()
    assert.match(ui.text(ui.render()), /正在评测历史会话/)
    assert.equal(ui.render().some(node => node.props?.role === 'dialog'), false)
    await ui.click(node => node.props.className === 'hse-launch-button')
    assert.equal(ui.render().some(node => node.props?.role === 'dialog'), true)
    assert.deepEqual(ui.writes.map(item => item.route), ['historical-preview', 'historical-run'])
  } finally { ui.dispose() }
})

test('both languages describe history discovery without asking for a path or time window', () => {
  assert.deepEqual(Object.keys(HISTORICAL_MESSAGES.zh).sort(), Object.keys(HISTORICAL_MESSAGES.en).sort())
  for (const language of ['zh', 'en']) {
    const t = key => HISTORICAL_MESSAGES[language][key]
    assert.notEqual(historicalErrorHint('NO_ELIGIBLE_SESSIONS', t), historicalErrorHint('SESSION_HISTORY_READ_FAILED', t))
    assert.notEqual(historicalErrorHint('NO_ELIGIBLE_SESSIONS', t), historicalErrorHint('SESSION_HISTORY_WINDOW_EXHAUSTED', t))
    assert.doesNotMatch(Object.values(HISTORICAL_MESSAGES[language]).join(' '), /先在这个目录|显式 Dataset|最近 30 天|Complete a real task here|last 30 days/)
  }
})
