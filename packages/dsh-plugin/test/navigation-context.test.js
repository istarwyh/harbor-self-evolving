import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import React from 'react'
import { build } from 'esbuild'
import { normalizeHarborUiContext } from '../lib/ui-context.js'

// Use the same in-memory source/hook harness as index-usability.test.js.
const source = await readFile(new URL('../src/client/index.jsx', import.meta.url), 'utf8')
const compiled = await build({
  stdin: { contents: `${source}\nmodule.exports.__navigation = { DashboardSessionView, Workbench, TrialExplorer, TrialSelectionBar };`, resolveDir: fileURLToPath(new URL('../src/client/', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, format: 'cjs', platform: 'browser', external: ['react'],
  define: { __HSE_VERSION__: '"test"' }, logOverride: { 'commonjs-variable-in-esm': 'silent' },
})
const tick = () => new Promise(resolve => setImmediate(resolve))
const success = value => ({ ok: true, status: 200, json: async () => ({ ok: true, value }) })
const dashboard = workspace => ({ workspace: { id: workspace, label: workspace }, config: { projectRoot: '/synthetic', jobsDir: 'jobs' }, jobs: [], overview: {} })
const action = (id, target) => ({ kind: 'harbor.navigate', actionId: id, target })

function harness(componentName, initialProps = {}) {
  const slots = []
  const effects = new Map()
  const pendingEffects = []
  let cursor = 0
  let props = initialProps
  const same = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  const memo = (factory, dependencies) => {
    const index = cursor++
    if (!slots[index] || !same(slots[index].dependencies, dependencies)) slots[index] = { dependencies, value: factory() }
    return slots[index].value
  }
  const hooks = {
    ...React,
    useContext: () => 'session-navigation',
    useSyncExternalStore: (_subscribe, read) => read(),
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }] },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] },
    useCallback: (callback, dependencies) => memo(() => callback, dependencies),
    useMemo: memo,
    useEffect(callback, dependencies) {
      const index = cursor++
      const previous = effects.get(index)
      if (!previous || !same(previous.dependencies, dependencies)) pendingEffects.push(() => { previous?.cleanup?.(); effects.set(index, { dependencies, cleanup: callback() }) })
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(name => { assert.equal(name, 'react'); return hooks }, module, module.exports)
  const bridge = props.bridge ?? new module.exports.HarborUiBridge()
  props = { sessionId: 'session-navigation', bridge, t: key => key, ...props }
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)]
  const flush = () => { for (const effect of pendingEffects.splice(0)) effect() }
  const render = (runEffects = true) => {
    cursor = 0
    const tree = module.exports.__navigation[componentName](props)
    if (runEffects) flush()
    return flatten(tree)
  }
  return {
    bridge, render, flush,
    setProps(next) { props = { ...props, ...next } },
    component(name) { return render().find(node => typeof node.type === 'function' && node.type.name === name) },
    dispose() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear() },
  }
}

function environment(t, fetch) {
  const previousFetch = globalThis.fetch
  const previousWindow = globalThis.window
  const owners = []
  globalThis.fetch = fetch
  globalThis.window = { setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {} }
  t.after(() => { for (const owner of owners.reverse()) owner.dispose(); globalThis.fetch = previousFetch; globalThis.window = previousWindow })
  return ui => { owners.push(ui) }
}

async function settle(ui) { for (let index = 0; index < 5; index++) { ui.render(); await tick() } }

test('repeated same-home navigation republishes context without changing the workspace', async t => {
  const own = environment(t, async () => success(dashboard('workspace-a')))
  const ui = harness('DashboardSessionView', { useInput: read => read({ phase: 'plain' }), automaticContextSupported: true })
  own(ui)
  await settle(ui)
  assert.equal(ui.bridge.getSnapshot('session-navigation').current.workspace, 'workspace-a')
  for (let index = 0; index < 2; index++) {
    ui.bridge.navigate('session-navigation', action(`same-home-${index}`, { route: 'harbor.home', workspace: 'workspace-a' }), { force: true })
    await settle(ui)
    const context = ui.bridge.getSnapshot('session-navigation').current
    assert.equal(context.workspace, 'workspace-a')
    assert.equal(context.route.name, 'harbor.home')
  }
})

test('a workspace switch leaves no previous-page context while its dashboard is loading', async t => {
  let finish
  const own = environment(t, async url => url.includes('workspace=workspace-b')
    ? new Promise(resolve => { finish = resolve })
    : success(dashboard('workspace-a')))
  const ui = harness('DashboardSessionView', { useInput: read => read({ phase: 'plain' }), automaticContextSupported: true })
  own(ui)
  await settle(ui)
  ui.bridge.navigate('session-navigation', action('other-workspace', { route: 'harbor.home', workspace: 'workspace-b' }), { force: true })
  await settle(ui)
  assert.equal(ui.bridge.getSnapshot('session-navigation').current, undefined)
  finish(success(dashboard('workspace-b')))
  await settle(ui)
  assert.equal(ui.bridge.getSnapshot('session-navigation').current.workspace, 'workspace-b')
})

test('same-Job navigation refreshes its base context even when its section stays unchanged', async t => {
  const own = environment(t, async url => url.includes('/dashboard') ? success(dashboard('workspace-a')) : success({ job: 'job-a', artifacts: {} }))
  const ui = harness('DashboardSessionView', { useInput: read => read({ phase: 'plain' }), automaticContextSupported: true })
  own(ui)
  await settle(ui)
  ui.bridge.navigate('session-navigation', action('first-job', { route: 'harbor.job', workspace: 'workspace-a', job: 'job-a' }), { force: true })
  await settle(ui)
  const first = ui.component('Workbench')
  const workbench = harness('Workbench', first.props)
  own(workbench)
  await settle(workbench)
  const original = ui.bridge.getSnapshot('session-navigation').current
  ui.bridge.setCurrent('session-navigation', { ...original, selection: [{ kind: 'metric', id: 'old-metric', job: 'job-a' }] })
  ui.bridge.navigate('session-navigation', action('same-job', { route: 'harbor.job', workspace: 'workspace-a', job: 'job-a' }), { force: true })
  await settle(ui)
  assert.equal(ui.bridge.getSnapshot('session-navigation').current, undefined)
  const next = ui.component('Workbench')
  assert.equal(next.key, first.key, 'repositioning does not remount editors or discard unrelated local state')
  assert.notEqual(next.props.navigationRevision, first.props.navigationRevision)
  workbench.setProps(next.props)
  await settle(workbench)
  assert.equal(ui.bridge.getSnapshot('session-navigation').current.object.job, 'job-a')
  assert.deepEqual(ui.bridge.getSnapshot('session-navigation').current.selection ?? [], [])
})

test('child-first effects retain the new Trial for same-Job and repeated same-Trial navigation', async t => {
  const own = environment(t, async url => url.includes('/trial?')
    ? success({ trial: new URL(url, 'http://local.test').searchParams.get('trial') })
    : success({ job: 'job-a', artifacts: {} }))
  const target = trial => ({ route: 'harbor.trial.detail', workspace: 'workspace-a', job: 'job-a', stage: 'judge', trial })
  const workbench = harness('Workbench', { job: 'job-a', workspace: 'workspace-a', jobs: [], pageSessionId: 'page-navigation', navigationRevision: 1, navigation: action('trial-a', target('trial-a')), close() {} })
  own(workbench)
  await settle(workbench)
  const explorer = harness('TrialExplorer', workbench.component('TrialExplorer').props)
  own(explorer)
  await settle(explorer)
  assert.equal(workbench.bridge.getSnapshot('session-navigation').current.object.trial, 'trial-a')
  for (const [revision, trial] of [[2, 'trial-b'], [3, 'trial-b']]) {
    workbench.bridge.clearCurrent('session-navigation', 'page-navigation')
    workbench.setProps({ navigationRevision: revision, navigation: action(`trial-${revision}`, target(trial)) })
    for (let pass = 0; pass < 5; pass++) {
      const tree = workbench.render(false)
      explorer.setProps(tree.find(node => typeof node.type === 'function' && node.type.name === 'TrialExplorer').props)
      explorer.render()
      workbench.flush()
      await tick()
    }
    assert.equal(workbench.bridge.getSnapshot('session-navigation').current.object.trial, trial)
  }
})

test('a new Job clears old context before loading and never republishes its old Trial', async t => {
  let finish
  const own = environment(t, async url => url.includes('/dashboard')
    ? success(dashboard('workspace-a'))
    : new Promise(resolve => { finish = resolve }))
  const ui = harness('DashboardSessionView', { useInput: read => read({ phase: 'plain' }), automaticContextSupported: true })
  own(ui)
  await settle(ui)
  const home = ui.bridge.getSnapshot('session-navigation').current
  ui.bridge.setCurrent('session-navigation', { ...home, object: { kind: 'trial', job: 'old-job', trial: 'old-trial' } })
  ui.bridge.navigate('session-navigation', action('new-job', { route: 'harbor.job', workspace: 'workspace-a', job: 'new-job' }), { force: true })
  await settle(ui)
  assert.equal(ui.bridge.getSnapshot('session-navigation').current, undefined)
  const workbench = harness('Workbench', ui.component('Workbench').props)
  own(workbench)
  await settle(workbench)
  assert.equal(ui.bridge.getSnapshot('session-navigation').current.object.job, 'new-job')
  assert.equal(ui.bridge.getSnapshot('session-navigation').current.object.trial, undefined)
  finish(success({ job: 'new-job', artifacts: {} }))
  await settle(workbench)
  assert.equal(ui.bridge.getSnapshot('session-navigation').current.object.job, 'new-job')
})

test('a parent navigation effect cannot replace the target already published by its child', async t => {
  const own = environment(t, async () => success({ job: 'job-a', artifacts: {} }))
  const target = { route: 'harbor.trial.detail', workspace: 'workspace-a', job: 'job-a', stage: 'judge', trial: 'trial-b' }
  const workbench = harness('Workbench', { job: 'job-a', workspace: 'workspace-a', jobs: [], pageSessionId: 'page-navigation', navigationRevision: 1, navigation: action('before', target), close() {} })
  own(workbench)
  await settle(workbench)
  workbench.setProps({ navigationRevision: 2, navigation: action('repeat', target) })
  const tree = workbench.render(false)
  const child = tree.find(node => typeof node.type === 'function' && node.type.name === 'TrialExplorer')
  child.props.setContext(child.props.contextFor({ trial: 'trial-b' }))
  workbench.flush()
  assert.equal(workbench.bridge.getSnapshot('session-navigation').current.object.trial, 'trial-b')
})

function trialSet(ids, id = 'selection-a') {
  return { ref: { kind: 'trial-set', id, job: 'job-a', stage: 'judge', selectionCount: ids.length, sourceDigest: `sha256:${'a'.repeat(64)}` }, count: ids.length, members: ids.map(id => ({ id, revision: 'revision-a' })) }
}

async function trialSurface(own, navigation = { route: 'harbor.job', stage: 'judge' }) {
  const workbench = harness('Workbench', { job: 'job-a', workspace: 'workspace-a', jobs: [], pageSessionId: 'page-navigation', navigationRevision: 1, navigation: action('trials', navigation), close() {} })
  own(workbench)
  await settle(workbench)
  const explorer = harness('TrialExplorer', workbench.component('TrialExplorer').props)
  own(explorer)
  await settle(explorer)
  return { workbench, explorer, bridge: workbench.bridge }
}

test('a list without an open Trial publishes status, validity and sort but never search text', async t => {
  let selectionRequests = 0
  const own = environment(t, async url => { if (url.includes('selection')) selectionRequests++; return success({ job: 'job-a', artifacts: {} }) })
  const { explorer, bridge } = await trialSurface(own)
  const controls = explorer.render().filter(node => node.type === 'select')
  controls[0].props.onChange({ target: { value: 'infrastructure-error' } })
  controls[1].props.onChange({ target: { value: 'false' } })
  controls[2].props.onChange({ target: { value: 'errors' } })
  explorer.render().find(node => node.type === 'input' && node.props.placeholder === 'search').props.onChange({ target: { value: 'private search text' } })
  await settle(explorer)
  const prepared = await bridge.prepareCurrentContext('session-navigation')
  assert.equal(prepared.object.trial, undefined)
  assert.deepEqual(prepared.viewState, { filters: { status: 'infrastructure-error', validity: 'false' }, sort: 'errors' })
  assert.doesNotMatch(JSON.stringify(prepared), /private search text/)
  assert.equal(selectionRequests, 0)
})

test('selecting the current page freezes exact IDs at send and outranks an open Trial', async t => {
  let finishSelection
  const requests = []
  const selected = trialSet(['trial-a', 'trial-b'])
  const own = environment(t, async (url, options) => {
    if (options.method === 'POST') {
      requests.push({ body: JSON.parse(options.body), signal: options.signal })
      return new Promise(resolve => { finishSelection = resolve })
    }
    if (url.includes('/selection-detail')) return success(selected)
    return success({ job: 'job-a', trial: 'old-trial', artifacts: {} })
  })
  const { explorer, bridge } = await trialSurface(own, { route: 'harbor.trial.detail', stage: 'judge', trial: 'old-trial' })
  const bar = harness('TrialSelectionBar', { ...explorer.component('TrialSelectionBar').props, page: { total: 2, items: [{ id: 'trial-a' }, { id: 'trial-b' }] } })
  own(bar)
  bar.render().find(node => node.type === 'button' && node.props.children === 'allVisible').props.onClick()
  await settle(explorer)
  assert.deepEqual(explorer.component('TrialSelectionBar').props.checked, ['trial-a', 'trial-b'])
  const before = bridge.getSnapshot('session-navigation').current
  const controller = new AbortController()
  const pending = bridge.prepareCurrentContext('session-navigation', { signal: controller.signal })
  assert.deepEqual(requests[0].body, { sessionId: 'session-navigation', workspace: 'workspace-a', job: 'job-a', mode: 'explicit', trialIds: ['trial-a', 'trial-b'], filters: {} })
  assert.equal(requests[0].signal, controller.signal)
  explorer.component('TrialSelectionBar').props.setChecked(['trial-c'])
  await settle(explorer)
  bridge.setCurrent('session-navigation', { ...before, pageSessionId: 'page-other', workspace: 'workspace-other', object: { kind: 'job', id: 'job-other', job: 'job-other' } })
  const afterNavigation = bridge.getSnapshot('session-navigation').current
  finishSelection(success(selected))
  const prepared = await pending
  assert.equal(prepared.workspace, 'workspace-a')
  assert.equal(prepared.object.trial, undefined)
  assert.deepEqual(prepared.selection, [selected.ref])
  assert.doesNotThrow(() => normalizeHarborUiContext(prepared, 'session-navigation'))
  assert.equal(bridge.getSnapshot('session-navigation').current, afterNavigation)
  assert.equal(bridge.getSnapshot('session-navigation').explicit, undefined)
})

test('checkbox edits preserve a fixed explicit membership and never rerun the search query', async t => {
  const requests = []
  let selected
  const own = environment(t, async (url, options) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body)
      requests.push(body)
      selected = trialSet(body.trialIds)
      return success(selected)
    }
    if (url.includes('/selection-detail')) return success(selected)
    return success({ job: 'job-a', artifacts: {} })
  })
  const { explorer, bridge } = await trialSurface(own)
  explorer.render().find(node => node.type === 'input' && node.props.placeholder === 'search').props.onChange({ target: { value: 'private search' } })
  await settle(explorer)
  explorer.component('TrialSelectionBar').props.setChecked(['trial-a', 'trial-b'])
  await settle(explorer)
  explorer.component('TrialSelectionBar').props.setChecked(ids => ids.filter(id => id !== 'trial-a'))
  await settle(explorer)
  const prepared = await bridge.prepareCurrentContext('session-navigation')
  assert.deepEqual(requests[0].trialIds, ['trial-b'])
  assert.equal(requests[0].mode, 'explicit')
  assert.deepEqual(requests[0].filters, {})
  assert.equal(prepared.selection[0].selectionCount, 1)
  assert.doesNotMatch(JSON.stringify([requests, prepared]), /private search/)
})

test('a cancelled or mismatched set never falls back to the whole Job or mutates current state', async t => {
  let finishSelection
  let reads = 0
  let selected = trialSet(['wrong-trial'])
  const own = environment(t, async (url, options) => {
    if (options.method === 'POST') return new Promise(resolve => { finishSelection = resolve })
    if (url.includes('/selection-detail')) { reads++; return success(selected) }
    return success({ job: 'job-a', artifacts: {} })
  })
  const { explorer, bridge } = await trialSurface(own)
  explorer.component('TrialSelectionBar').props.setChecked(['trial-a'])
  await settle(explorer)
  const before = bridge.getSnapshot('session-navigation').current
  const mismatch = bridge.prepareCurrentContext('session-navigation')
  finishSelection(success(selected))
  await assert.rejects(mismatch, error => error.code === 'HARBOR_SELECTION_INVALID')
  assert.equal(bridge.getSnapshot('session-navigation').current, before)
  const controller = new AbortController()
  const cancelled = bridge.prepareCurrentContext('session-navigation', { signal: controller.signal })
  controller.abort(new Error('stopped'))
  selected = trialSet(['trial-a'])
  finishSelection(success(selected))
  await assert.rejects(cancelled, /stopped/)
  assert.equal(reads, 1, 'cancellation stops before reading membership')
  assert.equal(bridge.getSnapshot('session-navigation').current, before)
})

test('selection readers are scoped to a Session/page and an old disposer cannot remove a replacement', async t => {
  let requests = 0
  const selected = trialSet(['trial-b'])
  const own = environment(t, async (url, options) => {
    if (options.method === 'POST' || url.includes('/selection-detail')) { requests++; return success(selected) }
    return success({ job: 'job-a', artifacts: {} })
  })
  const { bridge } = await trialSurface(own)
  const context = bridge.getSnapshot('session-navigation').current
  const old = bridge.registerCurrentSelection('session-navigation', 'page-navigation', () => ({ context, trialIds: ['trial-a'] }))
  const current = bridge.registerCurrentSelection('session-navigation', 'page-navigation', () => ({ context, trialIds: ['trial-b'] }))
  old()
  assert.deepEqual((await bridge.prepareCurrentContext('session-navigation')).selection, [selected.ref])
  current()
  assert.deepEqual(await bridge.prepareCurrentContext('session-navigation'), context)
  bridge.setCurrent('other-session', context)
  assert.equal((await bridge.prepareCurrentContext('other-session')).sessionId, 'other-session')
  bridge.clearCurrent('session-navigation', 'page-navigation')
  await assert.rejects(bridge.prepareCurrentContext('session-navigation'), error => error.code === 'HARBOR_CONTEXT_NOT_READY')
  assert.equal(requests, 2)
})

test('filter changes cannot send the previous checkbox scope before it clears', async t => {
  let requests = 0
  const own = environment(t, async (url, options) => { if (options.method === 'POST') requests++; return success({ job: 'job-a', artifacts: {} }) })
  const { explorer, bridge } = await trialSurface(own)
  explorer.component('TrialSelectionBar').props.setChecked(['trial-a'])
  await settle(explorer)
  const bar = harness('TrialSelectionBar', explorer.component('TrialSelectionBar').props)
  own(bar)
  bar.render()
  explorer.render().filter(node => node.type === 'select')[0].props.onChange({ target: { value: 'infrastructure-error' } })
  await settle(explorer)
  await assert.rejects(bridge.prepareCurrentContext('session-navigation'), error => error.code === 'HARBOR_SELECTION_CHANGED')
  bar.setProps(explorer.component('TrialSelectionBar').props)
  bar.render()
  await settle(explorer)
  assert.deepEqual(explorer.component('TrialSelectionBar').props.checked, [])
  const prepared = await bridge.prepareCurrentContext('session-navigation')
  assert.deepEqual(prepared.viewState.filters, { status: 'infrastructure-error' })
  assert.equal(prepared.selection, undefined)
  const controller = new AbortController()
  controller.abort(new Error('already stopped'))
  await assert.rejects(bridge.prepareCurrentContext('session-navigation', { signal: controller.signal }), /already stopped/)
  assert.equal(requests, 0)
  explorer.dispose()
  assert.equal(bridge.currentSelections.size, 0)
})
