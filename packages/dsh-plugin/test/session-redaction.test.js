import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, stat, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildHistoricalGenerationBatch, writePrivateHistoricalBatch } from '../lib/session-materializer.js'
import { buildSessionObservation } from '../lib/session-redaction.js'
import { canonicalDigest } from '../lib/session-selection.js'

const RAW_SESSION_ID = 'raw-session-id-must-never-leak'
const API_SECRET = 'sk-super-secret-token-123456'
const BEARER_SECRET = 'bearer-value-123456789'

function selectedFixture() {
  const events = [
    { type: 'turn/start', seq: 0, time: 1_000, data: { turn: 0 } },
    {
      type: 'user/message', seq: 1, time: 1_001, surfaceOp: 'append',
      data: {
        id: 'message-user', role: 'user', source: { kind: 'user' },
        content: [
          { type: 'text', text: `Fix /Users/private/My Secret Project for ${RAW_SESSION_ID} using api_key=${API_SECRET}\nOPENAI_API_KEY=\`correct horse battery staple\`` },
          { type: 'image', attachment: { digest: API_SECRET, bytes: 'raw' } },
        ],
      },
    },
    {
      type: 'assistant/message', seq: 2, time: 1_002, surfaceOp: 'append',
      data: {
        turn: 0, step: 0,
        message: {
          id: 'message-assistant', role: 'assistant',
          source: { kind: 'model', provider: 'provider', model: `model-${RAW_SESSION_ID}`, replayState: { secret: API_SECRET } },
          content: [
            { type: 'reasoning', text: API_SECRET },
            { type: 'tool-call', id: 'call-1', name: 'exec_command', arguments: `{"token":"${API_SECRET}"}` },
            { type: 'text', text: `Done. Authorization: Bearer ${BEARER_SECRET}` },
          ],
        },
        usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 999 },
      },
    },
    { type: 'tool/call', seq: 3, time: 1_003, data: { turn: 0, step: 0, callId: 'call-1', name: 'exec_command', arguments: API_SECRET } },
    {
      type: 'tool/result', seq: 4, time: 1_004, surfaceOp: 'append',
      data: {
        turn: 0, step: 0,
        message: {
          id: 'tool-message', role: 'user', source: { kind: 'tool', callId: 'call-1' },
          content: [{ type: 'tool-result', toolCallId: 'call-1', content: [{ type: 'text', text: API_SECRET }] }],
        },
        meta: { authorization: API_SECRET },
      },
    },
    { type: 'request/header', seq: 5, time: 1_005, data: { header: { config: { provider: 'provider', model: `model-${RAW_SESSION_ID}` }, system: API_SECRET, tools: [{ secret: API_SECRET }] } } },
    { type: 'turn/end', seq: 6, time: 1_006, data: { turn: 0, reason: { kind: 'completed' } } },
  ]
  return {
    rawSessionId: RAW_SESSION_ID,
    header: { version: 0, id: RAW_SESSION_ID, createdAt: 1_000, cwd: '/tmp/project', agentPreset: `creation-${RAW_SESSION_ID}` },
    events,
    index: {
      lastActivityAt: 1_006, lastSeq: 6, openTurn: false, turnCount: 1,
      humanMessageCount: 1, assistantMessageCount: 1, toolCallCount: 1,
      lastTurnReason: 'completed', hasHarborToolCall: false,
      effectiveAgentPreset: `business-${RAW_SESSION_ID}`,
      modelRoutes: [{ provider: 'provider', model: `model-${RAW_SESSION_ID}` }],
      modelSegments: [{ from_seq: 5, through_seq: 6, provider: 'provider', model: `model-${RAW_SESSION_ID}` }],
    },
    sourceDigest: canonicalDigest({ source: RAW_SESSION_ID, events }, 'test-source'),
    sourceRef: canonicalDigest({ source: RAW_SESSION_ID }, 'test-source-ref'),
    capturedThroughSeq: 6,
    trialId: 'session-deadbeef0001',
  }
}

test('Session Observation allowlists visible text and removes secret-bearing payloads', () => {
  const selected = selectedFixture()
  const observation = buildSessionObservation(selected, [{
    messageId: 'message-assistant', rating: 'negative', note: `${RAW_SESSION_ID} password=${API_SECRET}`, updatedAt: 2_000,
  }])
  const serialized = JSON.stringify(observation)

  assert.equal(observation.protocol, 'dsh-session-observation/v1')
  assert.equal(observation.visible_transcript.length, 2)
  assert.equal(observation.execution.tools[0].name, 'exec_command')
  assert.equal(observation.execution.tools[0].result_summary, 'Tool completed; payload intentionally omitted.')
  assert.equal(observation.execution.usage.reasoning_tokens, undefined)
  assert.deepEqual(observation.generator.model_segments, [
    { from_seq: 5, through_seq: 6, provider: 'provider', model: 'model-[REDACTED_SESSION_ID]' },
  ])
  assert.equal(observation.generator.agent_preset, 'business-[REDACTED_SESSION_ID]')
  assert.match(serialized, /REDACTED_SECRET/)
  assert.doesNotMatch(serialized, /REDACTED_SECRET\]\]/)
  assert.match(serialized, /REDACTED_PATH/)
  assert.doesNotMatch(serialized, new RegExp(API_SECRET))
  assert.doesNotMatch(serialized, new RegExp(BEARER_SECRET))
  assert.doesNotMatch(serialized, /raw-session-id-must-never-leak|correct horse|battery staple|My Secret Project|replayState|tool-call|request\/header|system/)
})

test('Session Observation redacts opaque tokens, credential URLs, and a private key without a footer', () => {
  const selected = selectedFixture()
  selected.events[1].data.content[0].text += [
    '\npostgres://user:dbpassword@localhost',
    'https://alice:supersecret@example.com',
    'github_pat_abcdefghijklmnopqrstuvwxyz123456',
    'SLACK_TOKEN_PLACEHOLDER',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signaturepart',
    'ASIA1234567890ABCDEF',
    '-----BEGIN PRIVATE KEY-----',
    'opaque-private-material-without-footer',
  ].join('\n')

  const serialized = JSON.stringify(buildSessionObservation(selected))

  assert.match(serialized, /REDACTED_SECRET/)
  assert.doesNotMatch(serialized, /dbpassword|supersecret|github_pat_|SLACK_TOKEN_PLACEHOLDER|eyJhbGci|ASIA1234|opaque-private-material/)
})

test('Historical Batch is immutable, private, and contains no raw Session id', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'hse-private-batch-'))
  const selected = selectedFixture()
  const observation = buildSessionObservation(selected)
  const now = new Date('2026-08-30T12:00:00Z')
  const batch = buildHistoricalGenerationBatch({
    projectRoot, selections: [selected], observations: [observation], now,
  })
  const written = await writePrivateHistoricalBatch({ projectRoot, batch, observations: [observation] })
  const batchText = await readFile(written.batchPath, 'utf8')
  const observationText = await readFile(path.join(written.batchDir, batch.records[0].observation_path), 'utf8')

  assert.equal(batch.protocol, 'historical-generation-batch/v1')
  assert.equal(batch.records.length, 1)
  assert.equal((await stat(written.batchDir)).mode & 0o777, 0o700)
  assert.equal((await stat(written.batchPath)).mode & 0o777, 0o600)
  assert.equal(await readFile(path.join(projectRoot, '.harbor', 'private', '.gitignore'), 'utf8'), '*\n!.gitignore\n')
  assert.doesNotMatch(`${batchText}${observationText}`, new RegExp(RAW_SESSION_ID))
  await assert.rejects(
    writePrivateHistoricalBatch({ projectRoot, batch, observations: [observation] }),
    /EEXIST|ENOTEMPTY|exist|not empty/i,
  )
})

test('Historical Batch rejects symlink escapes at every private evidence directory boundary', async () => {
  for (const boundary of ['.harbor', 'private', 'session-batches']) {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), `hse-private-symlink-${boundary}-`))
    const outside = await mkdtemp(path.join(os.tmpdir(), `hse-private-outside-${boundary}-`))
    const harborRoot = path.join(projectRoot, '.harbor')
    const privateRoot = path.join(harborRoot, 'private')
    if (boundary === 'private' || boundary === 'session-batches') {
      await mkdir(harborRoot)
    }
    if (boundary === 'session-batches') {
      await mkdir(privateRoot)
    }
    const target = boundary === '.harbor'
      ? harborRoot
      : boundary === 'private'
        ? privateRoot
        : path.join(privateRoot, 'session-batches')
    await symlink(outside, target)

    const selected = selectedFixture()
    const observation = buildSessionObservation(selected)
    const batch = buildHistoricalGenerationBatch({
      projectRoot,
      selections: [selected],
      observations: [observation],
      now: new Date('2026-08-30T12:00:00Z'),
    })
    await assert.rejects(
      writePrivateHistoricalBatch({ projectRoot, batch, observations: [observation] }),
      /PRIVATE_EVIDENCE_PATH_UNSAFE/,
      boundary,
    )
    assert.deepEqual(await readdir(outside), [], `${boundary} must not receive private evidence`)
  }
})
