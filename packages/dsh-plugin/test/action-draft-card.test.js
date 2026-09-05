import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { build } from 'esbuild'
import {
  actionDraftAuthorizationExpired, actionDraftCanConfirm, actionDraftComparison,
  actionDraftErrorCode, actionDraftExpiry, actionDraftNeedsReprepare,
  actionDraftDiagnosticPreview, actionDraftDiagnosticResult, actionDraftDiagnosticSummary, actionOperationActive,
  actionOperationSequence, actionOperationFailure, acceptActionOperation, pollActionOperation,
} from '../src/client/action-draft-state.js'

const now = Date.parse('2026-09-05T10:00:00Z')
const draft = { expiresAt: new Date(now + 60_000).toISOString() }
const preview = { status: 'READY_FOR_REVIEW', previewId: 'preview-a', contentHash: 'hash-a', baseRevision: 'revision-a', blocking: [], expiresAt: new Date(now + 120_000).toISOString() }

test('action authorization expiry is live, uses preview lifetime, and does not invalidate historical receipts', () => {
  assert.equal(actionDraftAuthorizationExpired(draft, {}, now), false)
  assert.equal(actionDraftAuthorizationExpired(draft, {}, now + 60_000), true)
  assert.equal(actionDraftAuthorizationExpired(draft, { preview }, now + 60_000), false)
  assert.equal(actionDraftAuthorizationExpired(draft, { preview }, now + 120_000), true)
  assert.equal(actionDraftAuthorizationExpired(draft, { operation: { status: 'COMPLETED' } }, now + 3600_000), false)
  assert.equal(actionDraftExpiry(draft, { operation: { status: 'FAILED' } }), undefined)
})

test('restart and revision errors request reprepare without erasing proposal text', () => {
  const original = { ...draft, proposal: { before: 'old rule', replacement: 'human-readable suggestion' } }
  const expired = { error: new Error('HARBOR_ACTION_EXPIRED: Draft or preview expired. Prepare a new one.') }
  assert.equal(actionDraftErrorCode(expired.error), 'HARBOR_ACTION_EXPIRED')
  assert.equal(actionDraftAuthorizationExpired(original, expired, now), true)
  assert.equal(actionDraftNeedsReprepare(original, expired, now), true)
  assert.equal(actionDraftNeedsReprepare(original, { error: { code: 'HARBOR_ACTION_REVISION_CONFLICT' } }, now), true)
  assert.equal(actionDraftNeedsReprepare(original, { preview: { blocking: [{ code: 'REVISION_CONFLICT' }] } }, now), true)
  assert.equal(actionDraftNeedsReprepare(original, { error: { code: 'HARBOR_NETWORK_ERROR' } }, now), false)
  assert.equal(original.proposal.replacement, 'human-readable suggestion')
})

test('confirmation is explicit, exact-preview-bound, fresh, and never available for recovered operations', () => {
  const state = { status: 'READY_FOR_REVIEW', preview }
  assert.equal(actionDraftCanConfirm(draft, state, true, now), true)
  assert.equal(actionDraftCanConfirm(draft, state, false, now), false)
  assert.equal(actionDraftCanConfirm(draft, state, true, now + 120_000), false)
  assert.equal(actionDraftCanConfirm(draft, { ...state, operation: { status: 'COMPLETED' } }, true, now), false)
  assert.equal(actionDraftCanConfirm(draft, { ...state, preview: { ...preview, blocking: [{ code: 'NO_RUNNER' }] } }, true, now), false)
  assert.equal(actionDraftCanConfirm(draft, { ...state, preview: { ...preview, blocking: undefined } }, true, now), false)
  assert.equal(actionDraftCanConfirm(draft, { ...state, preview: { ...preview, contentHash: '' } }, true, now), false)
  assert.equal(actionDraftCanConfirm(draft, { ...state, error: new Error('HARBOR_ACTION_EXPIRED: expired') }, true, now), false)
  assert.equal(actionDraftCanConfirm(draft, { ...state, status: 'EXECUTING' }, true, now), false)
})

test('comparison result exposes readable metrics and explicit unknowns instead of treating missing results as zero', () => {
  assert.equal(actionDraftComparison({ schema: 'harbor-change-draft/v1', applied: false }), undefined)
  const value = actionDraftComparison({ schema: 'harbor-readonly-comparison/v1', data: {
    comparable: false, baselineJob: 'baseline-a', candidateJob: 'candidate-b',
    metrics: { reward: { baseline: 0, candidate: 0.5, delta: 0.5 }, latency: { baseline: 30, candidate: 20, delta: -10, direction: 'minimize' }, missing: {} },
    comparabilityReasons: ['Evaluation Context differs', { code: 'FRESH_BASELINE', message: 'Establish a fresh baseline' }, null],
    improvedTrials: [], regressedTrials: [{ trial: 'trial-1' }],
  } })
  assert.equal(value.comparable, false)
  assert.deepEqual(value.metrics[0], { name: 'reward', baseline: 0, candidate: 0.5, delta: 0.5, direction: 'maximize' })
  assert.equal(value.metrics[1].direction, 'minimize')
  assert.equal(value.metrics[2].baseline, undefined)
  assert.equal(value.improved, 0)
  assert.equal(value.regressed, 1)
  assert.equal(value.invalid, undefined)
  assert.deepEqual(value.reasons, ['Evaluation Context differs', 'Establish a fresh baseline'])
})

// Exercise the actual JSX event handlers with a deterministic hook store. This
// is interaction wiring coverage, not a replacement for the real-browser run.
async function cardHarness(props, { effects = false } = {}) {
  const bundle = await build({ entryPoints: [new URL('../src/client/action-draft-card.jsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
  const values = []
  const effectValues = new Map()
  const pendingEffects = []
  const defaults = { request: async () => { throw new Error('HARBOR_ACTION_DENIED: no operation yet') } }
  let cursor = 0
  const hooks = {
    ...React,
    useState(initial) {
      const slot = cursor++
      if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial
      return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next }]
    },
    useRef(initial) {
      const slot = cursor++
      if (!(slot in values)) values[slot] = { current: initial }
      return values[slot]
    },
    useEffect(callback, dependencies) {
      const slot = cursor++
      if (!effects) return
      const previous = effectValues.get(slot)
      if (!previous || !dependencies || dependencies.some((value, index) => !Object.is(value, previous.dependencies?.[index]))) {
        pendingEffects.push(() => { previous?.cleanup?.(); effectValues.set(slot, { dependencies, cleanup: callback() }) })
      }
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(name => {
    assert.equal(name, 'react')
    return hooks
  }, module, module.exports)
  const { ActionDraftCardView, ACTION_CARD_MESSAGES } = module.exports
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)]
  const render = () => {
    cursor = 0
    const tree = ActionDraftCardView({ t: key => ACTION_CARD_MESSAGES.en[key] ?? key, ...defaults, ...props })
    for (const effect of pendingEffects.splice(0)) effect()
    return flatten(tree)
  }
  const button = text => {
    const found = render().find(node => node.type === 'button' && node.props.children === text)
    assert.ok(found, `Button not found: ${text}`)
    return found
  }
  const click = async text => {
    const node = button(text)
    assert.equal(Boolean(node.props.disabled), false, `Button disabled: ${text}`)
    node.props.onClick()
    await new Promise(resolve => setImmediate(resolve))
  }
  return { render, button, click, setProps(next) { props = { ...props, ...next }; render() }, dispose() { for (const effect of effectValues.values()) effect.cleanup?.(); effectValues.clear() } }
}

test('source suggestion opens direct review without mutation, confirmation or removing expired proposal', async () => {
  const original = { kind: 'evaluator-draft', draftId: 'old-draft', expiresAt: '2000-01-01T00:00:00Z', proposal: { before: 'old rule', replacement: 'new rule', sourceRef: { sourceRole: 'rubric', startLine: 3, endLine: 3 } } }
  const opened = []
  let mutations = 0
  const harness = await cardHarness({ draft: original, onSourceDraft: value => { opened.push(value) }, update: async () => { mutations++; throw new Error('Source review must not mutate') } })
  await harness.click('Review and edit')
  assert.equal(mutations, 0)
  assert.equal(opened[0], original)
  assert.equal(original.proposal.replacement, 'new rule')
  assert.equal(harness.render().some(node => node.type === 'input' && node.props.type === 'checkbox'), false)
  await harness.click('Collapse suggestion')
  await harness.click('Expand suggestion')
  assert.ok(harness.button('Review and edit'))
})

test('expired non-source suggestion only prepares a fresh question and never automatically sends or confirms', async () => {
  let preparations = 0
  let mutations = 0
  const harness = await cardHarness({ draft: { kind: 'candidate-draft', draftId: 'old-draft', expiresAt: '2000-01-01T00:00:00Z' }, onReprepare: async () => { preparations++ }, update: async () => { mutations++ } })
  await harness.click('Prepare with the latest object')
  assert.equal(preparations, 1)
  assert.equal(mutations, 0)
  assert.equal(harness.render().some(node => node.type === 'button' && node.props.children === 'Check and preview'), false)
})

test('non-source confirmation requires the exact checked preview and reports draft-only completion', async () => {
  const calls = []
  const freshPreview = { ...preview, expiresAt: new Date(Date.now() + 60_000).toISOString() }
  const harness = await cardHarness({
    draft: { kind: 'candidate-draft', draftId: 'draft-a', expiresAt: freshPreview.expiresAt },
    update: async (route, args) => {
      calls.push({ route, args })
      if (route === 'action-preview') return freshPreview
      return { status: 'COMPLETED', events: [{ result: { schema: 'harbor-change-draft/v1', applied: false, kind: 'candidate-draft' } }] }
    },
  })
  await harness.click('Check and preview')
  assert.equal(harness.button('Confirm and save suggestion').props.disabled, true)
  const checkbox = harness.render().find(node => node.type === 'input' && node.props.type === 'checkbox')
  checkbox.props.onChange({ target: { checked: true } })
  await harness.click('Confirm and save suggestion')
  assert.deepEqual(calls, [
    { route: 'action-preview', args: { draftId: 'draft-a' } },
    { route: 'action-confirm', args: { previewId: 'preview-a', contentHash: 'hash-a', expectedRevision: 'revision-a', confirmed: true } },
  ])
  assert.equal(harness.render().some(node => node.props.children === 'Suggestion saved, not applied'), true)
  assert.equal(harness.render().some(node => node.type === 'button' && node.props.children === 'Confirm and save suggestion'), false)
})

const diagnosticDraft = { kind: 'diagnostic-evaluation', draftId: 'draft-diagnostic', operationId: 'hop_diagnostic', expiresAt: new Date(Date.now() + 60_000).toISOString() }
const diagnosticPreview = {
  ...preview, execution: 'bounded-diagnostic', diagnosticOnly: true, trialCount: 12, estimatedExternalRequests: null, estimatedHostModelRequests: 96,
  expiresAt: diagnosticDraft.expiresAt,
  limits: { maxTrials: 12, concurrency: 2, wallTimeoutMs: 900_000, maxModelRequests: 96, maxResponseBytes: 1_048_576 },
}
const nextTick = () => new Promise(resolve => setImmediate(resolve))
const operation = (status, sequence = 1, result) => ({
  operationId: diagnosticDraft.operationId, draftId: diagnosticDraft.draftId, status,
  events: Array.from({ length: sequence }, (_, index) => ({ sequence: index + 1, status: index + 1 === sequence ? status : 'EXECUTING', ...(index + 1 === sequence && result ? { result } : {}) })),
})

test('bounded diagnostics require verified scope and real enforced limits before confirmation', () => {
  assert.deepEqual(actionDraftDiagnosticPreview(diagnosticPreview), { trialCount: 12, limits: diagnosticPreview.limits })
  const state = { status: 'READY_FOR_REVIEW', preview: diagnosticPreview }
  assert.equal(actionDraftCanConfirm(diagnosticDraft, state, true), true)
  for (const changed of [
    { diagnosticOnly: false }, { execution: undefined }, { trialCount: 13 }, { trialCount: 0 },
    { limits: { ...diagnosticPreview.limits, concurrency: 0 } },
    { limits: { ...diagnosticPreview.limits, maxResponseBytes: undefined, maxOutputTokens: 4096 } },
    { limits: { ...diagnosticPreview.limits, wallTimeoutMs: Infinity } },
    { limits: { ...diagnosticPreview.limits, maxModelRequests: -1 } },
  ]) assert.equal(actionDraftCanConfirm(diagnosticDraft, { ...state, preview: { ...diagnosticPreview, ...changed } }, true), false)
  const retryDraft = { ...diagnosticDraft, kind: 'retry-infrastructure' }
  assert.equal(actionDraftCanConfirm(retryDraft, state, true), true)
  assert.equal(actionDraftCanConfirm(retryDraft, { ...state, preview: { ...preview, expiresAt: diagnosticDraft.expiresAt } }, true), false)
})

test('operation identity and ordered event sequence cannot be replaced by unrelated or malformed receipts', () => {
  const current = operation('SCHEDULED')
  for (const incoming of [
    { ...operation('EXECUTING', 2), operationId: 'hop_other' },
    { ...operation('EXECUTING', 2), draftId: 'draft-other' },
    { ...operation('EXECUTING', 2), status: 'MAYBE_DONE' },
    { ...operation('EXECUTING', 2), events: [{ sequence: 2 }, { sequence: 1 }] },
    { ...operation('EXECUTING', 2), events: [] },
  ]) assert.throws(() => acceptActionOperation(diagnosticDraft, current, incoming), { code: 'HARBOR_ACTION_OPERATION_MISMATCH' })
  assert.equal(actionOperationSequence(operation('EXECUTING', 2)), 2)
})

test('late reads never regress a cancellation or completion, and interrupted recovery is never active', () => {
  const cancelling = operation('CANCELLING', 3)
  assert.equal(acceptActionOperation(diagnosticDraft, cancelling, operation('EXECUTING', 2)), cancelling)
  assert.equal(acceptActionOperation(diagnosticDraft, cancelling, operation('EXECUTING', 3)), cancelling)
  const cancelled = operation('CANCELLED', 4)
  assert.equal(acceptActionOperation(diagnosticDraft, cancelled, operation('EXECUTING', 5)), cancelled)
  assert.equal(actionOperationActive(operation('SCHEDULED')), true)
  assert.equal(actionOperationActive(cancelling), true)
  for (const status of ['COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED']) assert.equal(actionOperationActive(operation(status)), false)
  assert.equal(actionOperationActive({ ...operation('EXECUTING'), recoveryRequired: true }), false)
})

test('only a completed diagnostic receipt can produce navigation to a new Job', () => {
  const result = { jobName: 'diagnostic-a', diagnosticOnly: true, workspace: 'workspace-a' }
  assert.equal(actionDraftDiagnosticResult(operation('COMPLETED', 3, result)), result)
  for (const status of ['SCHEDULED', 'EXECUTING', 'CANCELLED', 'FAILED']) assert.equal(actionDraftDiagnosticResult(operation(status, 3, result)), undefined)
  assert.equal(actionDraftDiagnosticResult(operation('COMPLETED', 3, { ...result, jobName: '../old-job' })), undefined)
  assert.equal(actionDraftDiagnosticResult(operation('COMPLETED', 3, { ...result, diagnosticOnly: false })), undefined)
  assert.equal(actionOperationFailure(operation('FAILED', 3, { code: 'PROCESS_TIMEOUT', message: 'The process exceeded 900 seconds' })), 'PROCESS_TIMEOUT · The process exceeded 900 seconds')
})

test('polling reads one stable operation sequentially every 1.5 seconds and stops at its terminal receipt', async () => {
  const snapshots = [operation('SCHEDULED'), operation('EXECUTING', 2), operation('COMPLETED', 3, { diagnosticOnly: true, jobName: 'diagnostic-result' })]
  const timers = []
  const reads = []
  const accepted = []
  const dispose = pollActionOperation({
    draft: diagnosticDraft,
    request: async (route, args, options) => { reads.push({ route, args, signal: options.signal }); return snapshots.shift() },
    onOperation: value => accepted.push(value), onError: error => assert.fail(String(error)),
    schedule: (callback, delay) => { timers.push({ callback, delay }); return timers.length }, unschedule() {},
  })
  await nextTick()
  assert.equal(timers[0].delay, 1500)
  await timers.shift().callback()
  await timers.shift().callback()
  assert.equal(timers.length, 0)
  assert.deepEqual(accepted.map(value => value.status), ['SCHEDULED', 'EXECUTING', 'COMPLETED'])
  assert.equal(reads.length, 3)
  for (const read of reads) { assert.equal(read.route, 'action-operation'); assert.deepEqual(read.args, { operationId: diagnosticDraft.operationId }); assert.ok(read.signal instanceof AbortSignal) }
  dispose()
})

test('unknown status after acceptance is retried read-only, while restart recovery interrupts polling', async () => {
  const errors = []
  const timers = []
  let calls = 0
  const accepted = []
  const dispose = pollActionOperation({
    draft: diagnosticDraft, initialOperation: operation('EXECUTING'),
    request: async () => { if (++calls === 1) throw new Error('HARBOR_NETWORK_ERROR: unavailable'); return { ...operation('INTERRUPTED', 2), recoveryRequired: true } },
    onOperation: value => accepted.push(value), onError: error => errors.push(error),
    schedule: callback => { timers.push(callback); return timers.length }, unschedule() {},
  })
  await nextTick()
  assert.equal(errors.length, 1)
  await timers.shift()()
  assert.equal(accepted[0].status, 'INTERRUPTED')
  assert.equal(timers.length, 0)
  dispose()
})

test('poll disposal aborts the in-flight read and ignores its eventual stale response', async () => {
  let resolve
  let signal
  const accepted = []
  const pending = new Promise(done => { resolve = done })
  const dispose = pollActionOperation({ draft: diagnosticDraft, request: (route, args, options) => { signal = options.signal; return pending }, onOperation: value => accepted.push(value), onError: error => assert.fail(String(error)) })
  dispose()
  assert.equal(signal.aborted, true)
  resolve(operation('COMPLETED', 2))
  await nextTick()
  assert.equal(accepted.length, 0)
})

test('missing operation is safe only before acceptance; an accepted missing operation remains uncertain', async () => {
  let absent = 0
  let errors = 0
  const timers = []
  const options = { draft: diagnosticDraft, request: async () => { throw new Error('HARBOR_ACTION_DENIED: unavailable') }, onOperation: () => assert.fail('unexpected operation'), onError: () => errors++, onAbsent: () => absent++, schedule: callback => { timers.push(callback); return 1 }, unschedule() {} }
  const before = pollActionOperation(options)
  await nextTick()
  assert.equal(absent, 1)
  assert.equal(errors, 0)
  const after = pollActionOperation({ ...options, initialOperation: operation('EXECUTING') })
  await nextTick()
  assert.equal(absent, 1)
  assert.equal(errors, 1)
  assert.equal(timers.length, 1)
  before(); after()
})

test('a bounded preview shows actual scope, real byte/request limits, and no invented token or cost guarantee', async () => {
  const ui = await cardHarness({ draft: { ...diagnosticDraft, operationId: undefined }, update: async () => diagnosticPreview })
  await ui.click('Check and preview')
  const labels = ui.render().filter(node => node.type === 'dt').map(node => node.props.children)
  assert.ok(labels.includes('Actual task count'))
  assert.ok(labels.includes('Candidate Host model request limit'))
  assert.ok(labels.includes('Candidate Host response byte limit per request'))
  assert.equal(labels.includes('Output token limit'), false)
  assert.ok(ui.render().some(node => typeof node.props.children === 'string' && node.props.children.includes('No total external API count, token, or total cost cap is guaranteed')))
  assert.ok(ui.render().some(node => typeof node.props.children === 'string' && node.props.children.includes('Dataset verifiers or other business scripts are outside this budget')))
  assert.equal(ui.render().some(node => node.props.children === 'No external model or evaluation requests.'), false)
  assert.equal(ui.button('Confirm and start diagnostic').props.disabled, true)
})

test('rapid duplicate confirmation creates one request and accepted diagnostics are never called completed', async () => {
  let confirms = 0
  let resolve
  let currentOperation
  const pending = new Promise(done => { resolve = done })
  const ui = await cardHarness({
    draft: diagnosticDraft,
    request: async () => { if (currentOperation) return currentOperation; throw new Error('HARBOR_ACTION_DENIED: absent') },
    update: async route => { if (route === 'action-preview') return diagnosticPreview; confirms++; return pending },
  }, { effects: true })
  ui.render(); await nextTick()
  await ui.click('Check and preview')
  ui.render().find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } })
  const confirmButton = ui.button('Confirm and start diagnostic')
  assert.equal(confirmButton.props.disabled, false)
  confirmButton.props.onClick(); confirmButton.props.onClick()
  assert.equal(confirms, 1)
  currentOperation = operation('SCHEDULED')
  resolve(currentOperation)
  await nextTick()
  assert.ok(ui.render().some(node => node.props.children === 'Accepted, waiting to start'))
  assert.equal(ui.render().some(node => node.props.children === 'Diagnostic finished; verify its summary' || node.props.children === 'Suggestion saved, not applied'), false)
  assert.equal(ui.render().some(node => node.type === 'button' && node.props.children === 'Confirm and start diagnostic'), false)
  await ui.click('Collapse suggestion')
  assert.ok(ui.render().some(node => node.props.children === 'Accepted, waiting to start'))
  ui.dispose()
})

test('cancellation remains pending until acknowledged, never auto-retries, and errors preserve the run', async () => {
  let currentOperation = operation('EXECUTING', 2)
  const calls = []
  const ui = await cardHarness({ draft: diagnosticDraft,
    request: async () => currentOperation,
    update: async (route, args) => { calls.push({ route, args }); currentOperation = operation('CANCELLING', 3); return currentOperation },
  }, { effects: true })
  ui.render(); await nextTick(); ui.render(); await nextTick()
  await ui.click('Stop diagnostic')
  assert.deepEqual(calls, [{ route: 'action-cancel', args: { operationId: diagnosticDraft.operationId } }])
  assert.equal(ui.button('Requesting stop').props.disabled, true)
  assert.equal(ui.render().some(node => node.props.children === 'Diagnostic cancelled'), false)
  assert.ok(ui.render().some(node => typeof node.props.children === 'string' && node.props.children.includes('Some tasks may still be running')))
  ui.dispose()

  const failed = await cardHarness({ draft: diagnosticDraft, request: async () => operation('EXECUTING', 2), update: async () => { throw new Error('offline') } }, { effects: true })
  failed.render(); await nextTick(); failed.render(); await nextTick()
  await failed.click('Stop diagnostic')
  assert.ok(failed.render().some(node => node.props.children === 'Diagnostic running'))
  assert.ok(failed.render().some(node => node.props.role === 'alert' && typeof node.props.children === 'string' && node.props.children.includes('Stopping was not acknowledged')))
  failed.dispose()
})

test('collapsed card recovers completion and opens its result only on an explicit click', async () => {
  let resolve
  let reads = 0
  const pending = new Promise(done => { resolve = done })
  const navigation = []
  const result = { diagnosticOnly: true, jobName: 'new-diagnostic', workspace: 'workspace-a' }
  const ui = await cardHarness({ draft: diagnosticDraft, request: () => { reads++; return pending }, onViewResult: value => navigation.push(value), update: () => assert.fail('Recovery must never mutate') }, { effects: true })
  ui.render()
  await ui.click('Collapse suggestion')
  resolve(operation('COMPLETED', 3, result))
  await nextTick()
  assert.equal(reads, 1)
  assert.ok(ui.render().some(node => node.props.children === 'Diagnostic finished; verify its summary'))
  assert.equal(navigation.length, 0)
  await ui.click('Expand suggestion')
  await ui.click('View diagnostic results')
  assert.deepEqual(navigation, [result])
  ui.dispose()
})

test('interrupted and timed-out operations preserve their reason and offer no silent restart', async () => {
  for (const snapshot of [
    { ...operation('INTERRUPTED', 3, { code: 'PROCESS_STATE_UNKNOWN', message: 'Verify running process' }), recoveryRequired: true },
    operation('FAILED', 3, { code: 'PROCESS_TIMEOUT', message: 'Exceeded the wall timeout' }),
  ]) {
    const ui = await cardHarness({ draft: diagnosticDraft, request: async () => snapshot, update: () => assert.fail('Must not retry') }, { effects: true })
    ui.render(); await nextTick()
    assert.equal(ui.render().some(node => node.type === 'button' && /Confirm and start|Check and preview|Stop diagnostic/.test(node.props.children)), false)
    assert.ok(ui.render().some(node => typeof node.props.children === 'string' && node.props.children.includes(snapshot.events.at(-1).result.code)))
    assert.equal(ui.render().some(node => node.props.children === 'Diagnostic cancelled'), false)
    ui.dispose()
  }
})

test('switching the rendered draft aborts old recovery and cannot attach the old operation to the new card', async () => {
  let resolve
  let firstSignal
  const pending = new Promise(done => { resolve = done })
  const ui = await cardHarness({ draft: diagnosticDraft, request: (route, args, options) => { firstSignal = options.signal; return pending } }, { effects: true })
  ui.render()
  ui.setProps({ draft: { ...diagnosticDraft, draftId: 'new-draft', operationId: undefined } })
  assert.equal(firstSignal.aborted, true)
  resolve(operation('COMPLETED', 3, { diagnosticOnly: true, jobName: 'wrong-job' }))
  await nextTick()
  assert.equal(ui.render().some(node => node.props.children === 'Diagnostic finished; verify its summary'), false)
  assert.equal(ui.render()[0].props['data-action-status'], 'DRAFT')
  ui.dispose()
})

test('a dropped confirmation response recovers the stable operation instead of confirming a second time', async () => {
  let running
  let confirmations = 0
  const ui = await cardHarness({
    draft: diagnosticDraft,
    request: async () => { if (running) return running; throw new Error('HARBOR_ACTION_DENIED: not started') },
    update: async route => {
      if (route === 'action-preview') return diagnosticPreview
      confirmations++
      running = operation('EXECUTING', 2)
      throw new Error('HARBOR_NETWORK_ERROR: response lost after acceptance')
    },
  }, { effects: true })
  ui.render(); await nextTick()
  await ui.click('Check and preview')
  ui.render().find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } })
  await ui.click('Confirm and start diagnostic')
  ui.render(); await nextTick()
  assert.equal(confirmations, 1)
  assert.ok(ui.render().some(node => node.props.children === 'Diagnostic running'))
  assert.equal(ui.render().some(node => node.type === 'button' && /Check and preview|Confirm and start/.test(node.props.children)), false)
  ui.dispose()
})

test('a recovered infrastructure retry remains a diagnostic operation even without its old preview', async () => {
  const result = { diagnosticOnly: true, jobName: 'retried-diagnostic' }
  const navigation = []
  const ui = await cardHarness({ draft: { ...diagnosticDraft, kind: 'retry-infrastructure' }, request: async () => operation('COMPLETED', 3, result), onViewResult: value => navigation.push(value) }, { effects: true })
  ui.render(); await nextTick()
  assert.ok(ui.render().some(node => node.props.children === 'Diagnostic finished; verify its summary'))
  assert.equal(ui.render().some(node => node.props.children === 'Suggestion saved, not applied'), false)
  assert.equal(navigation.length, 0)
  await ui.click('View diagnostic results')
  assert.deepEqual(navigation, [result])
  ui.dispose()
})

test('cancelled Host processes keep Docker cleanup and the held workspace lock explicit', async () => {
  for (const status of ['CANCELLED', 'FAILED']) {
    const current = { ...operation(status, 4, { code: 'HARBOR_PROCESS_CANCELLED', cleanupRequired: true }), cleanupRequired: true }
    const ui = await cardHarness({ draft: diagnosticDraft, request: async () => current }, { effects: true })
    ui.render(); await nextTick()
    assert.ok(ui.render().some(node => node.props.role === 'alert' && typeof node.props.children === 'string' && node.props.children.includes('Docker resource cleanup still requires verification')))
    assert.ok(ui.render().some(node => typeof node.props.children === 'string' && node.props.children.includes('workspace diagnostic lock remains held')))
    assert.equal(ui.render().some(node => node.type === 'button' && /Confirm and start|Stop diagnostic/.test(node.props.children)), false)
    ui.dispose()
  }
})

test('completed flow with infrastructure exceptions is not classified as a successful quality result', () => {
  const result = { diagnosticOnly: true, jobName: 'diagnostic-result', summary: { n_trials: 1, n_discovered_trials: 1, n_valid_scores: 0, n_invalid_scores: 1, n_exceptions: 1, artifact_validation: { valid: true } } }
  const value = actionDraftDiagnosticSummary(operation('COMPLETED', 4, result))
  assert.equal(value.status, 'exceptions')
  assert.equal(value.warning, true)
  assert.deepEqual(value.counts, { trials: 1, validScores: 0, invalidScores: 1, exceptions: 1, unscored: undefined, discovered: 1 })
  assert.equal(actionDraftDiagnosticResult(operation('COMPLETED', 4, result)), result, 'exceptional results remain inspectable')
  assert.equal(actionDraftDiagnosticSummary(operation('EXECUTING', 3, result)), undefined)
})

test('zero valid scores, partial validity, unknown counts, and invalid artifacts stay distinct', () => {
  const summary = { n_trials: 2, n_valid_scores: 0, n_invalid_scores: 0, n_exceptions: 0, n_unscored_trials: 2, artifact_validation: { valid: true } }
  const get = changes => actionDraftDiagnosticSummary(operation('COMPLETED', 3, { diagnosticOnly: true, summary: { ...summary, ...changes } }))
  assert.equal(get({}).status, 'no-valid-scores')
  assert.equal(get({ n_valid_scores: 1, n_unscored_trials: 1 }).status, 'partial')
  const complete = get({ n_valid_scores: 2, n_unscored_trials: 0 })
  assert.equal(complete.status, 'finished')
  assert.equal(complete.warning, false, 'finished means the process has complete valid-score coverage, never a quality pass')
  assert.equal(get({ n_valid_scores: '2', n_unscored_trials: 0 }).status, 'unverified')
  assert.equal(get({ n_valid_scores: 2, n_unscored_trials: 0, n_exceptions: -1 }).counts.exceptions, undefined)
  assert.equal(get({ n_valid_scores: 2, n_unscored_trials: 0, artifact_validation: { valid: false } }).status, 'unverified')
  assert.equal(get({ n_valid_scores: 3, n_unscored_trials: 0 }).status, 'unverified')
  const missing = actionDraftDiagnosticSummary(operation('COMPLETED', 3, { diagnosticOnly: true }))
  assert.equal(missing.status, 'unverified')
  assert.equal(missing.counts.validScores, undefined)
  assert.equal(missing.counts.exceptions, undefined)
})

test('exceptional completed diagnostics show real counts and warning even while collapsed, and still open the new Job', async () => {
  const result = { diagnosticOnly: true, jobName: 'diagnostic-exceptional', summary: { n_trials: 1, n_discovered_trials: 1, n_valid_scores: 0, n_invalid_scores: 1, n_exceptions: 1, artifact_validation: { valid: true } } }
  const navigation = []
  const ui = await cardHarness({ draft: diagnosticDraft, request: async () => operation('COMPLETED', 4, result), onViewResult: value => navigation.push(value) }, { effects: true })
  ui.render(); await nextTick()
  assert.ok(ui.render().some(node => node.props.children === 'Diagnostic finished with run exceptions'))
  const counts = ui.render().filter(node => node.type === 'dd').slice(0, 6).map(node => node.props.children)
  assert.deepEqual(counts, [1, 0, 1, 1, '—', 1])
  assert.ok(ui.render().some(node => node.props.role === 'alert' && node.props.children.includes('not zero quality scores')))
  assert.equal(ui.render().some(node => node.props.className === 'hse-valid'), false)
  await ui.click('Collapse suggestion')
  assert.ok(ui.render().some(node => node.props.children === 'Diagnostic finished with run exceptions'))
  await ui.click('Expand suggestion')
  assert.equal(navigation.length, 0)
  await ui.click('View diagnostic results')
  assert.deepEqual(navigation, [result])
  ui.dispose()
})

test('zero-score availability and omitted counts cannot produce the normal finished label', async () => {
  for (const [summary, expected] of [
    [{ n_trials: 1, n_valid_scores: 0, n_exceptions: 0, artifact_validation: { valid: true } }, 'Diagnostic finished with no valid scores'],
    [undefined, 'Diagnostic finished; verify its summary'],
  ]) {
    const ui = await cardHarness({ draft: { ...diagnosticDraft, kind: 'retry-infrastructure' }, request: async () => operation('COMPLETED', 4, { diagnosticOnly: true, jobName: 'diagnostic-retry', summary }) }, { effects: true })
    ui.render(); await nextTick()
    assert.ok(ui.render().some(node => node.props.children === expected))
    assert.equal(ui.render().some(node => node.props.children === 'Diagnostic process finished'), false)
    ui.dispose()
  }
})
