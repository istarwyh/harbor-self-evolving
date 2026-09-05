import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import React from 'react'

import { normalizeHarborUiContext } from '../lib/ui-context.js'

async function loadClient() {
  const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let descriptor
  const window = { __ModuleLoader__: { load(value) { descriptor = value } } }
  new Function('window', bundle)(window)
  return descriptor.factory(id => {
    if (id === 'react') return React
    throw new Error(`unexpected client dependency: ${id}`)
  })
}

function pageContext(id) {
  return {
    schema: 'harbor-ui-context/v1',
    workspace: 'workspace-a',
    pageSessionId: `page-${id}`,
    route: 'harbor.job',
    object: { kind: 'job', id, job: id },
    selection: [],
  }
}

function success(value) {
  return { ok: true, status: 200, async json() { return { ok: true, value } } }
}

function structuredInput(initial = {}) {
  let submissions = 0
  let snapshot = {
    draft: String(initial.draft ?? ''),
    occurrences: Array.isArray(initial.occurrences) ? initial.occurrences : [],
    phase: initial.phase ?? 'plain',
    draftRev: initial.draftRev ?? 1,
  }
  const input = {
    state: { getSnapshot() { return snapshot } },
    setDraft(value, editRange) {
      const nextDraft = String(value)
      if (nextDraft === snapshot.draft) return
      let start = editRange?.start
      let oldEnd = editRange?.end
      let insertedLength = editRange?.insertedLength
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(oldEnd) || !Number.isSafeInteger(insertedLength)) {
        start = 0
        while (start < snapshot.draft.length && start < nextDraft.length && snapshot.draft[start] === nextDraft[start]) start += 1
        oldEnd = snapshot.draft.length
        let newEnd = nextDraft.length
        while (oldEnd > start && newEnd > start && snapshot.draft[oldEnd - 1] === nextDraft[newEnd - 1]) {
          oldEnd -= 1
          newEnd -= 1
        }
        insertedLength = newEnd - start
      }
      const delta = insertedLength - (oldEnd - start)
      const occurrences = snapshot.occurrences.flatMap(item => {
        const itemEnd = item.offset + item.length
        if (itemEnd <= start) return [item]
        if (item.offset >= oldEnd) return [{ ...item, offset: item.offset + delta }]
        return []
      })
      snapshot = { ...snapshot, draft: nextDraft, occurrences, draftRev: snapshot.draftRev + 1 }
    },
    insertReference(reference, span) {
      if (snapshot.phase !== 'plain' || span?.draftRev !== snapshot.draftRev || span.start !== 0 || span.end !== 0) return false
      const display = `@${reference.label}`
      const gap = snapshot.draft.startsWith(' ') ? '' : ' '
      const insertedLength = display.length + gap.length
      snapshot = {
        ...snapshot,
        draft: `${display}${gap}${snapshot.draft}`,
        occurrences: [
          { occurrenceId: snapshot.draftRev, ...reference, offset: 0, length: display.length },
          ...snapshot.occurrences.map(item => ({ ...item, offset: item.offset + insertedLength })),
        ],
        draftRev: snapshot.draftRev + 1,
      }
      return true
    },
    submit() { submissions += 1 },
  }
  return {
    input,
    snapshot: () => snapshot,
    submissions: () => submissions,
    setPhase: phase => { snapshot = { ...snapshot, phase } },
  }
}

test('newer page activation owns explicit state when bindings settle out of order', async t => {
  const client = await loadClient()
  const pending = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = (_url, options) => new Promise((resolve, reject) => pending.push({ body: JSON.parse(options.body), resolve, reject }))
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  const older = bridge.issue('session-a', pageContext('older'))
  const newer = bridge.issue('session-a', pageContext('newer'))
  await Promise.resolve()

  pending[1].resolve(success({ contextSnapshotId: 'hctx_newer_abcdefghijklmnopqrstuvwxyz', reference: '@harbor(hctx_newer_abcdefghijklmnopqrstuvwxyz)', label: 'newer', expiresAt: '2099-01-01T00:00:00.000Z' }))
  await newer
  assert.equal(bridge.getSnapshot('session-a').explicit.label, 'newer')

  pending[0].resolve(success({ contextSnapshotId: 'hctx_older_abcdefghijklmnopqrstuvwxyz', reference: '@harbor(hctx_older_abcdefghijklmnopqrstuvwxyz)', label: 'older', expiresAt: '2099-01-01T00:00:00.000Z' }))
  await older
  assert.equal(bridge.getSnapshot('session-a').explicit.label, 'newer')
  assert.equal(bridge.getSnapshot('session-a').status, 'ready')
})

test('a stale binding error cannot replace the state of a newer activation', async t => {
  const client = await loadClient()
  const pending = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = (_url, options) => new Promise((resolve, reject) => pending.push({ body: JSON.parse(options.body), resolve, reject }))
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  const stale = bridge.issue('session-a', pageContext('stale'))
  const current = bridge.issue('session-a', pageContext('current'))
  await Promise.resolve()
  pending[1].resolve(success({ contextSnapshotId: 'hctx_current_abcdefghijklmnopqrstuvwxyz', reference: '@harbor(hctx_current_abcdefghijklmnopqrstuvwxyz)', label: 'current', expiresAt: '2099-01-01T00:00:00.000Z' }))
  await current
  pending[0].reject(new Error('stale request failed'))
  await assert.rejects(stale, /stale request failed/)

  assert.equal(bridge.getSnapshot('session-a').explicit.label, 'current')
  assert.equal(bridge.getSnapshot('session-a').status, 'ready')
  assert.equal(bridge.getSnapshot('session-a').error, undefined)
})

test('an explicit Ask freezes the clicked object even when the visible page changes before Host binding settles', async t => {
  const client = await loadClient()
  let resolveRequest
  const previousFetch = globalThis.fetch
  globalThis.fetch = () => new Promise(resolve => { resolveRequest = resolve })
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  const clicked = { ...pageContext('trial-a'), pageSessionId: 'page-shared' }
  bridge.setCurrent('session-a', clicked)
  const binding = bridge.issue('session-a', clicked, { forceNew: true })
  await Promise.resolve()
  bridge.setCurrent('session-a', { ...pageContext('trial-b'), pageSessionId: 'page-shared' })
  resolveRequest(success({ contextSnapshotId: 'hctx_trial_a_abcdefghijklmnopqrst', reference: '@harbor(hctx_trial_a_abcdefghijklmnopqrst)', label: 'trial-a', expiresAt: '2099-01-01T00:00:00.000Z' }))
  await binding

  assert.equal(bridge.getSnapshot('session-a').current.object.id, 'trial-b')
  assert.equal(bridge.getSnapshot('session-a').explicit.context.object.id, 'trial-a')
})

test('late Ask completion cannot replace the newer explicit token in the Draft', async t => {
  const client = await loadClient()
  const pending = []
  const commits = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = (_url, options) => new Promise(resolve => pending.push({ body: JSON.parse(options.body), resolve }))
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  const older = bridge.issue('session-a', pageContext('older-draft'))
  const newer = bridge.issue('session-a', pageContext('newer-draft'))
  await Promise.resolve()
  pending[1].resolve(success({ contextSnapshotId: 'hctx_newer_draft_abcdefghijklmnop', reference: '@harbor(hctx_newer_draft_abcdefghijklmnop)', label: 'newer', expiresAt: '2099-01-01T00:00:00.000Z' }))
  const newerIssued = await newer
  const replaceReference = (issued, prompt) => { commits.push({ issued, prompt }); return true }
  assert.equal(client.commitIssuedDraft(bridge, 'session-a', newerIssued, replaceReference), true)
  pending[0].resolve(success({ contextSnapshotId: 'hctx_older_draft_abcdefghijklmnop', reference: '@harbor(hctx_older_draft_abcdefghijklmnop)', label: 'older', expiresAt: '2099-01-01T00:00:00.000Z' }))
  const olderIssued = await older
  assert.equal(client.commitIssuedDraft(bridge, 'session-a', olderIssued, replaceReference), false)
  assert.deepEqual(commits, [{ issued: newerIssued, prompt: '' }])
})

test('Context Dock first bind and later update both prepare one structured Draft reference without submitting', async () => {
  const client = await loadClient()
  const bridge = new client.HarborUiBridge()
  const composer = structuredInput({ draft: 'Keep my authored question' })
  const replaceReference = (issued, prompt) => client.replaceStructuredHarborReference(composer.input, issued, prompt)
  const first = {
    contextSnapshotId: 'hctx_first_dock_abcdefghijklmnop',
    reference: '@harbor(hctx_first_dock_abcdefghijklmnop)',
    label: 'Trial first',
  }
  const updated = {
    contextSnapshotId: 'hctx_updated_dock_abcdefghijklmn',
    reference: '@harbor(hctx_updated_dock_abcdefghijklmn)',
    label: 'Trial updated',
  }

  bridge.update('session-a', { explicit: first })
  assert.equal(client.commitIssuedDraft(bridge, 'session-a', first, replaceReference), true)
  assert.equal(composer.snapshot().draft, '@Trial first Keep my authored question')
  assert.deepEqual(composer.snapshot().occurrences.map(({ source, ref, offset, length }) => ({ source, ref, offset, length })), [{
    source: 'harbor', ref: first.contextSnapshotId, offset: 0, length: '@Trial first'.length,
  }])

  bridge.update('session-a', { explicit: updated })
  assert.equal(client.commitIssuedDraft(bridge, 'session-a', updated, replaceReference), true)
  assert.equal(composer.snapshot().draft, '@Trial updated Keep my authored question')
  assert.deepEqual(composer.snapshot().occurrences.map(item => [item.source, item.ref]), [['harbor', updated.contextSnapshotId]])
  assert.equal(composer.submissions(), 0)
})

test('activating another Harbor reference normalizes the Draft to exactly one structured occurrence', async () => {
  const client = await loadClient()
  const previous = '@harbor(hctx_previous_abcdefghijklmnop)'
  const issued = {
    contextSnapshotId: 'hctx_current_abcdefghijklmnopqrst',
    reference: '@harbor(hctx_current_abcdefghijklmnopqrst)',
    label: 'Current Trial',
  }
  const rawDraft = `${previous} Keep this authored ${issued.reference} question`
  const composer = structuredInput({ draft: rawDraft })

  assert.equal(client.needsStructuredHarborNormalization(rawDraft, [], issued), true)
  assert.equal(client.replaceStructuredHarborReference(composer.input, issued), true)
  assert.equal(composer.snapshot().draft, '@Current Trial Keep this authored question')
  assert.deepEqual(composer.snapshot().occurrences.map(item => [item.source, item.ref]), [['harbor', issued.contextSnapshotId]])
  assert.equal(client.needsStructuredHarborNormalization(composer.snapshot().draft, composer.snapshot().occurrences, issued), false)
  assert.equal(client.needsStructuredHarborNormalization(composer.snapshot().draft, [
    ...composer.snapshot().occurrences,
    { source: 'harbor', ref: 'hctx_stale_abcdefghijklmnopqrstuvwxyz' },
  ], issued), true)
  assert.equal(client.needsStructuredHarborNormalization('@Current Trial', [{ source: 'harbor', ref: 'hctx_wrong_abcdefghijklmnopqrstuvwxyz' }], issued), true)
})

test('structured Harbor replacement preserves an unrelated reference between stale Harbor chips', async () => {
  const client = await loadClient()
  const left = '@Old A'
  const file = '@File'
  const right = '@Old B'
  const draft = `${left} ${file} ${right} Keep the file reference`
  const composer = structuredInput({
    draft,
    occurrences: [
      { occurrenceId: 1, source: 'harbor', ref: 'hctx_old_a_abcdefghijklmnopqrstuvwxyz', offset: 0, length: left.length },
      { occurrenceId: 2, source: 'file', ref: 'file-1', offset: left.length + 1, length: file.length },
      { occurrenceId: 3, source: 'harbor', ref: 'hctx_old_b_abcdefghijklmnopqrstuvwxyz', offset: left.length + file.length + 2, length: right.length },
    ],
  })
  const issued = {
    contextSnapshotId: 'hctx_current_mixed_abcdefghijklmnop',
    reference: '@harbor(hctx_current_mixed_abcdefghijklmnop)',
    label: 'Current',
  }

  assert.equal(client.replaceStructuredHarborReference(composer.input, issued), true)
  assert.equal(composer.snapshot().draft, '@Current @File Keep the file reference')
  assert.deepEqual(composer.snapshot().occurrences.map(item => [item.source, item.ref, item.offset]), [
    ['harbor', issued.contextSnapshotId, 0],
    ['file', 'file-1', '@Current '.length],
  ])
  assert.equal(client.clearStructuredHarborReferences(composer.input), true)
  assert.equal(composer.snapshot().draft, '@File Keep the file reference')
  assert.deepEqual(composer.snapshot().occurrences.map(item => [item.source, item.ref, item.offset]), [['file', 'file-1', 0]])
})

test('manual deletion of an observed Harbor chip is not normalized back into an invisible context', async () => {
  const client = await loadClient()
  const bridge = new client.HarborUiBridge()
  const composer = structuredInput({ draft: 'Keep my question' })
  const issued = {
    contextSnapshotId: 'hctx_manual_delete_abcdefghijklmnop',
    reference: '@harbor(hctx_manual_delete_abcdefghijklmnop)',
    label: 'Current',
  }
  bridge.update('session-a', { explicit: issued })
  assert.equal(client.replaceStructuredHarborReference(composer.input, issued), true)
  composer.input.setDraft('Keep my question')

  assert.equal(composer.snapshot().occurrences.length, 0)
  assert.equal(client.needsStructuredHarborNormalization(composer.snapshot().draft, composer.snapshot().occurrences, issued, true), false)
  bridge.clearExplicit('session-a', issued.contextSnapshotId)
  assert.equal(bridge.getSnapshot('session-a').explicit, undefined)
  assert.equal(composer.snapshot().draft, 'Keep my question')
})

test('a fresh Ask binding that settles after input becomes busy is discarded before touching the Draft', async t => {
  const client = await loadClient()
  const commits = []
  let resolveRequest
  let phase = 'plain'
  const previousFetch = globalThis.fetch
  globalThis.fetch = () => new Promise(resolve => { resolveRequest = resolve })
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  bridge.setCurrent('session-a', pageContext('busy-race'))
  const ask = (async () => {
    const issued = await bridge.issue('session-a', pageContext('busy-race'), { forceNew: true })
    return client.commitIssuedDraft(
      bridge,
      'session-a',
      issued,
      (value, prompt) => { commits.push({ value, prompt }); return true },
      '',
      phase,
      true,
    )
  })()
  await Promise.resolve()
  phase = 'submitting'
  resolveRequest(success({ contextSnapshotId: 'hctx_busy_race_abcdefghijklmnop', reference: '@harbor(hctx_busy_race_abcdefghijklmnop)', label: 'busy', expiresAt: '2099-01-01T00:00:00.000Z' }))

  assert.equal(await ask, false)
  assert.deepEqual(commits, [])
  assert.equal(bridge.getSnapshot('session-a').explicit, undefined)
  assert.equal(bridge.getSnapshot('session-a').status, 'idle')
})

test('Copilot projection is bounded by the exact Harbor token, sequence, and owning turn', async () => {
  const client = await loadClient()
  const token = 'hctx_exact_abcdefghijklmnopqrstuvwxyz'
  const nodes = [
    { kind: 'assistant', seq: 2, turn: 1, blocks: [{ kind: 'text', text: 'older answer' }] },
    { kind: 'user', seq: 3, content: [{ type: 'text', text: `<harbor-context-ref context-snapshot-id="${token}">context</harbor-context-ref> Why?` }] },
    { kind: 'tool-result', seq: 4, callId: 'call-1', content: [] },
    { kind: 'assistant', seq: 5, turn: 7, blocks: [{ kind: 'text', text: 'Harbor answer' }] },
    { kind: 'turn-error', seq: 6, turn: 99, message: 'different turn' },
    { kind: 'user', seq: 7, content: [{ type: 'text', text: 'unrelated follow-up' }] },
    { kind: 'assistant', seq: 8, turn: 8, blocks: [{ kind: 'text', text: 'unrelated answer' }] },
  ]

  const projection = client.harborTurnProjection(nodes, token)
  assert.equal(projection.anchorSeq, 3)
  assert.equal(projection.turn, 7)
  assert.equal(projection.active, false)
  assert.deepEqual(projection.nodes.map(node => node.seq), [4, 5])
  assert.deepEqual(client.harborTurnProjection(nodes, 'hctx_missing_abcdefghijklmnopqrstuvwxyz').nodes, [])
})

test('Copilot navigation accepts only schema-bound actions from the two trusted Harbor readers', async () => {
  const client = await loadClient()
  const action = { kind: 'harbor.navigate', actionId: 'nav-1', target: { route: 'harbor.job', job: 'job-a' } }

  assert.equal(client.toolUiAction([{
    kind: 'tool-result',
    call: { name: 'harbor_eval_result' },
    value: { schema: 'harbor-evidence/v1', uiAction: action },
  }]), undefined)
  assert.equal(client.toolUiAction([{
    kind: 'tool-result',
    call: { name: 'harbor_get_evidence' },
    value: { schema: 'attacker-controlled/v1', uiAction: action },
  }]), undefined)
  assert.deepEqual(client.toolUiAction([{
    kind: 'tool-result',
    call: { name: 'harbor_get_evidence' },
    value: { schema: 'harbor-evidence/v1', uiAction: action },
  }]), action)
  assert.deepEqual(client.trustedHarborUiAction('harbor_resolve_page_context', {
    schema: 'harbor-resolved-context/v1', uiAction: action,
  }), action)
})

test('typed navigation deduplicates only while active and can be used again after Back', async () => {
  const client = await loadClient()
  const bridge = new client.HarborUiBridge()
  const action = {
    kind: 'harbor.navigate',
    actionId: 'nav-repeatable',
    target: { route: 'harbor.trial.detail', job: 'job-a', trial: 'trial-a', detailTab: 'evidence' },
  }

  assert.equal(bridge.navigate('session-a', action, { force: true }), true)
  const firstNavigation = bridge.getSnapshot('session-a').navigation
  assert.notEqual(firstNavigation, action, 'each dispatch owns a fresh navigation envelope')
  assert.equal(bridge.navigate('session-a', action, { force: true }), false, 'an in-flight replay is idempotent')
  assert.equal(bridge.acknowledgeNavigation('session-a', action.actionId), true)
  assert.equal(bridge.getSnapshot('session-a').navigation, undefined)
  assert.equal(bridge.navigate('session-a', action, { force: true }), true, 'the same visible reference remains usable after returning')
  assert.notEqual(bridge.getSnapshot('session-a').navigation, firstNavigation)
  assert.equal(bridge.navigate('session-b', action, { force: true }), true, 'deduplication remains Session-scoped')
})

test('Copilot freshness accepts only a successful exact resolver result', async () => {
  const client = await loadClient()
  const resolved = { schema: 'harbor-resolved-context/v1', freshness: 'FRESH' }

  assert.equal(client.trustedHarborResolvedContext([{
    kind: 'tool-result', call: { name: 'harbor_get_evidence' }, value: resolved,
  }]), undefined)
  assert.equal(client.trustedHarborResolvedContext([{
    kind: 'tool-result', call: { name: 'harbor_resolve_page_context' }, isError: true, value: resolved,
  }]), undefined)
  assert.equal(client.trustedHarborResolvedContext([{
    kind: 'tool-result', call: { name: 'harbor_resolve_page_context' }, value: { ...resolved, schema: 'attacker-controlled/v1' },
  }]), undefined)
  assert.equal(client.trustedHarborResolvedContext([{
    kind: 'tool-result', call: { name: 'harbor_resolve_page_context' }, value: resolved,
  }]), resolved)
})

test('Copilot collects every trusted typed reference from the exact owning turn and derives its answer basis', async () => {
  const client = await loadClient()
  const token = 'hctx_refs_abcdefghijklmnopqrstuvwxyz'
  const observedAt = '2026-09-04T01:02:03.000Z'
  const objectAction = {
    kind: 'harbor.navigate', actionId: 'nav-object', label: 'View Trial',
    target: { route: 'harbor.trial.detail', job: 'job-a', trial: 'trial-a' },
  }
  const evidenceAction = (id, evidenceRef) => ({
    kind: 'harbor.navigate', actionId: id, label: `View ${evidenceRef}`,
    target: { route: 'harbor.trial.detail', job: 'job-a', trial: 'trial-a', criterion: 'quality', evidenceRef },
  })
  const nodes = [
    { kind: 'user', seq: 10, content: [{ type: 'text', text: `<harbor-context-ref context-snapshot-id="${token}">context</harbor-context-ref> Why?` }] },
    { kind: 'tool-result', seq: 11, call: { name: 'harbor_resolve_page_context' }, value: {
      schema: 'harbor-resolved-context/v1',
      basedOn: { artifactRevision: 'sha256:old', currentRevision: 'sha256:new', observedAt },
      context: { object: { kind: 'harbor.trial/v1', job: 'job-a', trial: 'trial-a' } },
      refs: { object: { kind: 'harbor.trial/v1', job: 'job-a', trial: 'trial-a' } },
      uiAction: objectAction,
    } },
    { kind: 'tool-result', seq: 12, call: { name: 'harbor_get_evidence' }, value: {
      schema: 'harbor-evidence/v1', artifactRevision: 'sha256:old',
      evidenceRef: { kind: 'harbor.evidence/v1', job: 'job-a', trial: 'trial-a', criterion: 'quality', evidenceRef: 'artifact-a' },
      evidence: { artifact: { available: true } }, uiAction: evidenceAction('nav-evidence-a', 'artifact-a'),
    } },
    { kind: 'tool-result', seq: 13, call: { name: 'harbor_get_evidence' }, value: {
      schema: 'harbor-evidence/v1', artifactRevision: 'sha256:old',
      evidenceRef: { kind: 'harbor.evidence/v1', job: 'job-a', trial: 'trial-a', criterion: 'quality', evidenceRef: 'artifact-b' },
      evidence: { artifact: { available: false } }, uiAction: evidenceAction('nav-evidence-b', 'artifact-b'),
    } },
    { kind: 'tool-result', seq: 14, call: { name: 'harbor_get_evidence' }, value: {
      schema: 'harbor-evidence/v1', uiAction: evidenceAction('nav-evidence-a', 'duplicate-must-not-render'),
    } },
    { kind: 'tool-result', seq: 15, call: { name: 'harbor_get_evidence' }, value: {
      schema: 'attacker-controlled/v1', uiAction: evidenceAction('nav-attacker', 'attacker'),
    } },
    { kind: 'tool-result', seq: 16, call: { name: 'harbor_get_evidence' }, isError: true, value: {
      schema: 'harbor-evidence/v1', uiAction: evidenceAction('nav-failed', 'failed'),
    } },
    { kind: 'assistant', seq: 17, turn: 44, blocks: [{ kind: 'text', text: 'Typed answer' }] },
    { kind: 'user', seq: 18, content: [{ type: 'text', text: 'next turn' }] },
    { kind: 'tool-result', seq: 19, call: { name: 'harbor_get_evidence' }, value: {
      schema: 'harbor-evidence/v1', uiAction: evidenceAction('nav-next-turn', 'next-turn'),
    } },
  ]

  const projection = client.harborTurnProjection(nodes, token)
  const references = client.trustedHarborReferences(projection.nodes)
  assert.deepEqual(references.map(item => item.action.actionId), ['nav-object', 'nav-evidence-a', 'nav-evidence-b'])
  assert.deepEqual(references.map(item => item.kind), ['object', 'evidence', 'evidence'])
  assert.equal(references[2].available, false)
  assert.deepEqual(client.harborAnswerBasis(client.trustedHarborResolvedContext(projection.nodes), references), {
    job: 'job-a', artifactRevision: 'sha256:old', currentRevision: 'sha256:new', observedAt,
  })
})

test('API and Trial UI state helpers preserve stable error identity and distinguish loading, error, and filters', async () => {
  const client = await loadClient()
  const observedAt = '2026-09-04T02:03:04.000Z'
  const apiError = client.harborApiError({ error: {
    code: 'HARBOR_TRIAL_NOT_FOUND', message: 'Trial is missing', nextStep: 'Reload the Job.',
  } }, 404, observedAt)
  assert.equal(apiError.code, 'HARBOR_TRIAL_NOT_FOUND')
  assert.equal(apiError.status, 404)

  const normalized = client.normalizeHarborUiError(apiError)
  assert.deepEqual(normalized, {
    code: 'HARBOR_TRIAL_NOT_FOUND', message: 'Trial is missing', observedAt,
    category: 'missing', nextStep: 'Reload the Job.', status: 404,
  })
  assert.deepEqual(client.trialDetailLoadingState('trial-a'), { status: 'loading', trial: 'trial-a' })
  assert.deepEqual(client.trialDetailErrorState('trial-a', apiError), { status: 'error', trial: 'trial-a', error: normalized })
  assert.equal(client.hasTrialFilters({ query: 'needle', status: '', validity: '' }), true)
  assert.equal(client.hasTrialFilters({ query: '  ', status: '', validity: '' }), false)
  assert.equal(client.hasTrialFilters({ query: '', status: 'completed', validity: '' }), true)
})

test('failed submit clears its marker so a later manual reference removal is not treated as sent', async () => {
  const client = await loadClient()
  const explicit = { contextSnapshotId: 'hctx_failed_abcdefghijklmnopqrstuvwxyz' }

  const submitting = client.harborSubmissionTransition(undefined, explicit, 'submitting', true)
  assert.equal(submitting.submitted, explicit)
  assert.equal(submitting.sent, undefined)

  const failed = client.harborSubmissionTransition(submitting.submitted, explicit, 'plain', true)
  assert.equal(failed.submitted, undefined)
  assert.equal(failed.sent, undefined)

  const manuallyCleared = client.harborSubmissionTransition(failed.submitted, explicit, 'plain', false)
  assert.equal(manuallyCleared.submitted, undefined)
  assert.equal(manuallyCleared.sent, undefined)
})

test('successful one-shot submit is marked sent only after the reference disappears', async () => {
  const client = await loadClient()
  const explicit = { contextSnapshotId: 'hctx_sent_abcdefghijklmnopqrstuvwxyz' }
  const submitting = client.harborSubmissionTransition(undefined, explicit, 'adjudicating', true)
  const completed = client.harborSubmissionTransition(submitting.submitted, explicit, 'plain', false)

  assert.equal(completed.submitted, undefined)
  assert.equal(completed.sent, explicit)
})

test('an observed reference cleared atomically at submit still produces one sent snapshot', async () => {
  const client = await loadClient()
  const explicit = { contextSnapshotId: 'hctx_atomic_abcdefghijklmnopqrstuvwxyz' }

  const effectiveDuringSubmit = client.effectiveHarborSubmissionReference(true, 'submitting', false)
  assert.equal(effectiveDuringSubmit, true)
  const submitting = client.harborSubmissionTransition(undefined, explicit, 'submitting', effectiveDuringSubmit)
  assert.equal(submitting.submitted, explicit)

  const effectiveAfterSubmit = client.effectiveHarborSubmissionReference(true, 'plain', false)
  assert.equal(effectiveAfterSubmit, false)
  const completed = client.harborSubmissionTransition(submitting.submitted, explicit, 'plain', effectiveAfterSubmit)
  assert.equal(completed.sent, explicit)
})

test('row Ask freezes an explicit snapshot without replacing Base Context and keeps page generations monotonic', async t => {
  const client = await loadClient()
  const pending = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = (_url, options) => new Promise(resolve => pending.push({ body: JSON.parse(options.body), resolve }))
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  const base = { ...pageContext('base'), pageSessionId: 'page-shared' }
  const row = { ...pageContext('row'), pageSessionId: 'page-shared' }
  const published = bridge.setCurrent('session-a', base)
  assert.equal(published.generation, 1)

  const binding = bridge.issue('session-a', row)
  await Promise.resolve()
  assert.equal(pending.length, 1)
  assert.equal(pending[0].body.context.object.id, 'row')
  assert.equal(pending[0].body.context.generation, 2)
  assert.equal(bridge.getSnapshot('session-a').current.object.id, 'base')

  pending[0].resolve(success({ contextSnapshotId: 'hctx_row_abcdefghijklmnopqrstuvwxyz', reference: '@harbor(hctx_row_abcdefghijklmnopqrstuvwxyz)', label: 'row', expiresAt: '2099-01-01T00:00:00.000Z' }))
  await binding
  assert.equal(bridge.getSnapshot('session-a').current.object.id, 'base')
  assert.equal(bridge.getSnapshot('session-a').explicit.context.object.id, 'row')

  const nextBase = bridge.setCurrent('session-a', { ...pageContext('next-base'), pageSessionId: 'page-shared' })
  assert.equal(nextBase.generation, 3)
})

test('same-page snapshot issuance is serialized in generation order to avoid Host CAS conflicts', async t => {
  const client = await loadClient()
  const pending = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = (_url, options) => new Promise(resolve => pending.push({ body: JSON.parse(options.body), resolve }))
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  bridge.setCurrent('session-a', { ...pageContext('base'), pageSessionId: 'page-shared' })
  const first = bridge.issue('session-a', { ...pageContext('first'), pageSessionId: 'page-shared' })
  const second = bridge.issue('session-a', { ...pageContext('second'), pageSessionId: 'page-shared' })
  await Promise.resolve()
  assert.equal(pending.length, 1)
  assert.equal(pending[0].body.context.generation, 2)

  pending[0].resolve(success({ contextSnapshotId: 'hctx_first_abcdefghijklmnopqrstuvwxyz', reference: '@harbor(hctx_first_abcdefghijklmnopqrstuvwxyz)', label: 'first', expiresAt: '2099-01-01T00:00:00.000Z' }))
  await first
  await Promise.resolve()
  assert.equal(pending.length, 2)
  assert.equal(pending[1].body.context.generation, 3)
  pending[1].resolve(success({ contextSnapshotId: 'hctx_second_abcdefghijklmnopqrstuvwxyz', reference: '@harbor(hctx_second_abcdefghijklmnopqrstuvwxyz)', label: 'second', expiresAt: '2099-01-01T00:00:00.000Z' }))
  await second
  assert.equal(bridge.getSnapshot('session-a').explicit.label, 'second')
})

test('autocomplete reuses one unexpired issued snapshot without exhausting registry capacity', async t => {
  const client = await loadClient()
  let fetchCount = 0
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => {
    fetchCount += 1
    return success({ contextSnapshotId: 'hctx_cached_abcdefghijklmnopqrstuvwxyz', reference: '@harbor(hctx_cached_abcdefghijklmnopqrstuvwxyz)', label: 'cached', expiresAt: '2099-01-01T00:00:00.000Z' })
  }
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  const context = pageContext('autocomplete')
  const results = []
  for (let index = 0; index < 150; index += 1) results.push(await bridge.issue('session-a', context, { activate: false }))

  assert.equal(fetchCount, 1)
  assert.equal(new Set(results.map(item => item.contextSnapshotId)).size, 1)
  assert.equal(results.at(-1).context.generation, 1)
})

test('an explicit fresh binding never reuses the autocomplete snapshot', async t => {
  const client = await loadClient()
  let fetchCount = 0
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => {
    fetchCount += 1
    const token = `hctx_fresh_${fetchCount}_abcdefghijklmnopqrst`
    return success({ contextSnapshotId: token, reference: `@harbor(${token})`, label: `fresh-${fetchCount}`, expiresAt: '2099-01-01T00:00:00.000Z' })
  }
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  const context = pageContext('fresh')
  const autocomplete = await bridge.issue('session-a', context, { activate: false })
  const explicit = await bridge.issue('session-a', context, { forceNew: true })

  assert.equal(fetchCount, 2)
  assert.notEqual(explicit.contextSnapshotId, autocomplete.contextSnapshotId)
  assert.equal(explicit.context.generation, 2)
})

test('clearing while a binding is in flight prevents the response from resurrecting explicit context', async t => {
  const client = await loadClient()
  let resolveRequest
  const previousFetch = globalThis.fetch
  globalThis.fetch = () => new Promise(resolve => { resolveRequest = resolve })
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  bridge.setCurrent('session-a', pageContext('base'))
  const binding = bridge.issue('session-a', pageContext('base'))
  await Promise.resolve()
  bridge.clearExplicit('session-a')
  resolveRequest(success({ contextSnapshotId: 'hctx_late_abcdefghijklmnopqrstuvwxyz', reference: '@harbor(hctx_late_abcdefghijklmnopqrstuvwxyz)', label: 'late', expiresAt: '2099-01-01T00:00:00.000Z' }))
  await binding

  assert.equal(bridge.getSnapshot('session-a').explicit, undefined)
  assert.equal(bridge.getSnapshot('session-a').status, 'idle')
})

test('activating an @harbor menu snapshot invalidates an older in-flight Ask', async t => {
  const client = await loadClient()
  const pending = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = (_url, options) => new Promise(resolve => pending.push({ body: JSON.parse(options.body), resolve }))
  t.after(() => { globalThis.fetch = previousFetch })

  const bridge = new client.HarborUiBridge()
  bridge.setCurrent('session-a', { ...pageContext('base'), pageSessionId: 'page-shared' })
  const menuPromise = bridge.issue('session-a', { ...pageContext('menu'), pageSessionId: 'page-shared' }, { activate: false })
  await Promise.resolve()
  pending[0].resolve(success({ contextSnapshotId: 'hctx_menu_abcdefghijklmnopqrstuvwxyz', reference: '@harbor(hctx_menu_abcdefghijklmnopqrstuvwxyz)', label: 'menu', expiresAt: '2099-01-01T00:00:00.000Z' }))
  const menu = await menuPromise

  const olderAsk = bridge.issue('session-a', { ...pageContext('ask'), pageSessionId: 'page-shared' })
  await Promise.resolve()
  bridge.activateExplicit('session-a', menu)
  pending[1].resolve(success({ contextSnapshotId: 'hctx_ask_abcdefghijklmnopqrstuvwxyz', reference: '@harbor(hctx_ask_abcdefghijklmnopqrstuvwxyz)', label: 'ask', expiresAt: '2099-01-01T00:00:00.000Z' }))
  await olderAsk
  assert.equal(bridge.getSnapshot('session-a').explicit.contextSnapshotId, menu.contextSnapshotId)
})

test('observed reference removal, expiry, evidence ownership, and navigation restoration are explicit', async () => {
  const client = await loadClient()

  assert.equal(client.shouldClearObservedExplicit(false, 'plain', false, undefined), false, 'initial issue-to-draft gap is not a removal')
  assert.equal(client.shouldClearObservedExplicit(true, 'plain', false, undefined), true, 'an observed token removed in plain phase clears its exact capsule')
  assert.equal(client.shouldClearObservedExplicit(true, 'submitting', false, undefined), false)
  assert.equal(client.isExplicitContextExpired('2026-01-01T00:00:00.000Z', Date.parse('2026-01-02T00:00:00.000Z')), true)
  assert.equal(client.isExplicitContextExpired('2099-01-01T00:00:00.000Z', Date.parse('2026-01-02T00:00:00.000Z')), false)

  const criteria = [
    { id: 'quality', evidence_refs: ['unique', 'shared'] },
    { id: 'safety', evidence_refs: ['shared'] },
  ]
  assert.deepEqual(client.evidenceCriterionOwners(criteria, 'unique'), ['quality'])
  assert.deepEqual(client.evidenceCriterionOwners(criteria, 'shared'), ['quality', 'safety'])
  assert.deepEqual(client.evidenceCriterionOwners(criteria, 'missing'), [])

  const qualityEvidence = client.evidenceFocusKey('quality', 'shared')
  const safetyEvidence = client.evidenceFocusKey('safety', 'shared')
  assert.notEqual(qualityEvidence, safetyEvidence, 'duplicate refs must resolve to distinct Criterion-scoped DOM targets')
  assert.equal(client.isEvidenceFocused({ criterion: 'quality', evidenceRef: 'shared' }, 'quality', 'shared'), true)
  assert.equal(client.isEvidenceFocused({ criterion: 'quality', evidenceRef: 'shared' }, 'safety', 'shared'), false)

  assert.deepEqual(client.trialNavigationView({
    filters: { query: 'needle', status: 'completed', validity: 'false' },
    sort: 'lowest-score', detailTab: 'evidence', criterion: 'quality', evidenceRef: 'unique',
  }), {
    filters: { query: 'needle', status: 'completed', validity: 'false' },
    sort: 'lowest-score',
    focus: { criterion: 'quality', evidenceRef: 'unique' },
  })
  assert.deepEqual(client.trialNavigationView({ filters: { status: 'unsafe-value' }, sort: 'unsafe-sort' }, { query: 'must-not-leak', status: 'running-agent', validity: 'true', sort: 'errors' }), {
    filters: { query: '', status: '', validity: '' },
    sort: 'dataset-order',
    focus: {},
  }, 'an authoritative typed route must reset omitted or invalid filters instead of inheriting the current page')

  assert.deepEqual(client.trialRestoreView({
    trial: 'trial-before-navigation',
    focus: { criterion: 'quality', evidenceRef: 'unique' },
    filters: { query: 'needle', status: 'completed', validity: 'false' },
    sort: 'lowest-score',
    offset: 100,
  }), {
    trial: 'trial-before-navigation',
    filters: { query: 'needle', status: 'completed', validity: 'false' },
    sort: 'lowest-score',
    focus: { criterion: 'quality', evidenceRef: 'unique' },
    offset: 100,
  })
  const historyEntry = client.navigationHistoryEntry(
    { job: 'job-before-navigation', workspace: 'workspace-a', navigation: { actionId: 'old-action' } },
    'workspace-a',
    20,
    { stage: 'judge', trialView: { trial: 'trial-before-navigation' }, scrollTop: 640 },
  )
  assert.deepEqual(historyEntry.selected, { job: 'job-before-navigation', workspace: 'workspace-a' }, 'history never replays an old navigation action')
  assert.deepEqual(client.restoreNavigationSelection(historyEntry, 'restore-1', true), {
    job: 'job-before-navigation',
    workspace: 'workspace-a',
    restoreView: { stage: 'judge', trialView: { trial: 'trial-before-navigation' }, scrollTop: 640, restoreId: 'restore-1' },
    fromNavigation: true,
  })
  const transition = { actionId: 'nav-once', target: { trial: 'trial-a' } }
  const transientSelection = { job: 'job-a', workspace: 'workspace-a', navigation: transition, fromNavigation: true }
  assert.deepEqual(client.clearConsumedNavigation(transientSelection, transition), {
    job: 'job-a', workspace: 'workspace-a', fromNavigation: true,
  }, 'a consumed typed transition must not remain attached to the selected Job')
  assert.equal(client.clearConsumedNavigation(transientSelection, { ...transition }), transientSelection, 'an older timer cannot clear a newer replay with the same actionId')
  const sessionHistoryEntry = client.navigationHistoryEntry(undefined, 'workspace-a', 20, { scrollTop: 640 }, 'session-a')
  assert.equal(client.ownsNavigationHistoryEntry(sessionHistoryEntry, 'session-a'), true)
  assert.equal(client.ownsNavigationHistoryEntry(sessionHistoryEntry, 'session-b'), false, 'Back must never restore another Session history entry')
  assert.deepEqual(
    client.comparisonCandidates('candidate-job', [{ name: 'candidate-job' }, { name: 'visible-baseline' }], 'off-page-baseline').map(item => item.name),
    ['visible-baseline', 'off-page-baseline'],
    'an exact typed Baseline must remain selectable even when it is outside the current paginated Job list',
  )

  const baseContext = { sessionId: 'session-a', pageSessionId: 'page-a', workspace: 'workspace-a', job: 'job-a', detail: { artifacts: { stack: { components: { evaluator: { id: 'evaluator-a' } } } } } }
  assert.deepEqual(client.harborContextFilters({ query: 'private user search', status: 'completed', validity: 'false', segment: 'regression', unexpected: 'drop-me' }), {
    status: 'completed', validity: 'false', segment: 'regression',
  })
  const filteredTrialContext = client.buildUiContext({ ...baseContext, stage: 'judge', trial: 'trial-filtered', filters: { query: 'private user search', status: 'completed', validity: 'false' } })
  assert.deepEqual(filteredTrialContext.viewState.filters, { status: 'completed', validity: 'false' })
  assert.doesNotMatch(JSON.stringify(filteredTrialContext), /private user search/, 'free-text search remains local view state and never enters the Host context payload')
  const candidateContext = client.buildUiContext({ ...baseContext, stage: 'candidate', jobSummary: { candidate: { candidate_id: 'candidate-a' } } })
  assert.deepEqual(candidateContext.route, { name: 'harbor.job', params: { job: 'job-a', stage: 'candidate' } })
  assert.deepEqual(candidateContext.object, { kind: 'candidate', id: 'candidate-a', job: 'job-a', stage: 'candidate' })
  assert.equal(normalizeHarborUiContext(candidateContext, 'session-a').object.kind, 'candidate')
  const datasetContext = client.buildUiContext({ ...baseContext, stage: 'dataset', jobSummary: { dataset: { dataset_id: 'dataset-a' } } })
  assert.deepEqual(datasetContext.route, { name: 'harbor.job', params: { job: 'job-a', stage: 'dataset' } })
  assert.deepEqual(datasetContext.object, { kind: 'dataset', id: 'dataset-a', job: 'job-a', stage: 'dataset' })
  assert.equal(normalizeHarborUiContext(datasetContext, 'session-a').object.kind, 'dataset')
  const evaluatorContext = client.buildUiContext({ ...baseContext, stage: 'judge' })
  assert.deepEqual(evaluatorContext.route, { name: 'harbor.evaluator', params: { job: 'job-a', stage: 'judge' } })
  assert.equal(evaluatorContext.object.kind, 'evaluator')
  assert.equal(normalizeHarborUiContext(evaluatorContext, 'session-a').route.name, 'harbor.evaluator')
  const unresolvedJudgeContext = client.buildUiContext({ ...baseContext, detail: undefined, stage: 'judge' })
  assert.deepEqual(unresolvedJudgeContext.route, { name: 'harbor.job', params: { job: 'job-a', stage: 'judge' } })
  assert.deepEqual(unresolvedJudgeContext.object, { kind: 'job', id: 'job-a', job: 'job-a', stage: 'judge' })
  assert.equal(normalizeHarborUiContext(unresolvedJudgeContext, 'session-a').route.name, 'harbor.job')
  const unresolvedGateContext = client.buildUiContext({ ...baseContext, stage: 'gate' })
  assert.deepEqual(unresolvedGateContext.route, { name: 'harbor.job', params: { job: 'job-a', stage: 'gate' } })
  assert.deepEqual(unresolvedGateContext.object, { kind: 'job', id: 'job-a', job: 'job-a', stage: 'gate' })

  const comparison = {
    baselineJob: 'job-baseline', candidateJob: 'job-a', comparable: false,
    comparisonDigest: `sha256:${'c'.repeat(64)}`,
  }
  const compareContext = client.buildUiContext({ ...baseContext, stage: 'gate', comparison })
  assert.deepEqual(compareContext.route, { name: 'harbor.compare', params: { job: 'job-a', stage: 'gate', baseline: 'job-baseline', candidate: 'job-a' } })
  assert.deepEqual(compareContext.object, {
    kind: 'compare', id: comparison.comparisonDigest, job: 'job-a', stage: 'gate',
    baseline: 'job-baseline', candidate: 'job-a', comparisonDigest: comparison.comparisonDigest,
  })
  assert.equal(compareContext.flags.comparable, false)
  assert.equal(normalizeHarborUiContext(compareContext, 'session-a').route.name, 'harbor.compare')

  const gate = {
    baseline: 'job-baseline', candidate: 'job-a', policy: 'quality-policy', policyVersion: '2.0.0',
    policyDigest: `sha256:${'d'.repeat(64)}`, reportDigest: `sha256:${'e'.repeat(64)}`,
  }
  const gateContext = client.buildUiContext({ ...baseContext, stage: 'gate', gate })
  assert.deepEqual(gateContext.route, { name: 'harbor.gate', params: { job: 'job-a', stage: 'gate', ...gate } })
  assert.deepEqual(gateContext.object, { kind: 'gate', id: gate.reportDigest, job: 'job-a', stage: 'gate', ...gate })
  assert.equal(normalizeHarborUiContext(gateContext, 'session-a').route.name, 'harbor.gate')

  const invalidTrialContext = client.buildUiContext({
    ...baseContext,
    stage: 'judge',
    trial: 'trial-error',
    detail: { lifecycle: { score: { value: undefined, valid: false, invalid_reasons: ['infrastructure-error'] } } },
  })
  assert.equal(invalidTrialContext.flags.scoreValid, false, 'a lifecycle-only infrastructure failure must remain visibly score-invalid')
})

test('Trial detail responses only belong to the live component and latest request epoch', async () => {
  const client = await loadClient()

  assert.equal(client.ownsTrialRequest(true, 3, 3), true)
  assert.equal(client.ownsTrialRequest(true, 4, 3), false, 'a newer selection revokes the older response')
  assert.equal(client.ownsTrialRequest(false, 3, 3), false, 'unmount revokes the response even when its epoch matches')
})

test('Governance responses and Evaluator saves stay bound to the active workspace and Job', async () => {
  const client = await loadClient()
  const jobA = client.governanceRequestKey('workspace-a', 'job-a')
  const jobB = client.governanceRequestKey('workspace-a', 'job-b')
  const pending = new Map()
  let activeKey = jobA
  let currentEpoch = 0
  let state
  const deferred = key => new Promise(resolve => pending.set(key, resolve))
  const load = (key, promise) => {
    const requestEpoch = ++currentEpoch
    return promise.then(value => {
      if (client.ownsGovernanceRequest(activeKey, key, currentEpoch, requestEpoch)) state = { requestKey: key, value }
    })
  }

  const older = load(jobA, deferred(jobA))
  activeKey = jobB
  const newer = load(jobB, deferred(jobB))
  pending.get(jobB)({ evaluator: 'job-b' })
  await newer
  pending.get(jobA)({ evaluator: 'job-a' })
  await older

  assert.deepEqual(state, { requestKey: jobB, value: { evaluator: 'job-b' } })
  assert.equal(client.ownsGovernanceBinding(activeKey, jobB), true)
  assert.equal(client.ownsGovernanceBinding(activeKey, jobA), false, 'a stale Job editor must not remain save-eligible')
  assert.notEqual(client.governanceRequestKey('workspace-a', 'job-a'), client.governanceRequestKey('workspace-b', 'job-a'), 'workspace identity is part of the binding')
})

test('Trial list polling retains only same-query rows as stale and clears the marker after recovery', async () => {
  const client = await loadClient()
  const page = { total: 1, items: [{ id: 'trial-a' }] }
  const ready = client.trialListSuccessState('request-a', page)
  const failed = client.trialListFailureState(ready, 'request-a', new Error('network unavailable'))

  assert.equal(failed.status, 'ready')
  assert.equal(failed.stale, true)
  assert.equal(failed.page, page)
  assert.equal(failed.error, 'network unavailable')

  const differentRequest = client.trialListFailureState(ready, 'request-b', new Error('not found'))
  assert.equal(differentRequest.status, 'error')
  assert.equal(differentRequest.stale, false)
  assert.equal(differentRequest.page, undefined)

  const recovered = client.trialListSuccessState('request-a', { total: 0, items: [] })
  assert.equal(recovered.stale, false)
  assert.equal(recovered.error, undefined)
})

test('dashboard polling marks retained data stale only after repeated failures and thirty seconds', async () => {
  const client = await loadClient()
  const lastSuccessAt = 1_000
  const first = client.dashboardFailureState({ value: { overview: {} }, consecutiveFailures: 0, lastSuccessAt }, 20_000)
  assert.equal(first.consecutiveFailures, 1)
  assert.equal(first.stale, false)
  const secondTooSoon = client.dashboardFailureState({ value: { overview: {} }, consecutiveFailures: 1, lastSuccessAt }, 30_000)
  assert.equal(secondTooSoon.consecutiveFailures, 2)
  assert.equal(secondTooSoon.stale, false)
  const repeatedAndOld = client.dashboardFailureState({ value: { overview: {} }, consecutiveFailures: 2, lastSuccessAt }, 32_000)
  assert.equal(repeatedAndOld.consecutiveFailures, 3)
  assert.equal(repeatedAndOld.stale, true)
})

test('Workbench polling keeps the last usable Job and structured error until recovery', async () => {
  const client = await loadClient()
  const job = { job: 'job-a', artifacts: { summary: { status: 'running' } } }
  const ready = client.workbenchSuccessState(job, 1_000)
  const firstFailure = client.workbenchFailureState(
    ready,
    Object.assign(new Error('temporary outage'), { code: 'HARBOR_NETWORK_ERROR', status: 503 }),
    20_000,
  )

  assert.equal(firstFailure.status, 'ready')
  assert.equal(firstFailure.value, job, 'a background failure must not unmount the active Workbench subtree')
  assert.deepEqual(firstFailure.error, {
    code: 'HARBOR_NETWORK_ERROR',
    message: 'temporary outage',
    observedAt: '1970-01-01T00:00:20.000Z',
    category: 'retry',
    status: 503,
  })
  assert.equal(firstFailure.stale, false)

  const repeatedAndOld = client.workbenchFailureState(firstFailure, new Error('still unavailable'), 32_000)
  assert.equal(repeatedAndOld.status, 'ready')
  assert.equal(repeatedAndOld.value, job)
  assert.equal(repeatedAndOld.stale, true)

  const recovered = client.workbenchSuccessState({ ...job, revision: 2 }, 33_000)
  assert.equal(recovered.error, undefined)
  assert.equal(recovered.stale, false)
  assert.equal(recovered.consecutiveFailures, 0)

  const initialFailure = client.workbenchFailureState(undefined, new Error('offline'), 40_000)
  assert.equal(initialFailure.status, 'error', 'only an initial load without retained data may replace the Workbench with an error state')
  assert.equal(initialFailure.value, undefined)
})
