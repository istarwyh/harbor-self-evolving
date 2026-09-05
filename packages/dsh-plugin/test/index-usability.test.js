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
  stdin: { contents: `${source}\nmodule.exports.__usability = { GovernancePanel, TrialSelectionBar };`, resolveDir: fileURLToPath(new URL('../src/client/', import.meta.url)), loader: 'jsx' },
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

function selectionFixture() {
  const ref = { kind: 'harbor.trial-set/v1', id: 'selection-a', selectionToken: 'selection-token', sourceDigest: 'source-digest' }
  return { count: 12, mode: 'query-snapshot', filterDigest: 'filter-digest', expiresAt: new Date(Date.now() + 60_000).toISOString(), ref }
}

for (const changed of ['checked', 'filters']) test(`changing ${changed} removes the old page snapshot without touching the prepared Composer reference`, async t => {
  const previousFetch = globalThis.fetch
  const requests = []
  const snapshot = selectionFixture()
  globalThis.fetch = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return success(snapshot) }
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
  assert.equal(requests.length, 1, 'changing selection is local and must not create another Host snapshot or model request')
  assert.equal(requests[0].body.mode, 'query-snapshot')
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
