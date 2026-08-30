import assert from 'node:assert/strict'
import test from 'node:test'

import { foldSessionDiagnosticIndex } from '../lib/session-projection.js'

function event(type, seq, data, surfaceOp) {
  return { type, seq, time: 1_000 + seq, data, ...(surfaceOp ? { surfaceOp } : {}) }
}

test('Session diagnostic projection folds only safe selection metadata', () => {
  const index = foldSessionDiagnosticIndex([
    event('turn/start', 0, { turn: 0 }),
    event('user/message', 1, {
      id: 'human', role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: 'real goal' }],
    }, 'append'),
    event('user/message', 2, {
      id: 'injected', role: 'user', source: { kind: 'plugin', plugin: 'context' },
      content: [{ type: 'text', text: 'system context' }],
    }, 'append'),
    event('assistant/message', 3, {
      turn: 0, step: 0,
      message: {
        id: 'assistant', role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' },
        content: [{ type: 'text', text: 'answer' }, { type: 'reasoning', text: 'private' }],
      },
    }, 'append'),
    event('assistant/message', 4, {
      turn: 0, step: 0,
      message: {
        id: 'compacted', role: 'assistant', source: { kind: 'model', provider: 'other', model: 'hidden' },
        content: [{ type: 'text', text: 'replacement' }],
      },
    }, { op: 'replace', start: 1, end: 3 }),
    event('tool/call', 5, { name: 'exec_command', callId: '1', arguments: '{"secret":true}' }),
    event('request/header', 6, { header: { config: { provider: 'p', model: 'm', reasoningEffort: 'high' } } }),
    event('turn/end', 7, { turn: 0, reason: { kind: 'completed' } }),
  ])

  assert.deepEqual(index, {
    lastActivityAt: 1007,
    lastSeq: 7,
    openTurn: false,
    turnCount: 1,
    humanMessageCount: 1,
    assistantMessageCount: 1,
    toolCallCount: 1,
    lastTurnReason: 'completed',
    hasHarborToolCall: false,
    modelRoutes: [{ provider: 'p', model: 'm', reasoning_effort: 'high' }],
    modelSegments: [{
      from_seq: 6,
      through_seq: 7,
      provider: 'p',
      model: 'm',
      reasoning_effort: 'high',
    }],
  })
  assert.doesNotMatch(JSON.stringify(index), /real goal|private|secret/)
})

test('Session diagnostic projection recognizes open turns and Harbor recursion', () => {
  const index = foldSessionDiagnosticIndex([
    event('turn/start', 0, { turn: 9 }),
    event('tool/call', 1, {
      name: 'harbor_session_diagnostic_run', callId: 'recursive', arguments: '{}',
    }),
  ])
  assert.equal(index.openTurn, true)
  assert.equal(index.hasHarborToolCall, true)
  assert.deepEqual(index.modelSegments, [])
})

test('Session diagnostic projection uses the newest selected preset over the creation header', () => {
  const index = foldSessionDiagnosticIndex([
    event('agent-preset/selected', 0, { agentPreset: 'business-old' }),
    event('agent-preset/selected', 1, { agentPreset: 'business-current' }),
    event('turn/start', 2, { turn: 0 }),
  ], { agentPreset: 'creation-preset' })

  assert.equal(index.effectiveAgentPreset, 'business-current')
})
