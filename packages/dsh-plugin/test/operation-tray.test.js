import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { build } from 'esbuild'
import { acceptOperationList, operationNeedsRecovery, operationResultTarget, pollOperationList } from '../src/client/operation-tray-state.js'

const id = 'hop_00000000-0000-4000-8000-000000000001'
const operation = (status = 'ACTIVE', sequence = 3, extra = {}) => ({
  schema: 'harbor-operation/v1', operationId: id, draftId: 'draft-a', sessionId: 'session-a', kind: 'diagnostic-evaluation',
  status, target: { workspace: 'workspace-a', job: 'source-job' }, createdAt: '2026-09-05T00:00:00Z',
  events: [{ status, sequence }], ...extra,
})
const tick = () => new Promise(resolve => setImmediate(resolve))

test('task list rejects foreign Sessions, duplicate identities and invalid operation envelopes', () => {
  const value = operation()
  assert.equal(acceptOperationList({ items: [value] }, 'session-a')[0].operationId, id)
  for (const items of [[{ ...value, sessionId: 'foreign' }], [value, value], [{ ...value, kind: 'deployment-handoff' }], [{ ...value, events: [] }]]) {
    assert.throws(() => acceptOperationList({ items }, 'session-a'))
  }
  assert.throws(() => acceptOperationList({}, 'session-a'))
})

test('task status does not regress while same-sequence live progress and verified evidence refresh', () => {
  const active = operation()
  const next = acceptOperationList({ items: [operation('ACTIVE', 3, { progress: { completed: 2, total: 12 } })] }, 'session-a', [active])[0]
  assert.equal(next.progress.completed, 2)
  const cancelled = operation('CANCELLED', 5)
  assert.equal(acceptOperationList({ items: [active] }, 'session-a', [cancelled])[0].status, 'CANCELLED')
  const interrupted = operation('INTERRUPTED', 4, { recoveryRequired: true })
  assert.equal(operationNeedsRecovery(interrupted), true)
  const released = acceptOperationList({ items: [{ ...interrupted, recovery: { released: true } }] }, 'session-a', [interrupted])[0]
  assert.equal(released.status, 'INTERRUPTED')
  assert.equal(operationNeedsRecovery(released), false)
})

test('partial result navigation requires a Host-verified Job; never trusts a jobName in failure text', () => {
  assert.equal(operationResultTarget(operation('FAILED', 4, { events: [{ sequence: 4, result: { jobName: 'diagnostic-a' } }] })), undefined)
  assert.equal(operationResultTarget(operation('FAILED', 4, { resultRef: { jobName: '../other', verified: true } })), undefined)
  assert.equal(operationResultTarget(operation('FAILED', 4, { resultRef: { jobName: 'diagnostic-a', verified: false } })), undefined)
  for (const status of ['ACTIVE', 'CANCELLED', 'FAILED', 'INTERRUPTED', 'COMPLETED']) {
    assert.deepEqual(operationResultTarget(operation(status, 4, { resultRef: { jobName: 'diagnostic-a', verified: true } })), { workspace: 'workspace-a', jobName: 'diagnostic-a', partial: status !== 'COMPLETED' })
  }
})

test('list polling survives transient failure, is sequential, and disposes late responses without writes', async () => {
  const timers = []
  const items = []
  const errors = []
  let reads = 0, signal, finish
  const dispose = pollOperationList({ sessionId: 'session-a', request: async (route, args, options) => {
    assert.equal(route, 'action-operations'); assert.deepEqual(args, { limit: 20 }); signal = options.signal
    if (++reads === 1) return { items: [operation()] }
    if (reads === 2) throw new Error('offline')
    return new Promise(resolve => { finish = resolve })
  }, getCurrent: () => items.at(-1)?.items, onList: value => items.push(value), onError: error => errors.push(error), schedule: (fn, delay) => { timers.push({ fn, delay }); return timers.length }, unschedule() {} })
  await tick(); assert.equal(timers[0].delay, 1500)
  await timers.shift().fn(); assert.equal(errors.length, 1); assert.equal(items.length, 1)
  const pending = timers.shift().fn(); await tick(); dispose()
  assert.equal(signal.aborted, true)
  finish({ items: [operation('COMPLETED', 4)] }); await pending
  assert.equal(items.length, 1)
})

const bundle = await build({ entryPoints: [new URL('../src/client/operation-tray.jsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
function harness(name, initialProps) {
  const values = [], effects = new Map(), queue = []
  let cursor = 0, props = initialProps
  const hooks = { ...React,
    useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial; return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next }] },
    useRef(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot] },
    useEffect(fn, deps) { const slot = cursor++, previous = effects.get(slot); if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps?.[index]))) queue.push(() => { previous?.dispose?.(); effects.set(slot, { deps, dispose: fn() }) }) },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(name => { assert.equal(name, 'react'); return hooks }, module, module.exports)
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : ''
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)]
  const label = key => module.exports.OPERATION_TRAY_MESSAGES.en[key] ?? key
  const render = () => { cursor = 0; const tree = module.exports[name]({ label, t: label, ...props }); for (const fn of queue.splice(0)) fn(); return flatten(tree) }
  const button = expected => { const found = render().find(node => node.type === 'button' && text(node) === expected); assert.ok(found, `Button missing: ${expected}`); return found }
  return { render, text, button,
    async click(expected) { const target = button(expected); assert.equal(Boolean(target.props.disabled), false); target.props.onClick(); await tick() },
    setProps(next) { props = { ...props, ...next } },
    dispose() { for (const effect of effects.values()) effect.dispose?.() },
  }
}

test('actual task item requires inspection then checkbox confirmation; release never cancels or reruns', async () => {
  const writes = [], reads = [], navigations = []
  const ui = harness('OperationItem', { operation: operation('FAILED', 4, { cleanupRequired: true, resultRef: { jobName: 'diagnostic-a', verified: true } }),
    request: async (route, args) => { reads.push({ route, args }); return { operationId: id, inspectionId: 'inspection-a', contentHash: 'hash-a', canRecover: true, process: { state: 'stopped' }, resources: { state: 'clean' } } },
    update: async (route, args) => { writes.push({ route, args }) }, onViewResult: (...args) => navigations.push(args),
  })
  try {
    ui.render(); assert.equal(writes.length, 0)
    await ui.click('View run / partial evidence'); assert.equal(navigations[0][1].jobName, 'diagnostic-a')
    await ui.click('Inspect run and resources'); assert.equal(reads[0].route, 'action-inspect'); assert.equal(writes.length, 0)
    assert.equal(ui.button('Confirm release of this diagnostic lock').props.disabled, true)
    ui.render().find(node => node.type === 'input').props.onChange({ target: { checked: true } })
    await ui.click('Confirm release of this diagnostic lock')
    assert.deepEqual(writes, [{ route: 'action-recover', args: { operationId: id, inspectionId: 'inspection-a', contentHash: 'hash-a', confirmed: true } }])
  } finally { ui.dispose() }
})

test('unknown resource checks, stale state and mismatched inspections cannot unlock', async () => {
  const ui = harness('OperationItem', { operation: operation('INTERRUPTED', 3),
    request: async () => ({ operationId: id, canRecover: false, process: { state: 'unknown' }, resources: { state: 'unknown' }, blockers: [{ message: 'Inspect the original host' }] }),
    update: async () => { throw new Error('Must not mutate') },
  })
  try {
    await ui.click('Inspect run and resources')
    assert.equal(ui.render().some(node => node.type === 'input'), false)
    assert.match(ui.text(ui.render()[0]), /Inspect the original host/)
    ui.setProps({ stale: true })
    assert.equal(ui.button('Inspect run and resources').props.disabled, true)
  } finally { ui.dispose() }
})

test('task list restores on mount without an AI draft and remains readable while collapsed; remount re-reads', async () => {
  let reads = 0
  const props = { sessionId: 'session-a', scopeKey: 'workspace-a', request: async route => { assert.equal(route, 'action-operations'); reads++; return { items: [operation('FAILED', 4)] } }, update: async () => { throw new Error('No mutation') } }
  const ui = harness('OperationTray', props)
  try {
    ui.render(); await tick()
    assert.match(ui.text(ui.render()[0]), /0 running.*1 records/)
    assert.equal(ui.render().some(node => typeof node.type === 'function' && node.type.name === 'OperationItem'), false)
    const toggle = ui.render().find(node => node.type === 'button' && node.props['aria-expanded'] === false)
    toggle.props.onClick()
    assert.equal(ui.render().some(node => typeof node.type === 'function' && node.type.name === 'OperationItem'), true)
  } finally { ui.dispose() }
  const restored = harness('OperationTray', props)
  try { restored.render(); await tick(); assert.equal(reads, 2); assert.match(restored.text(restored.render()[0]), /1 records/) } finally { restored.dispose() }
})
