import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import {
  SessionSelectionTokenStore,
  selectRecentSessions,
  verifySessionSnapshot,
} from '../lib/session-selection.js'
import { buildSessionObservation } from '../lib/session-redaction.js'

const ROOT = path.resolve('/tmp/hse-session-selection')

function snapshot(id, { cwd = ROOT, createdAt = 1_000, lastAt = 2_000, open = false, human = true, assistant = true, harbor = false, reason = 'completed', header = {}, selectedPresets = [] } = {}) {
  const events = selectedPresets.map((agentPreset, index) => ({
    type: 'agent-preset/selected', seq: index, time: createdAt + index,
    data: { agentPreset },
  }))
  events.push({ type: 'turn/start', seq: events.length, time: createdAt + events.length, data: { turn: 0 } })
  if (human) {
    events.push({
      type: 'user/message', seq: events.length, time: createdAt + 1,
      surfaceOp: 'append',
      data: { id: `${id}-u`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'goal' }] },
    })
  }
  if (assistant) {
    events.push({
      type: 'assistant/message', seq: events.length, time: createdAt + 2,
      surfaceOp: 'append',
      data: { turn: 0, step: 0, message: { id: `${id}-a`, role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' }, content: [{ type: 'text', text: 'done' }] } },
    })
  }
  if (harbor) events.push({ type: 'tool/call', seq: events.length, time: createdAt + 3, data: { name: typeof harbor === 'string' ? harbor : 'harbor_session_diagnostic_preview', callId: 'h', arguments: '{}' } })
  if (!open) events.push({ type: 'turn/end', seq: events.length, time: lastAt, data: { turn: 0, reason: { kind: reason } } })
  return {
    session: { version: 0, id, createdAt, cwd, ...header },
    events,
  }
}

function queryFor(snapshots) {
  const byId = new Map(snapshots.map(value => [value.session.id, value]))
  return {
    async filterSessions() {
      return snapshots.map(value => ({ header: value.session, live: false, persisted: true }))
    },
    async readSession(id) { return structuredClone(byId.get(id)) },
  }
}

test('selection enforces lineage boundaries and sorts by last activity, not creation', async () => {
  const values = [
    snapshot('current', { lastAt: 9_000 }),
    snapshot('outside', { cwd: '/tmp/other', lastAt: 10_000 }),
    snapshot('sub', { header: { origin: 'subagent' }, lastAt: 8_000 }),
    snapshot('fork', { header: { parentSession: 'parent', seedLength: 2 }, lastAt: 7_000 }),
    snapshot('child', { header: { delegationDepth: 1 }, lastAt: 6_000 }),
    snapshot('open', { open: true }),
    snapshot('aborted', { reason: 'aborted' }),
    snapshot('no-human', { human: false }),
    snapshot('no-assistant', { assistant: false }),
    snapshot('harbor', { harbor: 'harbor_eval_run' }),
    snapshot('harbor-preset', { header: { agentPreset: 'harbor-internal-evaluator' } }),
    snapshot('older-created-newest-active', { createdAt: 100, lastAt: 5_000 }),
    snapshot('newer-created-older-active', { createdAt: 4_000, lastAt: 4_500 }),
  ]
  const result = await selectRecentSessions({
    sessionQuery: queryFor(values), projectRoot: ROOT, currentSessionId: 'current', limit: 10,
  })

  assert.deepEqual(result.selected.map(item => item.rawSessionId), [
    'older-created-newest-active', 'newer-created-older-active',
  ])
  assert.equal(result.excludedCounts.currentSession, 1)
  assert.equal(result.excludedCounts.outsideWorkspace, 1)
  assert.equal(result.excludedCounts.subagent, 1)
  assert.equal(result.excludedCounts.forkOrChild, 2)
  assert.equal(result.excludedCounts.openTurn, 1)
  assert.equal(result.excludedCounts.userAborted, 1)
  assert.equal(result.excludedCounts.noDirectHumanInput, 1)
  assert.equal(result.excludedCounts.noAssistantOutput, 1)
  assert.equal(result.excludedCounts.harborInternal, 2)
  assert.doesNotMatch(JSON.stringify(result.publicSelected), /older-created|newer-created/)
})

test('public Historical Preview identities redact every shared credential family', async () => {
  const values = [
    ['preset-url', 'https://alice:supersecret@example.com'],
    ['model-github', 'github_pat_abcdefghijklmnopqrstuvwxyz123456'],
    ['model-slack', ['xoxb', '1234567890', 'syntheticfixtureonly'].join('-')],
    ['model-jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signaturepart'],
    ['model-aws', 'ASIA1234567890ABCDEF'],
    ['model-pem', '-----BEGIN PRIVATE KEY-----\nopaque-private-material-without-footer'],
  ].map(([id, identity], index) => {
    const value = snapshot(id, { createdAt: 1_000 + index, lastAt: 3_000 + index, header: { agentPreset: identity } })
    value.events.find(event => event.type === 'assistant/message').data.message.source.model = identity
    return value
  })

  const result = await selectRecentSessions({
    sessionQuery: queryFor(values), projectRoot: ROOT, currentSessionId: 'current', limit: 10,
  })
  const serialized = JSON.stringify(result.publicSelected)

  assert.ok(result.publicSelected.every(item => item.agentPreset === '[redacted-identity]'))
  assert.ok(result.publicSelected.every(item => item.modelRoutes[0].model === '[redacted-identity]'))
  assert.doesNotMatch(serialized, /supersecret|github_pat_|syntheticfixtureonly|eyJ|ASIA1234|opaque-private-material/)
})

test('selection is bounded before exact Session reads', async () => {
  const values = Array.from({ length: 3 }, (_, index) => snapshot(`s-${index}`))
  await assert.rejects(
    selectRecentSessions({ sessionQuery: queryFor(values), projectRoot: ROOT, currentSessionId: 'current', maxSessionReads: 2 }),
    /SESSION_SELECTION_TOO_EXPENSIVE/,
  )
})

test('DSH history discovers completed sessions independently of the output workspace', async () => {
  const otherRoot = '/tmp/dsh-business-project'
  const completed = snapshot('business-history', { cwd: otherRoot, lastAt: 4_000 })
  const current = snapshot('active-conversation', { cwd: otherRoot, lastAt: 5_000 })
  const query = queryFor([completed, current])
  const filters = []
  const filterSessions = query.filterSessions
  query.filterSessions = async applied => {
    filters.push(applied)
    return filterSessions()
  }

  const result = await selectRecentSessions({
    sessionQuery: query, projectRoot: ROOT, currentSessionId: current.session.id, scope: 'dsh-history',
  })

  assert.deepEqual(filters, [[]])
  assert.deepEqual(result.selected.map(item => item.rawSessionId), [completed.session.id])
  assert.equal(result.selected[0].header.cwd, otherRoot)
  assert.equal(result.excludedCounts.currentSession, 1)
  assert.equal(result.excludedCounts.outsideWorkspace, 0)
  assert.equal(result.scan.partial, false)
  assert.equal(verifySessionSnapshot(result.selected[0], completed, otherRoot), true)
  assert.equal(verifySessionSnapshot(result.selected[0], completed, ROOT), false)
  assert.doesNotMatch(JSON.stringify(result.publicSelected), /business-history|dsh-business-project|active-conversation|goal|done/)

  const defaultResult = await selectRecentSessions({ sessionQuery: query, projectRoot: ROOT })
  assert.equal(defaultResult.selected.length, 0)
  assert.equal(defaultResult.excludedCounts.outsideWorkspace, 2)
  assert.deepEqual(filters[1], [{ kind: 'cwd', values: [ROOT] }])
})

test('DSH history can use list-only query services without losing cross-project discovery', async () => {
  const value = snapshot('other-workspace', { cwd: '/tmp/other-workspace' })
  const query = queryFor([value])
  query.listSessions = query.filterSessions
  delete query.filterSessions

  const result = await selectRecentSessions({ sessionQuery: query, projectRoot: ROOT, scope: 'dsh-history' })
  assert.equal(result.selected[0].rawSessionId, value.session.id)
})

test('DSH history bounds the newest-created window and ranks exact activity only inside it', async () => {
  const values = [
    snapshot('old-recently-active', { createdAt: 100, lastAt: 30_000 }),
    snapshot('newest-created', { createdAt: 400, lastAt: 5_000 }),
    snapshot('older-created', { createdAt: 200, lastAt: 10_000 }),
    snapshot('window-most-active', { createdAt: 300, lastAt: 20_000 }),
  ]
  const query = queryFor(values)
  const reads = []
  const readSession = query.readSession
  query.readSession = async id => { reads.push(id); return readSession(id) }

  const result = await selectRecentSessions({ sessionQuery: query, projectRoot: ROOT, scope: 'dsh-history', maxSessionReads: 2 })

  assert.deepEqual(reads, ['newest-created', 'window-most-active'])
  assert.deepEqual(result.selected.map(item => item.rawSessionId), ['window-most-active', 'newest-created'])
  assert.deepEqual(result.scan, {
    scope: 'dsh-history', listedCount: 4, candidateCount: 4, readCount: 2, unscannedCount: 2,
    partial: true, windowOrder: 'created-at-desc', selectionOrder: 'last-activity-desc',
  })
  assert.match(result.warnings.join(' '), /2 older candidate\(s\) were not read/)
  assert.match(result.warnings.join(' '), /not across all DSH history/)
})

test('an exhausted DSH history window is explicitly partial even with no eligible result', async () => {
  const values = [
    snapshot('older-completed', { createdAt: 100 }),
    snapshot('newer-open', { createdAt: 200, open: true }),
    snapshot('newest-aborted', { createdAt: 300, reason: 'aborted' }),
  ]
  const result = await selectRecentSessions({
    sessionQuery: queryFor(values), projectRoot: ROOT, scope: 'dsh-history', maxSessionReads: 2,
  })
  assert.equal(result.selected.length, 0)
  assert.equal(result.scan.partial, true)
  assert.equal(result.scan.unscannedCount, 1)
  assert.equal(result.excludedCounts.openTurn, 1)
  assert.equal(result.excludedCounts.userAborted, 1)
  assert.match(result.warnings.join(' '), /older candidate\(s\) were not read/)
})

test('quick experience stops after enough eligible history instead of reading the entire budget', async () => {
  const values = Array.from({ length: 150 }, (_, index) => snapshot(`history-${index}`, {
    createdAt: 1_000 + index, lastAt: 5_000 + index,
  }))
  const query = queryFor(values)
  const reads = []
  const readSession = query.readSession
  query.readSession = async id => { reads.push(id); return readSession(id) }
  const result = await selectRecentSessions({
    sessionQuery: query, projectRoot: ROOT, scope: 'dsh-history', limit: 3,
    maxSessionReads: 100, concurrency: 4,
  })
  assert.equal(reads.length, 4)
  assert.deepEqual(reads, ['history-149', 'history-148', 'history-147', 'history-146'])
  assert.equal(result.selected.length, 3)
  assert.equal(result.scan.readCount, 4)
  assert.equal(result.scan.unscannedCount, 146)
  assert.equal(result.scan.partial, true)
})

test('history skips a rejected batch and continues until enough eligible samples are found', async () => {
  const values = [
    snapshot('oldest-complete', { createdAt: 100 }),
    snapshot('older-complete', { createdAt: 200 }),
    snapshot('newer-open', { createdAt: 300, open: true }),
    snapshot('newest-internal', { createdAt: 400, harbor: true }),
  ]
  const result = await selectRecentSessions({
    sessionQuery: queryFor(values), projectRoot: ROOT, scope: 'dsh-history', limit: 1, concurrency: 2,
  })
  assert.equal(result.selected.length, 1)
  assert.equal(result.scan.readCount, 4)
  assert.equal(result.scan.partial, false)
  assert.equal(result.excludedCounts.openTurn, 1)
  assert.equal(result.excludedCounts.harborInternal, 1)
})

test('DSH history retains lineage, direct-input and internal evaluation exclusions across workspaces', async () => {
  const values = [
    snapshot('sub', { header: { origin: 'subagent' } }),
    snapshot('fork', { header: { parentSession: 'parent', seedLength: 2 } }),
    snapshot('child', { header: { delegationDepth: 1 } }),
    snapshot('open', { open: true }),
    snapshot('aborted', { reason: 'aborted' }),
    snapshot('no-human', { human: false }),
    snapshot('no-assistant', { assistant: false }),
    snapshot('harbor', { harbor: 'harbor_eval_run' }),
    snapshot('harbor-preset', { selectedPresets: ['harbor-internal-evaluator'] }),
    snapshot('valid'),
  ].map(value => ({ ...value, session: { ...value.session, cwd: '/tmp/another-business-project' } }))
  const result = await selectRecentSessions({ sessionQuery: queryFor(values), projectRoot: ROOT, scope: 'dsh-history' })
  assert.deepEqual(result.selected.map(item => item.rawSessionId), ['valid'])
  assert.equal(result.excludedCounts.subagent, 1)
  assert.equal(result.excludedCounts.forkOrChild, 2)
  assert.equal(result.excludedCounts.openTurn, 1)
  assert.equal(result.excludedCounts.userAborted, 1)
  assert.equal(result.excludedCounts.noDirectHumanInput, 1)
  assert.equal(result.excludedCounts.noAssistantOutput, 1)
  assert.equal(result.excludedCounts.harborInternal, 2)
})

test('invalid and duplicate listed metadata cannot consume the history read window', async () => {
  const values = [
    snapshot('relative-root', { cwd: 'relative/project' }),
    snapshot('nul-root', { cwd: '/tmp/bad\0root' }),
    snapshot('missing-root', { cwd: null }),
    snapshot('invalid-time', { createdAt: NaN }),
    snapshot('overflow-time', { createdAt: Number.MAX_SAFE_INTEGER }),
    snapshot(''),
    snapshot('valid'),
    snapshot('valid'),
  ]
  const query = queryFor(values)
  const reads = []
  const readSession = query.readSession
  query.readSession = async id => { reads.push(id); return readSession(id) }
  const result = await selectRecentSessions({ sessionQuery: query, projectRoot: ROOT, scope: 'dsh-history', maxSessionReads: 1 })
  assert.deepEqual(reads, ['valid'])
  assert.equal(result.selected.length, 1)
  assert.equal(result.scan.partial, false)
  assert.equal(result.excludedCounts.invalidHeader, 6)
  assert.equal(result.excludedCounts.duplicate, 1)
  assert.match(result.warnings.join(' '), /invalid metadata/)
})

test('history read identity drift and malformed snapshots are isolated without exposing source details', async () => {
  for (const patch of [
    { id: 'replacement-session' }, { cwd: '/tmp/different-project' }, { cwd: 'relative-path' },
    { createdAt: 3_000 }, { origin: 'subagent' }, { parentSession: 'parent' },
    { seedLength: 1 }, { delegationDepth: 1 }, { version: 1 },
  ]) {
    const original = snapshot('stable', { cwd: '/tmp/original-business-project' })
    const query = queryFor([original])
    query.readSession = async () => ({ ...original, session: { ...original.session, ...patch } })
    const result = await selectRecentSessions({ sessionQuery: query, projectRoot: ROOT, scope: 'dsh-history' })
    assert.equal(result.selected.length, 0, JSON.stringify(patch))
    assert.equal(result.excludedCounts.unreadable, 1)
    assert.doesNotMatch(JSON.stringify(result.warnings), /replacement-session|original-business-project|different-project/)
  }
  const original = snapshot('malformed')
  const query = queryFor([original])
  query.readSession = async () => ({ ...original, events: null })
  const result = await selectRecentSessions({ sessionQuery: query, projectRoot: ROOT, scope: 'dsh-history' })
  assert.equal(result.excludedCounts.unreadable, 1)
})

test('history selection does not interpret malformed query results as empty history', async () => {
  const query = queryFor([])
  query.filterSessions = async () => null
  await assert.rejects(selectRecentSessions({ sessionQuery: query, projectRoot: ROOT, scope: 'dsh-history' }), /DSH_SESSION_QUERY_INVALID/)
})

test('selection rejects invalid scope and unbounded or unusable read limits', async () => {
  const base = { sessionQuery: queryFor([]), projectRoot: ROOT }
  await assert.rejects(selectRecentSessions({ ...base, scope: 'all-files' }), /SESSION_SELECTION_SCOPE_INVALID/)
  for (const value of [0, -1, 1.5, Infinity, NaN]) {
    await assert.rejects(selectRecentSessions({ ...base, maxSessionReads: value }), /SESSION_READ_BUDGET_INVALID/)
    await assert.rejects(selectRecentSessions({ ...base, concurrency: value }), /SESSION_READ_CONCURRENCY_INVALID/)
  }
})

test('an aborted history scan rejects instead of misreporting unreadable or empty history', async () => {
  const controller = new AbortController()
  const value = snapshot('valid')
  const query = queryFor([value])
  query.readSession = async () => { controller.abort(); return value }
  await assert.rejects(selectRecentSessions({
    sessionQuery: query, projectRoot: ROOT, scope: 'dsh-history', signal: controller.signal,
  }), { name: 'AbortError' })
})

test('blank-stage business preset selection overrides a stale Harbor header everywhere', async () => {
  const switched = snapshot('preset-switched', {
    header: { agentPreset: 'harbor-creation-preset' },
    selectedPresets: ['business-agent'],
  })
  const direct = snapshot('preset-switched', {
    header: { agentPreset: 'business-agent' },
  })
  const switchedResult = await selectRecentSessions({
    sessionQuery: queryFor([switched]), projectRoot: ROOT, currentSessionId: 'current',
  })
  const directResult = await selectRecentSessions({
    sessionQuery: queryFor([direct]), projectRoot: ROOT, currentSessionId: 'current',
  })

  assert.equal(switchedResult.selected.length, 1)
  assert.equal(switchedResult.selected[0].index.effectiveAgentPreset, 'business-agent')
  assert.equal(switchedResult.selected[0].header.agentPreset, 'business-agent')
  assert.equal(switchedResult.publicSelected[0].agentPreset, 'business-agent')
  assert.equal(buildSessionObservation(switchedResult.selected[0]).generator.agent_preset, 'business-agent')
  assert.equal(switchedResult.selected[0].sourceRef, directResult.selected[0].sourceRef)
  assert.notEqual(switchedResult.selected[0].sourceDigest, directResult.selected[0].sourceDigest)
})

test('blank-stage switch into a Harbor preset is excluded after exact event projection', async () => {
  const result = await selectRecentSessions({
    sessionQuery: queryFor([snapshot('preset-switched-harbor', {
      header: { agentPreset: 'business-agent' },
      selectedPresets: ['harbor-internal-evaluator'],
    })]),
    projectRoot: ROOT,
    currentSessionId: 'current',
  })

  assert.equal(result.selected.length, 0)
  assert.equal(result.excludedCounts.harborInternal, 1)
})

test('createdAfter gives an actionable bounded scan when a workspace exceeds the read budget', async () => {
  const values = [
    snapshot('old', { createdAt: 100, lastAt: 10_000 }),
    snapshot('recent-a', { createdAt: 200, lastAt: 2_000 }),
    snapshot('recent-b', { createdAt: 300, lastAt: 3_000 }),
  ]
  const result = await selectRecentSessions({
    sessionQuery: queryFor(values),
    projectRoot: ROOT,
    currentSessionId: 'current',
    maxSessionReads: 2,
    createdAfter: 200,
  })
  assert.deepEqual(result.selected.map(item => item.rawSessionId), ['recent-b', 'recent-a'])
  assert.equal(result.excludedCounts.beforeCreatedAfter, 1)
})

test('source snapshot verification detects same-seq replacement', async () => {
  const original = snapshot('stable')
  const result = await selectRecentSessions({ sessionQuery: queryFor([original]), projectRoot: ROOT, currentSessionId: 'current' })
  const changed = structuredClone(original)
  changed.events[1].data.content[0].text = 'changed at same seq'

  assert.equal(verifySessionSnapshot(result.selected[0], original, ROOT), true)
  assert.equal(verifySessionSnapshot(result.selected[0], changed, ROOT), false)
})

test('selection tokens are owner-bound, workspace-bound, expiring, and single-use', () => {
  let clock = 1_000
  let counter = 0
  const store = new SessionSelectionTokenStore({
    ttlMs: 100,
    now: () => clock,
    randomToken: () => `token-${++counter}`,
  })
  const first = store.issue({ ownerSessionId: 'owner', projectRoot: ROOT, selection: [] })
  assert.equal(store.consume(first.token, { ownerSessionId: 'owner', projectRoot: ROOT }).ownerSessionId, 'owner')
  assert.throws(() => store.consume(first.token, { ownerSessionId: 'owner', projectRoot: ROOT }), /TOKEN_INVALID/)

  const second = store.issue({ ownerSessionId: 'owner', projectRoot: ROOT, selection: [] })
  assert.throws(() => store.consume(second.token, { ownerSessionId: 'other', projectRoot: ROOT }), /OWNER_MISMATCH/)
  const third = store.issue({ ownerSessionId: 'owner', projectRoot: ROOT, selection: [] })
  clock = 1_101
  assert.throws(() => store.consume(third.token, { ownerSessionId: 'owner', projectRoot: ROOT }), /TOKEN_INVALID|TOKEN_EXPIRED/)
})
