import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import React from 'react'
import { build } from 'esbuild'

const source = await readFile(new URL('../src/client/index.jsx', import.meta.url), 'utf8')
const compiled = await build({
  stdin: { contents: `${source}\nmodule.exports.__GovernancePanel = GovernancePanel;`, resolveDir: fileURLToPath(new URL('../src/client/', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, format: 'cjs', platform: 'browser', external: ['react'],
  define: { __HSE_VERSION__: '"test"' }, logOverride: { 'commonjs-variable-in-esm': 'silent' },
})
const tick = () => new Promise(resolve => setImmediate(resolve))
const success = value => ({ ok: true, status: 200, json: async () => ({ ok: true, value }) })
const receipt = version => ({ stack: { id: 'stack-a', version, path: '.harbor/evaluation-stack.yml' }, evaluator: { evaluator_id: 'evaluator-a', version, digest: `sha256:${'a'.repeat(64)}`, descriptor_path: `stack/${version}/evaluator.json` }, continuation: { verification: 'VERIFIED', durable: true, recovered: true }, requires_fresh_baseline: true, automatic_evaluation: false, automatic_gate: false })

function harness(initialProps = {}) {
  const slots = []
  const effects = new Map()
  const pendingEffects = []
  let cursor = 0
  let sessionId = 'session-a'
  let props = { workspace: 'workspace-a', job: 'historical-job', contextFor: selection => ({ job: 'historical-job', ...selection }), askContext: async () => true, t: key => key, ...initialProps }
  const same = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  const memo = (factory, dependencies) => { const index = cursor++; if (!slots[index] || !same(slots[index].dependencies, dependencies)) slots[index] = { dependencies, value: factory() }; return slots[index].value }
  const hooks = {
    ...React, useContext: () => sessionId,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }] },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] },
    useCallback: (callback, dependencies) => memo(() => callback, dependencies), useMemo: memo,
    useEffect(callback, dependencies) { const index = cursor++; const previous = effects.get(index); if (!previous || !same(previous.dependencies, dependencies)) pendingEffects.push(() => { previous?.cleanup?.(); effects.set(index, { dependencies, cleanup: callback() }) }) },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(name => { assert.equal(name, 'react'); return hooks }, module, module.exports)
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)]
  const render = () => { cursor = 0; const tree = module.exports.__GovernancePanel(props); for (const effect of pendingEffects.splice(0)) effect(); return flatten(tree) }
  return {
    render, component: name => render().find(node => typeof node.type === 'function' && node.type.name === name),
    setProps(next) { props = { ...props, ...next }; render() }, setSession(next) { sessionId = next; render() },
    dispose() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear() },
  }
}

test('fresh Governance mounts restore saved-version continuation after section navigation and a full refresh', async t => {
  const previous = globalThis.fetch
  const recovered = receipt('1.0.1')
  let reads = 0
  globalThis.fetch = async (url, options) => { reads++; assert.equal(options.method, undefined); assert.match(url, /sessionId=session-a/); return success({ components: { evaluator: { version: '1.0.0' } }, savedEvaluatorVersion: recovered }) }
  t.after(() => { globalThis.fetch = previous })
  for (const reason of ['initial mount', 'section navigation', 'full refresh']) {
    const ui = harness()
    ui.render(); await tick()
    const next = ui.component('SavedEvaluatorNextSteps')
    assert.ok(next, reason)
    assert.equal(next.props.receipt, recovered)
    assert.equal(next.props.historicalJob, 'historical-job')
    ui.dispose()
  }
  assert.equal(reads, 3)
})

test('same workspace and Job in a different Session cannot inherit the visible saved receipt', async t => {
  const previous = globalThis.fetch
  globalThis.fetch = async url => success({ components: {}, ...(url.includes('sessionId=session-a') ? { savedEvaluatorVersion: receipt('1.0.1') } : {}) })
  t.after(() => { globalThis.fetch = previous })
  const ui = harness(); t.after(() => ui.dispose())
  ui.render(); await tick()
  assert.ok(ui.component('SavedEvaluatorNextSteps'))
  ui.setSession('session-b')
  assert.equal(ui.component('SavedEvaluatorNextSteps'), undefined)
  await tick()
  assert.equal(ui.component('SavedEvaluatorNextSteps'), undefined)
})

test('late recovery from another Job cannot overwrite the currently visible continuation', async t => {
  const previous = globalThis.fetch
  let resolveOld
  const current = receipt('2.0.1')
  globalThis.fetch = url => url.includes('job=historical-job') ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve(success({ components: {}, savedEvaluatorVersion: current }))
  t.after(() => { globalThis.fetch = previous })
  const ui = harness(); t.after(() => ui.dispose())
  ui.render()
  ui.setProps({ job: 'new-source-job' }); await tick()
  assert.equal(ui.component('SavedEvaluatorNextSteps').props.receipt, current)
  resolveOld(success({ components: {}, savedEvaluatorVersion: receipt('1.0.1') })); await tick()
  assert.equal(ui.component('SavedEvaluatorNextSteps').props.receipt, current)
  assert.equal(ui.component('SavedEvaluatorNextSteps').props.historicalJob, 'new-source-job')
})

test('corrupt or inaccessible recovery reports a retryable warning instead of pretending no save exists', async t => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => success({ components: {}, savedEvaluatorRecovery: { status: 'UNAVAILABLE' } })
  t.after(() => { globalThis.fetch = previous })
  const ui = harness(); t.after(() => ui.dispose())
  ui.render(); await tick()
  assert.ok(ui.render().some(node => node.props.children === 'savedVersionRecoveryUnavailable'))
  assert.equal(ui.component('SavedEvaluatorNextSteps'), undefined)
})

test('an unavailable history recheck revokes an earlier verified receipt until recovery succeeds', async t => {
  const previous = globalThis.fetch
  const recovered = receipt('1.0.1')
  let available = true
  globalThis.fetch = async () => success({ components: {}, ...(available
    ? { savedEvaluatorVersion: recovered }
    : { savedEvaluatorRecovery: { status: 'UNAVAILABLE' } }) })
  t.after(() => { globalThis.fetch = previous })
  const ui = harness(); t.after(() => ui.dispose())
  ui.render(); await tick()
  assert.equal(ui.component('SavedEvaluatorNextSteps').props.receipt, recovered)

  available = false
  await ui.component('EvaluatorEditor').props.reload()
  const unverified = ui.component('SavedEvaluatorNextSteps').props.receipt
  assert.equal(unverified.evaluator.version, '1.0.1', 'retain the successful save identity, not an invitation to save again')
  assert.equal(unverified.continuation.verification, 'UNAVAILABLE', 'source display and planning must no longer trust the old verification')
  assert.equal(recovered.continuation.verification, 'VERIFIED', 'do not mutate the original receipt')
  assert.ok(ui.render().some(node => node.props.children === 'savedVersionRecoveryUnavailable'))

  available = true
  await ui.component('EvaluatorEditor').props.reload()
  assert.equal(ui.component('SavedEvaluatorNextSteps').props.receipt, recovered)
  assert.equal(ui.render().some(node => node.props.children === 'savedVersionRecoveryUnavailable'), false)
})
