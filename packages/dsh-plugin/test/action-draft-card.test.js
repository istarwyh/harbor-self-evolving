import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { build } from 'esbuild'
import {
  actionDraftAuthorizationExpired, actionDraftCanConfirm, actionDraftComparison,
  actionDraftErrorCode, actionDraftExpiry, actionDraftNeedsReprepare,
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
async function cardHarness(props) {
  const bundle = await build({ entryPoints: [new URL('../src/client/action-draft-card.jsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'] })
  const values = []
  let cursor = 0
  const hooks = {
    ...React,
    useState(initial) {
      const slot = cursor++
      if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial
      return [values[slot], next => { values[slot] = typeof next === 'function' ? next(values[slot]) : next }]
    },
    useEffect() { /* Lifecycle recovery and actual browser effects are verified separately. */ },
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
    const tree = ActionDraftCardView({ t: key => ACTION_CARD_MESSAGES.en[key] ?? key, request: async () => { throw new Error('HARBOR_ACTION_DENIED: no operation yet') }, ...props })
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
  return { render, button, click }
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
