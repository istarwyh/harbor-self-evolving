import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import React from 'react'

const SESSION = 'session-native-tool-render'

function actionDraft(overrides = {}) {
  return {
    schema: 'harbor-action-draft/v1', draftId: 'draft-a', kind: 'candidate-draft',
    target: { kind: 'harbor.job/v1', workspace: 'workspace-a', job: 'job-a' },
    proposal: { summary: 'Review this suggestion before changing anything.' },
    ...overrides,
  }
}

function evidence(overrides = {}) {
  return {
    schema: 'harbor-evidence/v1', artifactRevision: 'revision-job-a',
    evidenceRef: { kind: 'harbor.evidence/v1', job: 'job-a', trial: 'trial-a', criterion: 'quality', evidenceRef: 'evidence-a' },
    evidence: { available: true },
    uiAction: {
      kind: 'harbor.navigate', actionId: 'evidence-a', label: 'Read the score evidence',
      target: { route: 'harbor.trial.detail', workspace: 'workspace-a', job: 'job-a', trial: 'trial-a', stage: 'judge', criterion: 'quality', evidenceRef: 'evidence-a' },
    },
    ...overrides,
  }
}

const resultBlock = (value, overrides = {}) => ({ kind: 'tool-result', meta: value, content: [{ type: 'text', text: JSON.stringify(value) }], ...overrides })

function descendants(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...React.Children.toArray(node.props?.children).flatMap(descendants)]
}

function textContent(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (typeof node !== 'object') return String(node)
  return React.Children.toArray(node.props?.children).map(textContent).join('')
}

async function harness({ toolName = 'harbor_propose_action', block, ui: initialUi = {}, prepareQuestion } = {}) {
  let ui = initialUi
  let cursor = 0
  const slots = []
  const preparations = []
  const navigations = []
  const contextValues = new Map()
  const contextReads = []
  const hooks = {
    ...React,
    createContext(initial) {
      const context = { initial }
      context.Provider = Object.assign(function TestContextProvider({ children }) { return children }, { context })
      return context
    },
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
    useContext(context) {
      const value = contextValues.has(context) ? contextValues.get(context) : context.initial
      contextReads.push(value)
      return value
    },
    useMemo: factory => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    // Test the actual built component's initial render and user handlers.
    // Effects, Host subscriptions, layout, and network calls need browser QA.
    useEffect() {},
  }
  let descriptor
  const window = { __ModuleLoader__: { load: value => { descriptor = value } } }
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  new Function('window', bundle)(window)
  const client = descriptor.factory(name => {
    assert.equal(name, 'react', 'The client must use only the public React dependency')
    return hooks
  })
  assert.equal(typeof client.HarborToolView, 'function', 'Build the current client before running the native tool regression tests')
  const bridge = {
    getSnapshot(id) { assert.equal(id, SESSION); return ui },
    subscribe() { return () => {} },
    update(id, patch) { assert.equal(id, SESSION); ui = { ...ui, ...patch }; return ui },
    navigate(id, action, options) { assert.equal(id, SESSION); navigations.push({ action, options }); return true },
  }
  const props = {
    bridge, sessionId: SESSION, block, toolName, t: key => key,
    prepareQuestion: prepareQuestion ?? ((...args) => { preparations.push(args); return true }),
    useSession() { throw new Error('Native tool results must not project or duplicate assistant conversation nodes') },
    stop() { throw new Error('Rendering and navigation must not cancel an Agent') },
  }
  const render = () => { cursor = 0; return client.HarborToolView(props) }
  const all = () => descendants(render())
  const cards = () => all().filter(node => typeof node.type === 'function' && node.type.name === 'ActionDraftCard')
  const actionButtons = () => all().filter(node => node.type === 'button' && node.props?.className === 'hse-tool-action')
  const click = node => {
    assert.ok(node, 'Expected a user-triggered control')
    assert.equal(Boolean(node.props.disabled), false)
    return node.props.onClick()
  }
  const renderProviderChild = element => {
    const context = element?.type?.context
    assert.ok(context, 'Session consumers must have a Context provider ancestor, not only a provider in their own return value')
    const child = React.Children.only(element.props.children)
    assert.equal(typeof child.type, 'function')
    contextValues.set(context, element.props.value)
    cursor = 0
    try { return child.type(child.props) }
    finally { contextValues.delete(context) }
  }
  return { client, props, render, all, cards, actionButtons, click, preparations, navigations, bridge, renderProviderChild, contextReads }
}

test('a successful proposal renders exactly one review card in the native tool result without a duplicate answer panel', async () => {
  const draft = actionDraft()
  const view = await harness({ block: resultBlock(draft) })
  assert.equal(view.cards().length, 1)
  assert.deepEqual(view.cards()[0].props.draft, draft)
  assert.equal(view.render().props.value, SESSION, 'The native card must execute API reads and writes in its owning Session')
  for (const name of ['onSourceDraft', 'onReprepare', 'onViewComparison', 'onViewResult']) assert.equal(typeof view.cards()[0].props[name], 'function', `Native card must retain ${name}`)
  assert.equal(view.actionButtons().length, 0)
  assert.equal(view.preparations.length, 0)
  assert.equal(view.navigations.length, 0)
  assert.equal(view.client.CopilotDock, undefined, 'The client must no longer export the duplicate Copilot surface')
  assert.equal(view.all().some(node => /hse-(?:copilot|context-dock|input-dock)/.test(node.props?.className ?? '')), false)
})

test('a successful text-encoded proposal uses the same native action card as result metadata', async () => {
  const draft = actionDraft()
  const view = await harness({ block: resultBlock(draft, { meta: undefined }) })
  assert.equal(view.cards().length, 1)
  assert.deepEqual(view.cards()[0].props.draft, draft)
  assert.equal(view.navigations.length, 0)
})

test('wrong tools, unknown schemas, malformed drafts, and failed results never create an action card', async t => {
  const cases = [
    { name: 'another Harbor tool', toolName: 'harbor_get_evidence', block: resultBlock(actionDraft()) },
    { name: 'a non-Harbor tool', toolName: 'read_file', block: resultBlock(actionDraft()) },
    { name: 'a near-match tool name', toolName: 'harbor_propose_action_extra', block: resultBlock(actionDraft()) },
    { name: 'an unknown schema', block: resultBlock(actionDraft({ schema: 'harbor-action-draft/v2' })) },
    { name: 'a missing draft identity', block: resultBlock(actionDraft({ draftId: undefined })) },
    { name: 'an empty draft identity', block: resultBlock(actionDraft({ draftId: '' })) },
    { name: 'a non-string draft identity', block: resultBlock(actionDraft({ draftId: 17 })) },
    { name: 'a running proposal-shaped block', block: resultBlock(actionDraft(), { kind: undefined }) },
    { name: 'an assistant proposal-shaped block', block: resultBlock(actionDraft(), { kind: 'assistant' }) },
    { name: 'a failed structured result', block: resultBlock(actionDraft(), { isError: true }) },
    { name: 'a failed text result', block: resultBlock(actionDraft(), { meta: undefined, isError: true }) },
    { name: 'unparseable tool text', block: { kind: 'tool-result', content: [{ type: 'text', text: 'not JSON' }] } },
  ]
  for (const item of cases) await t.test(item.name, async () => {
    const view = await harness(item)
    assert.equal(view.cards().length, 0)
    assert.equal(view.actionButtons().length, 0)
    assert.equal(view.preparations.length, 0)
    assert.equal(view.navigations.length, 0)
  })
})

test('native evidence navigation restores the exact typed object only after a user click', async () => {
  const value = evidence()
  const view = await harness({ toolName: 'harbor_get_evidence', block: resultBlock(value) })
  assert.equal(view.cards().length, 0)
  assert.equal(view.actionButtons().length, 1)
  assert.equal(view.navigations.length, 0, 'Rendering a result must not switch pages')
  assert.doesNotMatch(textContent(view.render()), /preparedInHarbor|navigationPending/, 'Navigation feedback must wait for an explicit user action')
  view.click(view.actionButtons()[0])
  assert.deepEqual(view.navigations, [{ action: value.uiAction, options: { force: true } }])
  const notice = view.all().find(node => node.props?.className === 'hse-draft-notice')
  assert.equal(notice?.props.role, 'status')
  assert.equal(textContent(notice), 'preparedInHarbor', 'The native result must explain that the user should open the Harbor tab')
  assert.equal(view.preparations.length, 0, 'Navigating evidence must not prepare or send another question')
})

test('a rejected native evidence navigation reports pending rather than pretending the destination opened', async () => {
  const view = await harness({ toolName: 'harbor_get_evidence', block: resultBlock(evidence()) })
  view.bridge.navigate = () => false
  view.click(view.actionButtons()[0])
  assert.match(textContent(view.render()), /navigationPending/)
  assert.doesNotMatch(textContent(view.render()), /preparedInHarbor/)
})

test('only successful exact reader schemas expose native evidence navigation', async t => {
  const cases = [
    { name: 'wrong tool for evidence', toolName: 'harbor_eval_result', block: resultBlock(evidence()) },
    { name: 'mismatched reader schema', toolName: 'harbor_resolve_page_context', block: resultBlock(evidence()) },
    { name: 'unknown evidence schema', toolName: 'harbor_get_evidence', block: resultBlock(evidence({ schema: 'harbor-evidence/v2' })) },
    { name: 'failed reader result', toolName: 'harbor_get_evidence', block: resultBlock(evidence(), { isError: true }) },
    { name: 'running reader-shaped metadata', toolName: 'harbor_get_evidence', block: resultBlock(evidence(), { kind: undefined }) },
    { name: 'unknown action kind', toolName: 'harbor_get_evidence', block: resultBlock(evidence({ uiAction: { kind: 'execute-shell', command: 'not an action' } })) },
  ]
  for (const item of cases) await t.test(item.name, async () => {
    const view = await harness(item)
    assert.equal(view.actionButtons().length, 0)
    assert.equal(view.cards().length, 0)
    assert.equal(view.navigations.length, 0)
  })
})

test('native tool details are opt-in and show error text without creating a recovery action', async () => {
  const view = await harness({ block: { kind: 'tool-result', isError: true, content: [{ type: 'text', text: 'Explicit tool failure' }] } })
  assert.equal(view.all().filter(node => node.type === 'pre').length, 0)
  assert.match(textContent(view.render()), /error/)
  view.click(view.all().find(node => node.type === 'button'))
  assert.match(textContent(view.render()), /Explicit tool failure/)
  assert.equal(view.cards().length, 0)
  assert.equal(view.actionButtons().length, 0)
})

test('an idle or running native tool does not create empty context, task, or reply panels', async () => {
  const view = await harness()
  assert.doesNotThrow(() => view.render())
  assert.match(textContent(view.render()), /running/)
  assert.equal(view.cards().length, 0)
  assert.equal(view.actionButtons().length, 0)
  assert.equal(view.all().some(node => /hse-(?:copilot|context-dock|input-dock|operation-tray)/.test(node.props?.className ?? '')), false)
  assert.equal(view.preparations.length, 0)
  assert.equal(view.navigations.length, 0)
})

test('an unsupported recovery target returns false instead of claiming a question was prepared', async () => {
  const draft = actionDraft({ target: { kind: 'unknown', workspace: 'workspace-a' } })
  const view = await harness({ block: resultBlock(draft) })
  assert.equal(view.cards().length, 1)
  assert.equal(await view.cards()[0].props.onReprepare(draft), false)
  assert.equal(view.preparations.length, 0)
  assert.equal(view.navigations.length, 0)
})

test('a successful resolver result provides the same native typed navigation without a second response surface', async () => {
  const value = { schema: 'harbor-resolved-context/v1', contextSnapshotId: 'hctx_native_abcdefghijklmnopqrstuvwxyz', uiAction: evidence().uiAction }
  const view = await harness({ toolName: 'harbor_resolve_page_context', block: resultBlock(value) })
  assert.equal(view.actionButtons().length, 1)
  view.click(view.actionButtons()[0])
  assert.deepEqual(view.navigations, [{ action: value.uiAction, options: { force: true } }])
  assert.equal(view.cards().length, 0)
})

test('native card recovery prepares its original target rather than the currently visible page', async () => {
  const draft = actionDraft()
  const view = await harness({ block: resultBlock(draft), ui: { current: { pageSessionId: 'page-current', workspace: 'workspace-b', object: { job: 'job-b' } } } })
  assert.equal(await view.cards()[0].props.onReprepare(draft), true)
  assert.equal(view.preparations.length, 1)
  const [prepared, prompt] = view.preparations[0]
  assert.equal(prepared.sessionId, SESSION)
  assert.equal(prepared.workspace, 'workspace-a')
  assert.equal(prepared.object.job, 'job-a')
  assert.equal(prepared.pageSessionId, 'page-current')
  assert.equal(prompt, `repreparePrompt\n${draft.proposal.summary}`)
  assert.equal(view.navigations.length, 0)
})

test('cold native card recovery creates a page identity without depending on a mounted Harbor page or earlier question', async () => {
  const draft = actionDraft({
    target: { kind: 'harbor.trial/v1', workspace: 'workspace-original', job: 'job-original', trial: 'trial-original' },
    selection: [{ kind: 'harbor.criterion/v1', criterion: 'quality', trial: 'trial-original' }],
  })
  const view = await harness({ block: resultBlock(draft) })
  assert.equal(view.bridge.getSnapshot(SESSION).current, undefined)
  assert.equal(view.bridge.getSnapshot(SESSION).lastSent, undefined)
  assert.equal(await view.cards()[0].props.onReprepare(draft), true)
  const [context] = view.preparations[0]
  assert.equal(typeof context.pageSessionId, 'string')
  assert.ok(context.pageSessionId.length > 0, 'A cold recovery must supply a usable page identity to the Host context bind')
  assert.equal(context.sessionId, SESSION)
  assert.equal(context.workspace, 'workspace-original')
  assert.equal(context.object.job, 'job-original')
  assert.equal(context.object.trial, 'trial-original')
  assert.equal(context.selection[0].criterion, 'quality')
  assert.equal(view.navigations.length, 0)
})

test('native card expired recovery retains the original selection and asks for reselection without claiming success', async () => {
  const draft = actionDraft({ selection: [{ kind: 'harbor.trial-set/v1', id: 'selection-a', selectionCount: 2, stage: 'judge' }] })
  const view = await harness({ block: resultBlock(draft), ui: { error: { category: 'expired', message: 'Subset no longer available' } }, prepareQuestion: () => false })
  assert.equal(await view.cards()[0].props.onReprepare(draft), false)
  assert.equal(view.bridge.getSnapshot(SESSION).error.nextStep, 'draftRecoveryReselect')
  assert.equal(view.navigations.length, 1)
  assert.deepEqual(view.navigations[0].action.target, { route: 'harbor.job', workspace: 'workspace-a', job: 'job-a', stage: 'judge' })
  assert.deepEqual(view.cards()[0].props.draft.selection, draft.selection, 'Recovery must not silently broaden the original subset')
})

test('native source review, comparison, and diagnostic result actions retain their exact destinations', async () => {
  const draft = actionDraft({ kind: 'evaluator-draft', proposal: { summary: 'Revise scoring', sourceRef: { kind: 'evaluator-source', job: 'source-job', stage: 'judge', path: 'judge.py' } } })
  const view = await harness({ block: resultBlock(draft) })
  const card = view.cards()[0]
  assert.doesNotMatch(textContent(view.render()), /preparedInHarbor|navigationPending/)
  card.props.onSourceDraft(draft)
  const stored = view.bridge.getSnapshot(SESSION).evaluatorProposal
  assert.equal(stored.draftId, draft.draftId)
  assert.equal(typeof stored.reviewRequestId, 'string')
  assert.deepEqual(stored.proposal, draft.proposal)
  assert.deepEqual(view.navigations[0].action.target, { route: 'harbor.evaluator', workspace: 'workspace-a', job: 'source-job', stage: 'judge' })
  assert.match(textContent(view.render()), /preparedInHarbor/, 'Source review must visibly tell the user where the prepared editor is')

  card.props.onViewComparison(actionDraft({ kind: 'compare', target: { kind: 'harbor.compare/v1', workspace: 'workspace-a', job: 'job-a', baseline: 'baseline-a', candidate: 'candidate-a' } }))
  assert.deepEqual(view.navigations[1].action.target, { route: 'harbor.compare', workspace: 'workspace-a', job: 'job-a', stage: 'gate', baseline: 'baseline-a', candidate: 'candidate-a' })

  card.props.onViewResult({ jobName: 'diagnostic-new-job' })
  assert.deepEqual(view.navigations[2].action.target, { route: 'harbor.job', workspace: 'workspace-a', job: 'diagnostic-new-job', stage: 'judge' })
  assert.ok(view.navigations.every(item => item.options.force === true))
  assert.equal(view.preparations.length, 0)
})

test('the input reference synchronizer occupies no visible space even when a page and explicit reference exist', async () => {
  const view = await harness({ ui: { current: { workspace: 'workspace-a', object: { job: 'job-a' } }, explicit: { contextSnapshotId: 'hctx_native_abcdefghijklmnopqrstuvwxyz' } } })
  assert.equal(typeof view.client.HarborInputSync, 'function')
  const output = view.client.HarborInputSync({
    bridge: view.bridge, sessionId: SESSION,
    useInput: select => select({ draft: 'Why did this score drop?', occurrences: [], phase: 'plain' }),
    replaceHarborReference() { throw new Error('A render must not replace the draft before the Host lifecycle effect') },
  })
  assert.equal(output, null)
  assert.equal(view.navigations.length, 0)
})

test('the registered Workbench provides its Session before the dashboard reads task APIs', async () => {
  const view = await harness()
  const registrations = []
  view.client.apply({
    effect() { return () => {} },
    locale: { bind: () => key => key },
    slots: {
      inject(_name, callback) {
        const value = callback()
        if (value?.[Symbol.iterator]) for (const dispose of value) void dispose
      },
      register(options, component) { registrations.push({ options, component }); return () => {} },
    },
  })
  const dashboard = registrations.find(item => item.options.name === 'conversation.view')
  assert.ok(dashboard)
  const output = dashboard.component({
    bridge: view.bridge, sessionId: SESSION, t: key => key,
    useInput: select => select({ phase: 'plain', draft: '', occurrences: [] }),
  })
  assert.equal(output.props.value, SESSION)
  assert.equal(React.Children.only(output.props.children).type.name, 'DashboardSessionView')
  assert.doesNotThrow(() => view.renderProviderChild(output), 'Dashboard API hooks must not read an undefined Session')
  assert.deepEqual(view.contextReads, [SESSION, SESSION], 'Task reads and mutations must both consume the ancestor Session provider')
})

test('a native question preparation failure reaches the owning Composer notice and Harbor error state', async () => {
  const view = await harness()
  const registrations = []
  const notices = []
  const input = { notify: (level, message) => notices.push({ level, message }) }
  const conversation = { input: { for(scope) { assert.equal(scope, actx); return input } } }
  const actx = { get(name) { assert.equal(name, 'conversation'); return conversation } }
  view.client.apply({
    effect() { return () => {} },
    locale: { bind: () => key => key },
    sessions: { scope(id) { assert.equal(id, SESSION); return actx } },
    slots: {
      inject(_name, callback) {
        const value = callback()
        if (value?.[Symbol.iterator]) for (const dispose of value) void dispose
      },
      register(options, component) { registrations.push({ options, component }); return () => {} },
    },
  })
  const tool = registrations.find(item => item.options.key === 'harbor_propose_action')
  assert.ok(tool)
  const injected = tool.options.inject(SESSION)
  injected.bridge.issue = async () => { throw Object.assign(new Error('The original context is no longer available'), { code: 'HARBOR_CONTEXT_UNAVAILABLE' }) }
  const context = view.client.actionDraftContext(actionDraft(), SESSION, 'native-recovery-page')
  assert.equal(await injected.prepareQuestion(context, 'Try this original object again'), false)
  assert.equal(injected.bridge.getSnapshot(SESSION).status, 'error', 'Failed preparation must not leave an invisible binding state')
  assert.equal(injected.bridge.getSnapshot(SESSION).error.message, 'The original context is no longer available')
  assert.deepEqual(notices, [{ level: 'error', message: 'The original context is no longer available' }], 'Failure must be visible even when the Harbor page is not mounted')
})
