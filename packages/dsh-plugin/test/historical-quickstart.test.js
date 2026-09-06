import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { HistoricalWebController } from '../lib/historical-web.js'
import { HistoricalRunLock } from '../lib/historical-run-lock.js'
import { SessionDiagnosticService } from '../lib/session-diagnostic.js'

function conversation(id, cwd, createdAt = 1_000) {
  return {
    session: { version: 0, id, cwd, createdAt, agentPreset: 'business' },
    events: [
      { type: 'turn/start', seq: 0, time: createdAt, data: { turn: 0 } },
      { type: 'user/message', seq: 1, time: createdAt + 1, surfaceOp: 'append', data: { id: `${id}-u`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Explain the result.' }] } },
      { type: 'assistant/message', seq: 2, time: createdAt + 2, surfaceOp: 'append', data: { turn: 0, step: 0, message: { id: `${id}-a`, role: 'assistant', source: { kind: 'model', provider: 'fixture', model: 'generator' }, content: [{ type: 'text', text: 'A completed synthetic answer.' }] } } },
      { type: 'turn/end', seq: 3, time: createdAt + 3, data: { turn: 0, reason: { kind: 'completed' } } },
    ],
  }
}

async function fixture(t, snapshots, { maxReads = 100 } = {}) {
  const output = await mkdtemp(path.join(os.tmpdir(), 'harbor-history-quickstart-'))
  t.after(() => rm(output, { recursive: true, force: true }))
  const values = new Map(snapshots.map(item => [item.session.id, item]))
  const queries = []
  const reads = []
  const runs = []
  const scheduled = []
  let judgeResolutions = 0
  const config = { projectRoot: output, jobsDir: 'jobs', sessionMaxReads: maxReads }
  const query = {
    async filterSessions(filters) {
      queries.push(filters)
      return [...values.values()].filter(item => filters.every(filter => (
        filter.kind === 'cwd' ? filter.values.includes(item.session.cwd)
          : filter.kind === 'created-at' ? item.session.createdAt >= filter.from : true
      ))).map(item => ({ header: structuredClone(item.session), persisted: true, live: false }))
    },
    async readSession(id) {
      reads.push(id)
      const item = values.get(id)
      if (item.unreadable) throw new Error('Synthetic unreadable Session')
      return structuredClone(item)
    },
  }
  const service = new SessionDiagnosticService({
    ctx: { sessionQuery: query }, config,
    modelRuntime: {
      async resolveCurrent() {
        judgeResolutions++
        return { provider: 'fixture', model: 'judge', transport: 'dsh-host-broker', model_info: {} }
      },
    },
    async runHistoricalEvaluation(actualConfig, args) {
      const batch = JSON.parse(await readFile(args.batchPath, 'utf8'))
      runs.push({ config: actualConfig, args, batch })
      return { job: 'jobs/quickstart-synthetic', summary: { job_kind: 'historical-generation-evaluation' } }
    },
  })
  const controller = new HistoricalWebController({
    service: { async historicalWorkspace() { return { workspace: 'output-workspace', projectRoot: output, config } } },
    sessionDiagnostic: service, runLock: new HistoricalRunLock(),
    schedule: callback => scheduled.push(callback),
  })
  return { output, values, queries, reads, runs, scheduled, service, controller, judgeResolutions: () => judgeResolutions }
}

test('quickstart discovers other projects automatically, then writes only to the evaluation workspace', async t => {
  const sources = [
    conversation('private-current-session', '/fixture/old-project', 9_000),
    conversation('private-source-one', '/fixture/project-one', 4_000),
    conversation('private-source-two', '/fixture/project-two', 3_000),
    conversation('private-source-three', '/fixture/project-three', 2_000),
    conversation('private-source-four', '/fixture/project-four', 1_000),
  ]
  const f = await fixture(t, sources)
  const owner = { workspace: 'output-workspace', sessionId: 'private-current-session' }
  const preview = await f.controller.preview(owner)
  assert.equal(preview.scope, 'dsh-history')
  assert.equal(preview.selected.length, 3)
  assert.equal(preview.estimatedJudgeRequests, 3)
  assert.equal(preview.selectionToken, undefined)
  assert.equal(preview.excludedCounts.currentSession, 1)
  assert.ok(f.queries.every(filters => filters.every(filter => filter.kind !== 'cwd')))
  assert.ok(!f.reads.includes(owner.sessionId))
  assert.equal(f.runs.length, 0, 'preview must not invoke the evaluator')
  await assert.rejects(access(path.join(f.output, '.harbor')), /ENOENT/)
  assert.doesNotMatch(JSON.stringify(preview), /private-source|\/fixture\/project|private-current-session|A completed synthetic answer/)

  const operation = await f.controller.run({ ...owner, previewId: preview.previewId })
  assert.equal(operation.status, 'queued')
  assert.equal(f.runs.length, 0)
  f.scheduled[0]()
  let settled
  for (let attempt = 0; attempt < 200; attempt++) {
    settled = f.controller.operation({ ...owner, operationId: operation.operationId })
    if (['completed', 'failed'].includes(settled.status)) break
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(settled.status, 'completed', JSON.stringify(settled))
  assert.equal(settled.jobName, 'quickstart-synthetic')
  assert.equal(f.runs.length, 1)
  assert.equal(f.runs[0].config.projectRoot, f.output)
  assert.ok(f.runs[0].args.batchPath.startsWith(path.join(f.output, '.harbor', 'private') + path.sep))
  assert.equal(f.runs[0].batch.selection.scope, 'dsh-history')
  assert.equal(f.runs[0].batch.records.length, 3)
  assert.equal(new Set(f.runs[0].batch.records.map(record => record.source_project_digest)).size, 3)
  assert.doesNotMatch(JSON.stringify(f.runs[0].batch), /private-source|\/fixture\//)
})

test('discovered source identity is frozen even though its project differs from the output', async t => {
  const source = conversation('source-original', '/fixture/source-project')
  const f = await fixture(t, [source])
  const identity = { ownerSessionId: 'owner', projectRoot: f.output }
  const preview = await f.service.previewWithIdentity({}, identity, { scope: 'dsh-history' })
  f.values.get(source.session.id).session.cwd = '/fixture/changed-project'
  await assert.rejects(f.service.runWithIdentity({ selectionToken: preview.selectionToken }, identity), /SESSION_SAMPLE_CHANGED/)
  assert.equal(f.runs.length, 0)
  await assert.rejects(access(path.join(f.output, '.harbor')), /ENOENT/)
})

test('discovered history cannot be run by a different owner or in a different output workspace', async t => {
  const f = await fixture(t, [conversation('source-original', '/fixture/source-project')])
  const identity = { ownerSessionId: 'owner', projectRoot: f.output }
  const ownerPreview = await f.service.previewWithIdentity({}, identity, { scope: 'dsh-history' })
  await assert.rejects(f.service.runWithIdentity({ selectionToken: ownerPreview.selectionToken }, { ...identity, ownerSessionId: 'other' }), /OWNER_MISMATCH/)
  const rootPreview = await f.service.previewWithIdentity({}, identity, { scope: 'dsh-history' })
  await assert.rejects(f.service.runWithIdentity({ selectionToken: rootPreview.selectionToken }, { ...identity, projectRoot: '/fixture/another-output' }), /WORKSPACE_MISMATCH|PROJECT_MISMATCH/)
  assert.equal(f.runs.length, 0)
})

test('empty history is distinguished from unreadable history without resolving a Judge', async t => {
  const empty = await fixture(t, [])
  await assert.rejects(empty.controller.preview({ sessionId: 'owner' }), /NO_ELIGIBLE_SESSIONS/)
  assert.equal(empty.judgeResolutions(), 0)
  const unreadable = conversation('unreadable', '/fixture/source')
  unreadable.unreadable = true
  const failed = await fixture(t, [unreadable])
  await assert.rejects(failed.controller.preview({ sessionId: 'owner' }), /SESSION_HISTORY_READ_FAILED/)
  assert.equal(failed.judgeResolutions(), 0)
})

test('the Agent service default remains exact-cwd and never selects another project history', async t => {
  const f = await fixture(t, [conversation('other-project-source', '/fixture/other-project')])
  const exec = { agent: { session: { header: { id: 'calling-agent', cwd: f.output } } } }

  await assert.rejects(f.service.preview({}, exec), /NO_ELIGIBLE_SESSIONS/)
  assert.deepEqual(f.queries, [[{ kind: 'cwd', values: [f.output] }]])
  assert.deepEqual(f.reads, [])
  assert.equal(f.judgeResolutions(), 0)

  const local = conversation('local-source', f.output)
  f.values.set(local.session.id, local)
  const preview = await f.service.preview({}, exec)
  assert.equal(preview.scope, 'exact-cwd')
  assert.equal(preview.selected.length, 1)
  assert.deepEqual(f.reads, ['local-source'])
  assert.equal(preview.scan.partial, false)
  assert.equal(preview.scan.windowOrder, 'all-candidates')
  assert.equal(f.runs.length, 0)
  await assert.rejects(access(path.join(f.output, '.harbor')), /ENOENT/)
})

test('undeclared public preview scope arguments cannot widen the Agent workspace boundary', async t => {
  const f = await fixture(t, [conversation('other-project-source', '/fixture/other-project')])
  const exec = { agent: { session: { header: { id: 'calling-agent', cwd: f.output } } } }
  const args = { scope: 'dsh-history' }

  await assert.rejects(f.service.preview(args, exec), /NO_ELIGIBLE_SESSIONS/)
  assert.deepEqual(f.queries, [[{ kind: 'cwd', values: [f.output] }]])
  assert.deepEqual(f.reads, [], 'a cross-project transcript must not be read even during Preview')
  assert.equal(f.judgeResolutions(), 0)

  const local = conversation('local-source', f.output)
  f.values.set(local.session.id, local)
  const preview = await f.service.preview(args, exec)
  assert.equal(preview.scope, 'exact-cwd')
  assert.equal(preview.selected.length, 1)
  assert.deepEqual(f.reads, ['local-source'])
  assert.equal(preview.scan.scope, 'exact-cwd')
  assert.equal(f.runs.length, 0)
  assert.deepEqual(args, { scope: 'dsh-history' }, 'the caller object is not mutated')
  await assert.rejects(access(path.join(f.output, '.harbor')), /ENOENT/)
})

test('invalid history headers report a read failure instead of claiming there is no history', async t => {
  const f = await fixture(t, [
    conversation('relative-root', 'relative/project'),
    conversation('invalid-root', '/fixture/bad\0project'),
    conversation('invalid-created-at', '/fixture/project', NaN),
  ])

  await assert.rejects(f.controller.preview({ sessionId: 'owner' }), /SESSION_HISTORY_READ_FAILED/)
  assert.deepEqual(f.queries, [[]])
  assert.deepEqual(f.reads, [], 'invalid metadata must not cause transcript reads')
  assert.equal(f.judgeResolutions(), 0)
  assert.equal(f.runs.length, 0)
  await assert.rejects(access(path.join(f.output, '.harbor')), /ENOENT/)
})

test('a bounded scan with older uninspected history does not claim that no history exists', async t => {
  const unfinished = conversation('unfinished-newer', '/fixture/source', 2_000)
  unfinished.events.pop()
  const f = await fixture(t, [unfinished, conversation('completed-older', '/fixture/source', 1_000)], { maxReads: 1 })
  await assert.rejects(f.controller.preview({ sessionId: 'owner' }), /SESSION_HISTORY_WINDOW_EXHAUSTED/)
  assert.equal(f.reads.length, 1)
  assert.equal(f.judgeResolutions(), 0)
})
