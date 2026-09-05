import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import React from 'react'
import { build } from 'esbuild'

// Compile the actual entry point in memory. Test-only exports do not alter the
// shipped module or depend on a previously generated client bundle.
const source = await readFile(new URL('../src/client/index.jsx', import.meta.url), 'utf8')
const compiled = await build({
  stdin: { contents: `${source}\nmodule.exports.__usability = { GovernancePanel, TrialSelectionBar, TrialExplorer };`, resolveDir: fileURLToPath(new URL('../src/client/', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, format: 'cjs', platform: 'browser', external: ['react'],
  define: { __HSE_VERSION__: '"test"' }, logOverride: { 'commonjs-variable-in-esm': 'silent' },
})
const tick = () => new Promise(resolve => setImmediate(resolve))
const success = value => ({ ok: true, status: 200, json: async () => ({ ok: true, value }) })

function harness(componentName, initialProps) {
  const slots = []
  const effects = new Map()
  const pendingEffects = []
  let cursor = 0
  let props = initialProps
  if (componentName === 'TrialSelectionBar') {
    const publishChecked = props.setChecked
    props = { ...props, setChecked(next) {
      props = { ...props, checked: typeof next === 'function' ? next(props.checked) : next }
      publishChecked?.(props.checked)
    } }
  }
  const same = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  const memo = (factory, dependencies) => {
    const index = cursor++
    if (!slots[index] || !same(slots[index].dependencies, dependencies)) slots[index] = { dependencies, value: factory() }
    return slots[index].value
  }
  const hooks = {
    ...React,
    useContext: () => 'session-usability',
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
  const component = module.exports.__usability[componentName]
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)]
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''
  const render = () => {
    cursor = 0
    const tree = component({ t: key => key, ...props })
    for (const effect of pendingEffects.splice(0)) effect()
    return flatten(tree)
  }
  return {
    render,
    setProps(next) { props = { ...props, ...next }; render() },
    component(name) { return render().find(node => typeof node.type === 'function' && node.type.name === name) },
    async click(label) { const button = render().find(node => node.type === 'button' && text(node.props.children).startsWith(label)); assert.ok(button, `Missing button ${label}`); assert.equal(Boolean(button.props.disabled), false); button.props.onClick(); await tick() },
    dispose() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear() },
  }
}

test('successful save receipt survives governance loading and failure, and its plan retains the historical Job', async t => {
  const previousFetch = globalThis.fetch
  let failRead
  let reads = 0
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, undefined)
    assert.match(url, /\/governance\?/)
    assert.match(url, /sessionId=session-usability/)
    if (++reads === 1) return success({ components: {}, interactionObjects: [], evaluatorInterface: {} })
    return new Promise((resolve, reject) => { failRead = reject })
  }
  t.after(() => { globalThis.fetch = previousFetch })
  const questions = []
  const ui = harness('GovernancePanel', {
    workspace: 'workspace-a', job: 'historical-job', contextFor: selection => ({ job: 'historical-job', ...selection }),
    askContext: async (context, prompt) => { questions.push({ context, prompt }); return true },
  })
  t.after(() => ui.dispose())
  ui.render(); await tick()
  const editor = ui.component('EvaluatorEditor')
  assert.ok(editor)
  const receipt = { evaluator: { evaluator_id: 'evaluator-a', version: '2.0.0' }, stack: { id: 'stack-a', version: '2.0.0' } }
  editor.props.onSaved(receipt)
  const loading = editor.props.reload()
  const whileLoading = ui.component('SavedEvaluatorNextSteps')
  assert.equal(whileLoading.props.receipt, receipt)
  assert.equal(whileLoading.props.historicalJob, 'historical-job')
  assert.ok(ui.component('HarborSkeleton'))
  failRead(new Error('temporarily unavailable'))
  await loading
  const afterFailure = ui.component('SavedEvaluatorNextSteps')
  assert.equal(afterFailure.props.receipt, receipt)
  assert.ok(ui.component('HarborErrorState'))
  assert.equal(await afterFailure.props.onPreparePlan('Verify the saved version before planning'), true)
  assert.deepEqual(questions, [{ context: { job: 'historical-job' }, prompt: 'Verify the saved version before planning' }])
  ui.setProps({ workspace: 'workspace-other', job: 'other-job' })
  assert.equal(ui.component('SavedEvaluatorNextSteps'), undefined, 'a saved receipt must not leak into another Job or workspace')
})

function selectionFixture(ids = Array.from({ length: 12 }, (_, index) => `trial-${index + 1}`), id = 'selection-a', mode = 'query-snapshot') {
  const ref = { kind: 'trial-set', id, job: 'job-a', stage: 'judge', selectionCount: ids.length, sourceDigest: 'source-digest' }
  return { count: ids.length, mode, filterDigest: 'filter-digest', expiresAt: new Date(Date.now() + 60_000).toISOString(), ref, members: ids.map(id => ({ id, revision: 'trial-revision' })) }
}

for (const changed of ['checked', 'filters']) test(`changing ${changed} removes the old page snapshot without touching the prepared Composer reference`, async t => {
  const previousFetch = globalThis.fetch
  const requests = []
  const snapshot = selectionFixture()
  globalThis.fetch = async (url, options) => { requests.push({ url, body: options.body ? JSON.parse(options.body) : undefined }); return success(snapshot) }
  t.after(() => { globalThis.fetch = previousFetch })
  const contexts = []
  let composer
  let askCount = 0
  const ui = harness('TrialSelectionBar', {
    workspace: 'workspace-a', job: 'job-a', checked: ['trial-1'], filters: { status: 'candidate-quality-failed' }, page: { total: 12, items: [] }, setChecked() {},
    contextFor: selection => ({ object: { kind: 'job', job: 'job-a' }, selection: selection.selections ?? [] }),
    setContext: context => contexts.push(context),
    askContext: async (context, prompt) => { askCount++; composer = { context, prompt }; return true },
  })
  t.after(() => ui.dispose())
  ui.render()
  assert.equal(contexts.length, 0, 'mounting without a frozen snapshot must not clear unrelated page context')
  await ui.click('selectFiltered')
  assert.deepEqual(contexts.at(-1).selection, [snapshot.ref])
  await ui.click('askSelected')
  const prepared = composer
  const preparedBytes = JSON.stringify(prepared)
  ui.setProps(changed === 'checked' ? { checked: ['trial-2'] } : { filters: { status: 'infrastructure-error' } })
  assert.deepEqual(contexts.at(-1).selection, [])
  assert.equal(composer, prepared)
  assert.equal(JSON.stringify(composer), preparedBytes)
  assert.equal(askCount, 1)
  assert.equal(requests.length, 2, 'changing selection is local; only initial snapshot creation and exact membership verification request the Host')
  assert.equal(requests[0].body.mode, 'query-snapshot')
})

test('actual Trial row events keep query-snapshot checkboxes and count in sync, exclude one, and ask about exactly eleven', async t => {
  const previousFetch = globalThis.fetch
  const previousWindow = globalThis.window
  globalThis.window = { setTimeout: callback => setTimeout(callback, 0), clearTimeout }
  const trials = Array.from({ length: 12 }, (_, index) => ({ id: `trial-${index + 1}`, datasetOrder: index, status: 'completed', attempt: 1 }))
  const snapshots = new Map()
  const mutations = []
  const questions = []
  const contexts = []
  globalThis.fetch = async (url, options) => {
    if (url.includes('/trials?')) return success({ items: trials, total: trials.length, hasMore: false })
    if (options.method === 'POST') {
      const body = JSON.parse(options.body)
      mutations.push(body)
      const ids = body.mode === 'explicit' ? body.trialIds : trials.map(trial => trial.id)
      const snapshot = selectionFixture(ids, `selection-${mutations.length}`, body.mode)
      snapshots.set(snapshot.ref.id, snapshot)
      return success(snapshot)
    }
    assert.match(url, /selection-detail\?/)
    return success(snapshots.get(new URL(url, 'http://local.test').searchParams.get('id')))
  }
  const explorer = harness('TrialExplorer', {
    workspace: 'workspace-a', job: 'job-a', active: false,
    contextFor: selection => ({ selection: selection.selections ?? [] }), setContext: context => contexts.push(context),
    askContext: async (context, prompt) => { questions.push({ context, prompt }); return true },
  })
  t.after(() => { explorer.dispose(); globalThis.fetch = previousFetch; globalThis.window = previousWindow })
  explorer.render()
  await new Promise(resolve => setTimeout(resolve, 10))
  const selection = harness('TrialSelectionBar', explorer.component('TrialSelectionBar').props)
  t.after(() => selection.dispose())
  const sync = () => selection.setProps(explorer.component('TrialSelectionBar').props)
  const checkboxes = () => explorer.render().filter(node => node.type === 'input' && node.props.type === 'checkbox')
  assert.equal(checkboxes().length, 12)
  assert.equal(checkboxes().filter(node => node.props.checked).length, 0)
  await selection.click('selectFiltered')
  sync()
  assert.equal(checkboxes().filter(node => node.props.checked).length, 12)
  assert.match(String(selection.render().find(node => node.type === 'strong').props.children), /12/)
  checkboxes()[0].props.onChange({ target: { checked: false } })
  sync()
  assert.equal(checkboxes().filter(node => node.props.checked).length, 11)
  assert.match(String(selection.render().find(node => node.type === 'strong').props.children), /11/)
  assert.deepEqual(contexts.at(-1).selection, [])
  await selection.click('askSelected')
  sync()
  assert.equal(mutations.length, 2)
  assert.equal(mutations[1].mode, 'explicit')
  assert.deepEqual(mutations[1].trialIds, trials.slice(1).map(trial => trial.id))
  assert.equal(questions.length, 1)
  assert.equal(questions[0].context.selection[0].selectionCount, 11)
  assert.equal(questions[0].context.selection[0].id, 'selection-2')
  assert.equal(checkboxes()[0].props.checked, false)
})

test('late membership verification cannot replace checkbox edits or bind a stale query scope', async t => {
  const previousFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = previousFetch })
  for (const changed of ['checked', 'filters', 'workspace', 'job']) {
    let finishMembership
    const snapshot = selectionFixture()
    globalThis.fetch = async (url, options) => options.method === 'POST' ? success(snapshot) : new Promise(resolve => { finishMembership = resolve })
    const contexts = []
    const ui = harness('TrialSelectionBar', {
      workspace: 'workspace-a', job: 'job-a', checked: [], setChecked() {}, filters: {}, page: { total: 12 },
      contextFor: selection => ({ selection: selection.selections ?? [] }), setContext: context => contexts.push(context), askContext() { assert.fail('Selecting never calls the model') },
    })
    ui.render()
    await ui.click('selectFiltered')
    ui.setProps(changed === 'checked' ? { checked: ['trial-local'] } : changed === 'filters' ? { filters: { query: 'different' } } : { [changed]: 'different-owner' })
    finishMembership(success(snapshot))
    await tick()
    assert.equal(contexts.length, 0)
    assert.equal(ui.render().some(node => node.type === 'details'), false)
    ui.dispose()
  }
})

test('pagination and sorting preserve frozen membership; a new matching row stays unchecked and changed filters clear it', async t => {
  const previousFetch = globalThis.fetch
  const snapshot = selectionFixture()
  let reads = 0
  globalThis.fetch = async () => { reads++; return success(snapshot) }
  t.after(() => { globalThis.fetch = previousFetch })
  const selected = []
  const ui = harness('TrialSelectionBar', {
    workspace: 'workspace-a', job: 'job-a', checked: [], setChecked: ids => selected.push(ids), filters: {}, page: { total: 12 },
    contextFor: selection => ({ selection: selection.selections ?? [] }), setContext() {}, askContext() {},
  })
  t.after(() => ui.dispose())
  ui.render()
  await ui.click('selectFiltered')
  ui.setProps({ filters: { sort: 'lowest-score' }, page: { total: 13, items: [{ id: 'new-trial' }] } })
  assert.equal(selected.at(-1).length, 12)
  assert.equal(selected.at(-1).includes('new-trial'), false)
  assert.equal(ui.render().some(node => node.type === 'details'), true)
  assert.equal(reads, 2)
  ui.setProps({ filters: { query: 'different' } })
  assert.deepEqual(selected.at(-1), [])
  assert.equal(ui.render().some(node => node.type === 'details'), false)
})

test('a restored selection binds its existing reference and editing it invalidates only the page snapshot', async t => {
  const previousFetch = globalThis.fetch
  const snapshot = selectionFixture(['trial-2', 'trial-3'], 'selection-restored')
  globalThis.fetch = () => assert.fail('Restoring a verified selection must not create a new snapshot')
  t.after(() => { globalThis.fetch = previousFetch })
  const contexts = []
  const questions = []
  const ids = snapshot.members.map(member => member.id)
  const ui = harness('TrialSelectionBar', {
    workspace: 'workspace-a', job: 'job-a', checked: [], setChecked() {}, filters: {}, page: { total: 12 },
    contextFor: selection => ({ selection: selection.selections ?? [] }), setContext: value => contexts.push(value), askContext: async context => { questions.push(context); return true },
  })
  t.after(() => ui.dispose())
  ui.render()
  ui.setProps({ checked: ids, restoredSelection: { checked: ids, scope: JSON.stringify(['workspace-a', 'job-a', '', '', '', 'session-usability']), value: snapshot } })
  assert.equal(ui.render().some(node => node.type === 'details'), true)
  await ui.click('askSelected')
  assert.deepEqual(questions[0].selection, [snapshot.ref])
  ui.setProps({ checked: ['trial-3'] })
  assert.deepEqual(contexts.at(-1).selection, [])
  assert.deepEqual(questions[0].selection, [snapshot.ref], 'an already prepared question remains immutable')
})

test('clear or unmount cancels pending membership ownership without sending an AI question', async t => {
  const previousFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = previousFetch })
  for (const action of ['clear', 'unmount']) {
    let finishMembership
    const snapshot = selectionFixture(['trial-1'], 'selection-pending', 'explicit')
    globalThis.fetch = async (url, options) => options.method === 'POST' ? success(snapshot) : new Promise(resolve => { finishMembership = resolve })
    const contexts = []
    const ui = harness('TrialSelectionBar', {
      workspace: 'workspace-a', job: 'job-a', checked: ['trial-1'], setChecked() {}, filters: {}, page: { total: 12 },
      contextFor: selection => ({ selection: selection.selections ?? [] }), setContext: value => contexts.push(value), askContext() { assert.fail('A stale membership response must not prepare a question') },
    })
    ui.render()
    await ui.click('askSelected')
    if (action === 'clear') await ui.click('clearSelection')
    else ui.dispose()
    const count = contexts.length
    finishMembership(success(snapshot))
    await tick()
    assert.equal(contexts.length, count)
    ui.dispose()
  }
})

test('a late selection response after checkbox changes cannot republish an old snapshot or prepare a question', async t => {
  const previousFetch = globalThis.fetch
  let resolve
  globalThis.fetch = () => new Promise(done => { resolve = done })
  t.after(() => { globalThis.fetch = previousFetch })
  const contexts = []
  const questions = []
  const ui = harness('TrialSelectionBar', {
    workspace: 'workspace-a', job: 'job-a', checked: ['trial-1'], filters: {}, page: { total: 12, items: [] }, setChecked() {},
    contextFor: selection => ({ selection: selection.selections ?? [] }), setContext: context => contexts.push(context),
    askContext: async (...args) => { questions.push(args); return true },
  })
  t.after(() => ui.dispose())
  ui.render()
  await ui.click('askSelected')
  ui.setProps({ checked: ['trial-2'] })
  resolve(success(selectionFixture()))
  await tick()
  assert.equal(contexts.length, 0)
  assert.equal(questions.length, 0)
})
