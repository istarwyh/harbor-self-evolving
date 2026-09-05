import assert from 'node:assert/strict'
import { mkdir, mkdtemp, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { HistoricalWebController } from '../lib/historical-web.js'
import { HistoricalRunLock, historicalRunScope } from '../lib/historical-run-lock.js'

const SESSION_ID = 'session-1'
const SECOND_SESSION_ID = 'session-2'

function fixture({
  failRun = false,
  sessionIds = [SESSION_ID],
  ids = ['preview-id', 'owner-id', 'operation-id'],
} = {}) {
  const calls = { preview: [], run: [] }
  const scheduled = []
  const runLock = new HistoricalRunLock()
  const service = {
    async historicalWorkspace(args) {
      assert.equal(args.workspace, 'workspace-1')
      assert.ok(sessionIds.includes(args.sessionId))
      return {
        workspace: 'workspace-1',
        projectRoot: '/work/project',
        config: { projectRoot: '/work/project', jobsDir: 'jobs', sessionMaxReads: 100 },
      }
    },
  }
  const sessionDiagnostic = {
    async previewWithIdentity(args, identity, options) {
      calls.preview.push({ args, identity, options })
      return {
        schema_version: 1,
        selectionToken: 'private-selection-token',
        expiresAt: '2026-08-31T12:15:00.000Z',
        selected: [{ trialId: 'safe-trial', title: '历史会话 1' }],
        evaluation: {
          evaluator: { id: 'evaluator', version: '1.0.0' },
          judge: { provider: 'judge', model: 'model' },
          coupling: 'independent-historical-judge',
        },
      }
    },
    async runWithIdentity(args, identity, options) {
      calls.run.push({ args, identity, options })
      if (failRun) {
        throw new Error(
          'HISTORICAL_JOB_FAILED: failed under /Users/private/project/jobs/run ' +
          'Authorization: Bearer bearer-private Basic dXNlcjpwYXNzd29yZA==\n' +
          'token="quoted-token-private"\nsecret=\'quoted-secret-private\'\n' +
          'OPENAI_API_KEY=`namespaced secret with spaces`',
        )
      }
      return { job: 'jobs/history-job' }
    },
  }
  const controller = new HistoricalWebController({
    service,
    sessionDiagnostic,
    now: () => new Date('2026-08-31T12:00:00.000Z'),
    randomId: () => ids.shift(),
    schedule: callback => scheduled.push(callback),
    runLock,
  })
  return { controller, calls, scheduled, runLock }
}

test('Web Preview keeps the selection token server-side and exposes only safe metadata', async () => {
  const { controller, calls } = fixture()
  const result = await controller.preview({ workspace: 'workspace-1', sessionId: SESSION_ID })

  assert.equal(result.previewId, 'preview-id')
  assert.equal(result.workspace, 'workspace-1')
  assert.equal(result.selected.length, 1)
  assert.equal(result.selectionToken, undefined)
  assert.doesNotMatch(JSON.stringify(result), /private-selection-token|owner-id/)
  assert.deepEqual(calls.preview[0].args, {
    limit: 10,
    createdAfter: undefined,
    includeFeedback: true,
  })
  assert.deepEqual(calls.preview[0].identity, {
    projectRoot: '/work/project',
    ownerSessionId: 'web-historical:session-1:owner-id',
  })
})

test('Web Run is asynchronous, idempotent per Preview, and opens the completed Job by name', async () => {
  const { controller, calls, scheduled } = fixture()
  const preview = await controller.preview({ workspace: 'workspace-1', sessionId: SESSION_ID })
  const first = await controller.run({ workspace: 'workspace-1', previewId: preview.previewId, sessionId: SESSION_ID })
  const repeated = await controller.run({ workspace: 'workspace-1', previewId: preview.previewId, sessionId: SESSION_ID })

  assert.equal(first.status, 'queued')
  assert.equal(repeated.operationId, first.operationId)
  assert.equal(scheduled.length, 1)
  assert.equal(calls.run.length, 0)

  scheduled[0]()
  await new Promise(resolve => setImmediate(resolve))
  const completed = controller.operation({ workspace: 'workspace-1', operationId: first.operationId, sessionId: SESSION_ID })
  assert.equal(completed.status, 'completed')
  assert.equal(completed.jobName, 'history-job')
  assert.deepEqual(calls.run[0].args, { selectionToken: 'private-selection-token' })
  assert.equal(controller.operation({ workspace: 'workspace-1', sessionId: SESSION_ID }).status, 'idle')
})

test('Web Run keeps one active Job per workspace while isolating operation visibility by Session', async () => {
  const { controller, scheduled } = fixture({
    sessionIds: [SESSION_ID, SECOND_SESSION_ID],
    ids: ['preview-1', 'owner-1', 'preview-2', 'owner-2', 'operation-1'],
  })
  const firstPreview = await controller.preview({ workspace: 'workspace-1', sessionId: SESSION_ID })
  const secondPreview = await controller.preview({ workspace: 'workspace-1', sessionId: SECOND_SESSION_ID })
  const first = await controller.run({ workspace: 'workspace-1', previewId: firstPreview.previewId, sessionId: SESSION_ID })

  await assert.rejects(
    controller.run({ workspace: 'workspace-1', previewId: secondPreview.previewId, sessionId: SECOND_SESSION_ID }),
    /HISTORICAL_JOB_ALREADY_RUNNING/,
  )
  assert.equal(scheduled.length, 1)
  assert.equal(controller.operation({ workspace: 'workspace-1', sessionId: SECOND_SESSION_ID }).status, 'idle')
  assert.throws(
    () => controller.operation({ workspace: 'workspace-1', operationId: first.operationId, sessionId: SECOND_SESSION_ID }),
    /HISTORICAL_OPERATION_SESSION_MISMATCH/,
  )
  assert.equal(controller.operation({ workspace: 'workspace-1', operationId: first.operationId, sessionId: SESSION_ID }).status, 'queued')

  scheduled[0]()
  await new Promise(resolve => setImmediate(resolve))
})

test('Web queued and running states hold the same Jobs-directory lock used by Agent runs', async () => {
  const { controller, scheduled, runLock } = fixture()
  const preview = await controller.preview({ workspace: 'workspace-1', sessionId: SESSION_ID })
  await controller.run({ workspace: 'workspace-1', previewId: preview.previewId, sessionId: SESSION_ID })

  let agentEntered = false
  await assert.rejects(
    runLock.runExclusive(
      { projectRoot: '/work/project', jobsDir: 'jobs' },
      async () => { agentEntered = true },
      { channel: 'agent' },
    ),
    error => {
      assert.equal(error.code, 'HISTORICAL_JOB_ALREADY_RUNNING')
      assert.doesNotMatch(error.message, /work|project|jobs/)
      return true
    },
  )
  assert.equal(agentEntered, false)

  scheduled[0]()
  await new Promise(resolve => setImmediate(resolve))
  await runLock.runExclusive(
    { projectRoot: '/work/project', jobsDir: 'jobs' },
    async () => { agentEntered = true },
    { channel: 'agent' },
  )
  assert.equal(agentEntered, true)
})

test('an Agent-held lock does not consume a Web Preview and releases after Agent failure', async () => {
  const { controller, scheduled, runLock } = fixture()
  const preview = await controller.preview({ workspace: 'workspace-1', sessionId: SESSION_ID })
  let finishAgent
  const agentRun = runLock.runExclusive(
    { projectRoot: '/work/project', jobsDir: 'jobs' },
    () => new Promise(resolve => { finishAgent = resolve }),
    { channel: 'agent' },
  )

  await assert.rejects(
    controller.run({ workspace: 'workspace-1', previewId: preview.previewId, sessionId: SESSION_ID }),
    /HISTORICAL_JOB_ALREADY_RUNNING/,
  )
  finishAgent()
  await agentRun

  await assert.rejects(
    runLock.runExclusive(
      { projectRoot: '/work/project', jobsDir: 'jobs' },
      async () => { throw new Error('agent failure') },
      { channel: 'agent' },
    ),
    /agent failure/,
  )
  const operation = await controller.run({
    workspace: 'workspace-1',
    previewId: preview.previewId,
    sessionId: SESSION_ID,
  })
  assert.equal(operation.status, 'queued')
  scheduled[0]()
  await new Promise(resolve => setImmediate(resolve))
})

test('Historical lock scopes the absolute Jobs directory and rejects unsafe scope configuration', async () => {
  assert.equal(
    historicalRunScope({ projectRoot: '/work/project', jobsDir: 'nested/jobs' }),
    path.join('/work/project', 'nested/jobs'),
  )
  assert.throws(
    () => historicalRunScope({ projectRoot: 'relative/project', jobsDir: 'jobs' }),
    error => error.code === 'HISTORICAL_LOCK_SCOPE_INVALID',
  )
  assert.throws(
    () => historicalRunScope({ projectRoot: '/work/project', jobsDir: '../outside' }),
    error => error.code === 'HISTORICAL_LOCK_SCOPE_INVALID',
  )

  const runLock = new HistoricalRunLock()
  const lease = runLock.acquire({ projectRoot: '/work/project', jobsDir: 'nested/jobs' })
  const independent = runLock.acquire({ projectRoot: '/work/project', jobsDir: 'other/jobs' })
  await assert.rejects(
    runLock.runExclusive(
      { projectRoot: '/work/project/nested', jobsDir: 'jobs' },
      async () => {},
    ),
    /HISTORICAL_JOB_ALREADY_RUNNING/,
  )
  assert.equal(independent.release(), true)
  assert.equal(independent.release(), false)
  lease.release()

  const temporary = await mkdtemp(path.join(os.tmpdir(), 'harbor-run-lock-alias-'))
  const physicalRoot = path.join(temporary, 'physical')
  const aliasRoot = path.join(temporary, 'alias')
  await mkdir(physicalRoot)
  await symlink(physicalRoot, aliasRoot)
  const aliasLease = runLock.acquire({ projectRoot: aliasRoot, jobsDir: 'jobs' })
  await assert.rejects(
    runLock.runExclusive({ projectRoot: physicalRoot, jobsDir: 'jobs' }, async () => {}),
    /HISTORICAL_JOB_ALREADY_RUNNING/,
  )
  aliasLease.release()

  const nestedRoot = path.join(temporary, 'nested-root')
  const sharedRoot = path.join(temporary, 'shared-root')
  await mkdir(nestedRoot)
  await mkdir(sharedRoot)
  await symlink(sharedRoot, path.join(nestedRoot, 'alias'))
  const nestedAliasLease = runLock.acquire({ projectRoot: nestedRoot, jobsDir: 'alias/jobs' })
  await assert.rejects(
    runLock.runExclusive({ projectRoot: sharedRoot, jobsDir: 'jobs' }, async () => {}),
    /HISTORICAL_JOB_ALREADY_RUNNING/,
  )
  nestedAliasLease.release()
})

test('Web Run rejects workspace changes and redacts failed operation paths', async () => {
  const { controller, scheduled } = fixture({ failRun: true })
  const preview = await controller.preview({ workspace: 'workspace-1', sessionId: SESSION_ID })
  await assert.rejects(
    controller.run({ workspace: 'workspace-2', previewId: preview.previewId, sessionId: SESSION_ID }),
    /HISTORICAL_PREVIEW_WORKSPACE_MISMATCH/,
  )
  await assert.rejects(
    controller.run({ workspace: 'workspace-1', previewId: preview.previewId, sessionId: 'session-2' }),
    /HISTORICAL_PREVIEW_SESSION_MISMATCH/,
  )
  const operation = await controller.run({ workspace: 'workspace-1', previewId: preview.previewId, sessionId: SESSION_ID })
  scheduled[0]()
  await new Promise(resolve => setImmediate(resolve))
  const failed = controller.operation({ workspace: 'workspace-1', operationId: operation.operationId, sessionId: SESSION_ID })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.error.code, 'HISTORICAL_JOB_FAILED')
  assert.doesNotMatch(failed.error.message, /Users|private|project|jobs|bearer-private|dXNlcjpwYXNzd29yZA|quoted-token-private|quoted-secret-private|namespaced secret|with spaces/)
  assert.match(failed.error.message, /\[local path\]/)
  assert.match(failed.error.message, /token=\[redacted\]/i)
  assert.match(failed.error.message, /secret=\[redacted\]/i)
})
