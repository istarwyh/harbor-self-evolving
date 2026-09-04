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
    ['model-slack', 'SLACK_TOKEN_PLACEHOLDER'],
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
  assert.doesNotMatch(serialized, /supersecret|github_pat_|SLACK_TOKEN_PLACEHOLDER|eyJ|ASIA1234|opaque-private-material/)
})

test('selection is bounded before exact Session reads', async () => {
  const values = Array.from({ length: 3 }, (_, index) => snapshot(`s-${index}`))
  await assert.rejects(
    selectRecentSessions({ sessionQuery: queryFor(values), projectRoot: ROOT, currentSessionId: 'current', maxSessionReads: 2 }),
    /SESSION_SELECTION_TOO_EXPENSIVE/,
  )
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
