import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import React from 'react'

const SESSION = 'session-copilot-render'
const TOKEN_A = 'hctx_render_a_abcdefghijklmnopqrstuvwxyz'
const TOKEN_B = 'hctx_render_b_abcdefghijklmnopqrstuvwxyz'
const ref = token => `<harbor-context-ref schema="harbor-ui-context/v1" context-snapshot-id="${token}">Resolve this reference.</harbor-context-ref>`
const human = (seq, text) => ({ kind: 'user', seq, content: [{ type: 'text', text }] })
const answer = (seq, turn, text) => ({ kind: 'assistant', seq, turn, blocks: [{ kind: 'text', text }] })

function context(job) {
  return {
    schema: 'harbor-ui-context/v1', sessionId: SESSION, workspace: 'workspace-a', pageSessionId: 'page-a',
    object: { kind: 'job', id: job, job, stage: 'candidate' },
    route: { name: 'harbor.job', params: { job, stage: 'candidate' } },
    artifactRevision: `revision-${job}`, observedAt: '2026-09-05T00:00:00.000Z',
  }
}

function resolver(seq, token, job) {
  const target = { kind: 'harbor.job/v1', workspace: 'workspace-a', job }
  return {
    kind: 'tool-result', seq, call: { name: 'harbor_resolve_page_context' },
    value: {
      schema: 'harbor-resolved-context/v1', contextSnapshotId: token, freshness: 'FRESH',
      context: { ...context(job), object: target, focus: { job, stage: 'candidate' } },
      refs: { object: target, selection: [] },
      basedOn: { artifactRevision: `revision-${job}`, currentRevision: `revision-${job}`, observedAt: '2026-09-05T00:00:00.000Z' },
      uiAction: { kind: 'harbor.navigate', actionId: `read-${token}`, label: `Read ${job}`, target: { route: 'harbor.job', workspace: 'workspace-a', job, stage: 'candidate' } },
    },
  }
}

function descendants(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...React.Children.toArray(node.props?.children).flatMap(descendants)]
}

function textContent(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (typeof node !== 'object') return String(node)
  // AnswerText is a pure text-rendering child. Its selected input is the actual
  // Copilot render output; no parallel answer/provenance model is used here.
  if (typeof node.type === 'function' && node.type.name === 'AnswerText') return node.props.text
  return React.Children.toArray(node.props?.children).map(textContent).join('')
}

async function harness({ ui: initialUi = {}, session = {}, prepareQuestion } = {}) {
  let ui = initialUi
  let cursor = 0
  const slots = []
  const preparations = []
  const navigations = []
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useCallback: callback => callback,
    useContext: () => SESSION,
    useMemo: factory => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    // These tests target initial render and explicit handlers. Host async
    // lifecycle, subscription delivery, layout and timers require browser QA.
    useEffect() {},
  }
  let descriptor
  const window = { __ModuleLoader__: { load: value => { descriptor = value } } }
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  new Function('window', bundle)(window)
  const { CopilotDock } = descriptor.factory(name => {
    assert.equal(name, 'react', 'The client must use only the public React dependency')
    return hooks
  })
  assert.equal(typeof CopilotDock, 'function', 'Build the current client before running the component regression tests')
  const bridge = {
    getSnapshot(id) { assert.equal(id, SESSION); return ui },
    subscribe() { return () => {} },
    update(id, patch) { assert.equal(id, SESSION); ui = { ...ui, ...patch }; return ui },
    navigate(id, action, options) { assert.equal(id, SESSION); navigations.push({ action, options }); return true },
  }
  const props = {
    bridge, sessionId: SESSION, useSession: select => select(session), t: key => key,
    prepareQuestion: prepareQuestion ?? ((...args) => { preparations.push(args); return true }),
    resolveLatest() { throw new Error('Rendering must not resolve or fetch context') },
    stop() { throw new Error('Rendering and history navigation must not cancel an Agent') },
  }
  const render = () => { cursor = 0; return CopilotDock(props) }
  const all = () => descendants(render())
  const byClass = name => all().find(node => node.props?.className?.split(/\s+/).includes(name))
  const button = label => {
    const node = all().find(item => item.type === 'button' && textContent(item) === label)
    assert.ok(node, `Button not found: ${label}`)
    return node
  }
  const click = label => {
    const node = button(label)
    assert.equal(Boolean(node.props.disabled), false, `Button disabled: ${label}`)
    return node.props.onClick()
  }
  return { render, all, byClass, button, click, preparations, navigations, bridge, session }
}

test('Copilot initial empty render is safe without lastSent, a token, or a resolver result', async () => {
  const view = await harness()
  assert.doesNotThrow(() => view.render())
  assert.match(textContent(view.render()), /copilotIdle/)
  assert.equal(view.byClass('hse-hook-state'), undefined)
  assert.equal(view.byClass('hse-copilot-answer'), undefined)
  assert.equal(view.byClass('hse-copilot-basis'), undefined)
  assert.equal(view.preparations.length, 0)
  assert.equal(view.navigations.length, 0)
})

test('selecting a page before the first question does not fabricate an answer or reference', async () => {
  const view = await harness({ ui: { current: context('job-page-only') }, session: { nodes: [] } })
  assert.doesNotThrow(() => view.render())
  assert.equal(view.byClass('hse-hook-state'), undefined)
  assert.equal(view.byClass('hse-copilot-basis'), undefined)
  assert.doesNotMatch(textContent(view.render()), /job-page-only|FRESH/)
  assert.equal(view.preparations.length, 0)
})

test('ordinary follow-up renders its own answer without the anchor answer or freshness basis', async () => {
  const view = await harness({
    ui: { lastSent: { contextSnapshotId: TOKEN_A, context: context('job-a') }, current: context('job-page-b') },
    session: { nodes: [human(1, `${ref(TOKEN_A)} First question`), resolver(2, TOKEN_A, 'job-a'), answer(3, 1, 'OLD ANSWER'), human(4, 'Explain more simply'), answer(5, 2, 'OWN FOLLOW-UP ANSWER')] },
  })
  assert.equal(textContent(view.byClass('hse-copilot-answer')), 'OWN FOLLOW-UP ANSWER')
  assert.doesNotMatch(textContent(view.render()), /OLD ANSWER|revision-job-a|FRESH/)
  assert.equal(view.byClass('hse-copilot-basis'), undefined)
  assert.equal(view.byClass('hse-copilot-refs'), undefined)
  assert.match(textContent(view.byClass('hse-hook-state')), /historyOnly/)
  assert.match(textContent(view.render()), /followupUnbound|evidenceNotChecked/)
  assert.equal(view.preparations.length, 0)

  view.click('continueObject')
  assert.equal(view.preparations.length, 1)
  assert.equal(view.preparations[0][0].object.job, 'job-a')
  assert.equal(view.preparations[0][0].object.job === 'job-page-b', false)
  assert.equal(view.preparations[0][1], '')
})

test('evidence read in an ordinary follow-up identifies its own Job without borrowing anchor freshness', async () => {
  const evidence = {
    kind: 'tool-result', seq: 5, call: { name: 'harbor_get_evidence' },
    value: {
      schema: 'harbor-evidence/v1', artifactRevision: 'revision-job-b',
      evidenceRef: { kind: 'harbor.evidence/v1', job: 'job-b', trial: 'trial-b', criterion: 'quality', evidenceRef: 'evidence-b' },
      evidence: { available: true },
      uiAction: { kind: 'harbor.navigate', actionId: 'evidence-b', target: { route: 'harbor.trial.detail', workspace: 'workspace-a', job: 'job-b', trial: 'trial-b', stage: 'judge' } },
    },
  }
  const view = await harness({
    ui: { lastSent: { contextSnapshotId: TOKEN_A, context: context('job-a') } },
    session: { nodes: [human(1, `${ref(TOKEN_A)} First question`), resolver(2, TOKEN_A, 'job-a'), answer(3, 1, 'ANSWER A'), human(4, 'Now inspect the evidence for Job B'), evidence, answer(6, 2, 'ANSWER USING B')] },
  })
  assert.equal(textContent(view.byClass('hse-copilot-answer')), 'ANSWER USING B')
  assert.match(textContent(view.byClass('hse-hook-state')), /Job job-b/)
  assert.match(textContent(view.byClass('hse-copilot-basis')), /job-b/)
  assert.doesNotMatch(textContent(view.byClass('hse-copilot-basis')), /job-a/)
  assert.match(textContent(view.byClass('hse-answer-details')), /UNVERIFIED/)
  assert.doesNotMatch(textContent(view.byClass('hse-answer-details')), /FRESH/)
})

test('a historical segment owns its answer and follow-up object while the latest turn is running', async () => {
  const view = await harness({
    ui: { lastSent: { contextSnapshotId: TOKEN_B, context: context('job-b') }, current: context('job-page-c') },
    session: {
      nodes: [human(1, `${ref(TOKEN_A)} First object question`), resolver(2, TOKEN_A, 'job-a'), answer(3, 1, 'ANSWER A'), human(4, `${ref(TOKEN_B)} Second object question`), resolver(5, TOKEN_B, 'job-b'), answer(6, 2, 'ANSWER B')],
      running: true, partial: answer(7, 2, 'LIVE ANSWER B'),
    },
  })
  assert.equal(textContent(view.byClass('hse-copilot-answer')), 'LIVE ANSWER B')
  view.click('First object question')
  assert.equal(textContent(view.byClass('hse-copilot-answer')), 'ANSWER A')
  assert.match(textContent(view.byClass('hse-copilot-basis')), /job-a/)
  assert.doesNotMatch(textContent(view.byClass('hse-copilot-basis')), /job-b|job-page-c/)
  assert.equal(view.all().some(node => node.type === 'button' && textContent(node) === 'stopAgent'), false)
  view.click('continueObject')
  assert.equal(view.preparations[0][0].object.job, 'job-a')

  view.click('latestReply')
  assert.equal(textContent(view.byClass('hse-copilot-answer')), 'LIVE ANSWER B')
  assert.equal(view.button('continueObject').props.disabled, true)
})

test('a collapsed narrow Copilot announces reply readiness and expands to the current answer', async () => {
  const view = await harness({
    ui: { workbenchDock: { narrow: true }, lastSent: { contextSnapshotId: TOKEN_A, context: context('job-a') } },
    session: { nodes: [human(1, `${ref(TOKEN_A)} Explain`), resolver(2, TOKEN_A, 'job-a'), answer(3, 1, 'READY ANSWER')] },
  })
  assert.equal(view.render().props['data-collapsed'], 'true')
  assert.equal(view.byClass('hse-copilot-answer'), undefined)
  assert.match(textContent(view.render()), /replyReady/)
  view.click('+')
  assert.equal(view.render().props['data-collapsed'], 'false')
  assert.equal(textContent(view.byClass('hse-copilot-answer')), 'READY ANSWER')
})

test('unsupported action recovery returns false instead of claiming Composer preparation', async () => {
  const workspaceDraft = { schema: 'harbor-action-draft/v1', draftId: 'workspace-only', kind: 'candidate-draft', target: { kind: 'unknown', workspace: 'workspace-a' }, proposal: { summary: 'A suggestion without a supported target' } }
  const view = await harness({
    ui: { lastSent: { contextSnapshotId: TOKEN_A, context: context('job-a') } },
    session: { nodes: [human(1, `${ref(TOKEN_A)} Suggest a change`), { kind: 'tool-result', seq: 2, call: { name: 'harbor_propose_action' }, value: workspaceDraft }, answer(3, 1, 'Suggestion')] },
  })
  const card = view.all().find(node => typeof node.type === 'function' && node.type.name === 'ActionDraftCard')
  assert.ok(card)
  assert.equal(await card.props.onReprepare(workspaceDraft), false)
  assert.equal(view.preparations.length, 0)
})
