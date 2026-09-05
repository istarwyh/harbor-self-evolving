import assert from 'node:assert/strict'
import { access, mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { SessionDiagnosticService } from '../lib/session-diagnostic.js'
import { SessionSelectionTokenStore } from '../lib/session-selection.js'

function snapshot(id, root, answer = 'done') {
  return {
    session: { version: 0, id, createdAt: 1_000, cwd: root, agentPreset: 'default' },
    events: [
      { type: 'turn/start', seq: 0, time: 1_000, data: { turn: 0 } },
      { type: 'user/message', seq: 1, time: 1_001, surfaceOp: 'append', data: { id: `${id}-u`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'goal' }] } },
      { type: 'assistant/message', seq: 2, time: 1_002, surfaceOp: 'append', data: { turn: 0, step: 0, message: { id: `${id}-a`, role: 'assistant', source: { kind: 'model', provider: 'p', model: 'm' }, content: [{ type: 'text', text: answer }] } } },
      { type: 'turn/end', seq: 3, time: 1_003, data: { turn: 0, reason: { kind: 'completed' } } },
    ],
  }
}

function harness(root, snapshots) {
  const values = new Map(snapshots.map(value => [value.session.id, value]))
  const feedbackItems = new Map(snapshots.map(value => [value.session.id, [
    { messageId: `${value.session.id}-a`, rating: 'positive', updatedAt: 2_000 },
  ]]))
  const sessionQuery = {
    async filterSessions() {
      return [...values.values()].map(value => ({ header: value.session, persisted: true, live: false }))
    },
    async readSession(id) { return structuredClone(values.get(id)) },
  }
  const messageFeedback = {
    async list({ sessionId }) {
      return { ok: true, value: { items: structuredClone(feedbackItems.get(sessionId) ?? []) } }
    },
  }
  const ctx = { get(name) { return { sessionQuery, messageFeedback }[name] } }
  return { ctx, values, feedbackItems, messageFeedback }
}

function execution(root, id = 'current') {
  return { agent: { session: { header: { id, cwd: root } } } }
}

function judgeRuntime(binding = {}) {
  const resolved = {
    provider: 'judge',
    model: 'model',
    transport: 'dsh-host-broker',
    protocol: 'dsh-host-model-gateway/v1',
    model_info: { id: 'model' },
    ...binding,
  }
  return {
    async currentBinding() { throw new Error('Judge resolution must not expose the public-only binding') },
    async resolveCurrent() { return resolved },
    async resolve() { return resolved },
  }
}

test('Preview and Run preserve a shared token, revalidate sources, and write only redacted ids', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hse-session-diagnostic-'))
  const source = snapshot('private-source-id', root)
  const { ctx } = harness(root, [source])
  const calls = []
  const service = new SessionDiagnosticService({
    ctx,
    config: { projectRoot: root, sessionMaxReads: 10 },
    tokenStore: new SessionSelectionTokenStore({ randomToken: () => 'opaque-token' }),
    now: () => new Date('2026-08-30T12:00:00Z'),
    modelRuntime: judgeRuntime(),
    async runHistoricalEvaluation(config, args) {
      calls.push({ config, args })
      return { job: 'jobs/history', summary: { job_kind: 'historical-generation-evaluation' } }
    },
  })

  const preview = await service.preview({}, execution(root))
  assert.equal(preview.selectionToken, 'opaque-token')
  assert.equal(preview.projectRoot, undefined, 'safe Preview metadata must not expose an absolute local path')
  assert.equal(preview.selected.length, 1)
  assert.equal(preview.selected[0].feedback.positive, 1)
  assert.match(preview.warnings.join('\n'), /retention policy/)
  assert.equal(preview.retention.privateEvidence, '.harbor/private/session-batches')
  assert.deepEqual(preview.evaluation, {
    evaluator: { id: 'dsh-session-historical-evaluator', version: '1.0.0' },
    judge: {
      provider: 'judge',
      model: 'model',
      transport: 'dsh-host-broker',
      protocol: 'dsh-host-model-gateway/v1',
    },
    coupling: 'independent-historical-judge',
  })
  assert.match(preview.confirmation, /Judge judge\/model \(independent-historical-judge\)/)
  assert.doesNotMatch(JSON.stringify(preview), /private-source-id|\bgoal\b|\bdone\b/)

  await assert.rejects(
    service.run({ selectionToken: preview.selectionToken, stackPath: '.harbor/custom.yml' }, execution(root)),
    /HISTORICAL_CUSTOM_STACK_UNSUPPORTED/,
  )

  const result = await service.run({ selectionToken: preview.selectionToken }, execution(root))
  assert.equal(result.batch.recordCount, 1)
  assert.equal(calls.length, 1)
  const persisted = await readFile(calls[0].args.batchPath, 'utf8')
  assert.doesNotMatch(persisted, /private-source-id/)
  await assert.rejects(
    service.run({ selectionToken: preview.selectionToken }, execution(root)),
    /TOKEN_INVALID/,
  )
})

test('Run rejects owner changes and source changes before writing a Batch', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hse-session-stale-'))
  const source = snapshot('source', root)
  const { ctx, values } = harness(root, [source])
  const makeService = token => new SessionDiagnosticService({
    ctx,
    config: { projectRoot: root },
    tokenStore: new SessionSelectionTokenStore({ randomToken: () => token }),
    modelRuntime: judgeRuntime(),
    async runHistoricalEvaluation() { throw new Error('must not run') },
  })

  const ownerService = makeService('owner-token')
  const ownerPreview = await ownerService.preview({}, execution(root))
  await assert.rejects(
    ownerService.run({ selectionToken: ownerPreview.selectionToken }, execution(root, 'other')),
    /OWNER_MISMATCH/,
  )

  const staleService = makeService('stale-token')
  const stalePreview = await staleService.preview({}, execution(root))
  values.set('source', snapshot('source', root, 'changed at same seq'))
  await assert.rejects(
    staleService.run({ selectionToken: stalePreview.selectionToken }, execution(root)),
    /SESSION_SAMPLE_CHANGED/,
  )
})

test('Run rejects Message Feedback changes after Preview before writing a Batch', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hse-session-feedback-stale-'))
  const source = snapshot('feedback-source', root)
  const { ctx, feedbackItems } = harness(root, [source])
  const service = new SessionDiagnosticService({
    ctx,
    config: { projectRoot: root },
    tokenStore: new SessionSelectionTokenStore({ randomToken: () => 'feedback-token' }),
    modelRuntime: judgeRuntime(),
    async runHistoricalEvaluation() { throw new Error('must not run') },
  })
  const preview = await service.preview({}, execution(root))
  feedbackItems.set('feedback-source', [{
    messageId: 'feedback-source-a', rating: 'negative', updatedAt: 3_000,
  }])
  await assert.rejects(
    service.run({ selectionToken: preview.selectionToken }, execution(root)),
    /SESSION_FEEDBACK_CHANGED/,
  )
})

test('Run rejects a Feedback capability state change after Preview', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hse-session-feedback-capability-'))
  const source = snapshot('feedback-capability-source', root)
  const { ctx, messageFeedback } = harness(root, [source])
  const readFeedback = messageFeedback.list.bind(messageFeedback)
  messageFeedback.list = async () => ({ ok: false, error: 'temporarily unavailable' })
  const service = new SessionDiagnosticService({
    ctx,
    config: { projectRoot: root },
    tokenStore: new SessionSelectionTokenStore({ randomToken: () => 'feedback-capability-token' }),
    modelRuntime: judgeRuntime(),
    async runHistoricalEvaluation() { throw new Error('must not run') },
  })

  const preview = await service.preview({}, execution(root))
  messageFeedback.list = readFeedback
  await assert.rejects(
    service.run({ selectionToken: preview.selectionToken }, execution(root)),
    /SESSION_FEEDBACK_CHANGED/,
  )
})

test('Preview resolves the Judge binding before issuing a confirmation token', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hse-session-judge-invalid-'))
  const source = snapshot('judge-source', root)
  const { ctx } = harness(root, [source])
  const service = new SessionDiagnosticService({
    ctx,
    config: { projectRoot: root },
    tokenStore: new SessionSelectionTokenStore({ randomToken: () => 'judge-token' }),
    modelRuntime: {
      async resolveCurrent() { throw new Error('JUDGE_BINDING_INVALID') },
    },
    async runHistoricalEvaluation() { throw new Error('must not run') },
  })

  await assert.rejects(
    service.preview({ evaluatorReasoningEffort: 'low' }, execution(root)),
    /evaluatorReasoningEffort requires an explicit evaluatorProvider and evaluatorModel/,
  )
  await assert.rejects(
    service.preview({}, execution(root)),
    /JUDGE_BINDING_INVALID/,
  )
  await assert.rejects(
    access(path.join(root, '.harbor', 'private', 'session-batches')),
    /ENOENT/,
  )
})

test('Preview freezes explicit Judge identity and discloses same-model coupling', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hse-session-judge-confirmed-'))
  const source = snapshot('judge-coupling-source', root)
  const { ctx } = harness(root, [source])
  let requested
  const service = new SessionDiagnosticService({
    ctx,
    config: { projectRoot: root },
    tokenStore: new SessionSelectionTokenStore({ randomToken: () => 'judge-confirmed-token' }),
    modelRuntime: {
      async resolve(args) {
        requested = args
        return {
          provider: 'p',
          model: 'm',
          reasoning_effort: 'high',
          protocol: 'dsh-host-model-gateway/v1',
          transport: 'dsh-host-broker',
          model_info: {},
        }
      },
    },
    async runHistoricalEvaluation() { throw new Error('must not run') },
  })

  const preview = await service.preview({
    evaluatorProvider: 'p',
    evaluatorModel: 'm',
    evaluatorReasoningEffort: 'high',
  }, execution(root))
  assert.deepEqual(requested, {
    candidateProvider: 'p',
    candidateModel: 'm',
    candidateReasoningEffort: 'high',
  })
  assert.equal(preview.evaluation.coupling, 'same-host-model-diagnostic-only')
  assert.equal(preview.evaluation.judge.reasoning_effort, 'high')
  await assert.rejects(
    service.run({ selectionToken: preview.selectionToken, evaluatorProvider: 'other' }, execution(root)),
    /HISTORICAL_JUDGE_NOT_CONFIRMED/,
  )
})

test('Preview does not claim Judge independence when Generator model provenance is absent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hse-session-judge-unknown-'))
  const source = snapshot('judge-unknown-source', root)
  delete source.events.find(event => event.type === 'assistant/message').data.message.source.provider
  delete source.events.find(event => event.type === 'assistant/message').data.message.source.model
  const { ctx } = harness(root, [source])
  const service = new SessionDiagnosticService({
    ctx,
    config: { projectRoot: root },
    tokenStore: new SessionSelectionTokenStore({ randomToken: () => 'judge-unknown-token' }),
    modelRuntime: judgeRuntime(),
    async runHistoricalEvaluation() { throw new Error('must not run') },
  })

  const preview = await service.preview({}, execution(root))
  assert.equal(preview.evaluation.coupling, 'generator-model-unknown-diagnostic-only')
})

test('Preview fails explicitly when Session Query is unavailable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hse-session-unavailable-'))
  const service = new SessionDiagnosticService({
    ctx: { get() { return undefined } },
    config: { projectRoot: root },
    modelRuntime: {},
    async runHistoricalEvaluation() {},
  })
  await assert.rejects(service.preview({}, execution(root)), /DSH_SESSION_QUERY_UNAVAILABLE/)
})
