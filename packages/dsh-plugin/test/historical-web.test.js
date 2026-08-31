import assert from 'node:assert/strict'
import test from 'node:test'

import { HistoricalWebController } from '../lib/historical-web.js'

function fixture({ failRun = false } = {}) {
  const calls = { preview: [], run: [] }
  const scheduled = []
  const ids = ['preview-id', 'owner-id', 'operation-id']
  const service = {
    async historicalWorkspace(args) {
      assert.equal(args.workspace, 'workspace-1')
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
      if (failRun) throw new Error('HISTORICAL_JOB_FAILED: failed under /Users/private/project/jobs/run')
      return { job: 'jobs/history-job' }
    },
  }
  const controller = new HistoricalWebController({
    service,
    sessionDiagnostic,
    now: () => new Date('2026-08-31T12:00:00.000Z'),
    randomId: () => ids.shift(),
    schedule: callback => scheduled.push(callback),
  })
  return { controller, calls, scheduled }
}

test('Web Preview keeps the selection token server-side and exposes only safe metadata', async () => {
  const { controller, calls } = fixture()
  const result = await controller.preview({ workspace: 'workspace-1' })

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
    ownerSessionId: 'web-historical:owner-id',
  })
})

test('Web Run is asynchronous, idempotent per Preview, and opens the completed Job by name', async () => {
  const { controller, calls, scheduled } = fixture()
  const preview = await controller.preview({ workspace: 'workspace-1' })
  const first = await controller.run({ workspace: 'workspace-1', previewId: preview.previewId })
  const repeated = await controller.run({ workspace: 'workspace-1', previewId: preview.previewId })

  assert.equal(first.status, 'queued')
  assert.equal(repeated.operationId, first.operationId)
  assert.equal(scheduled.length, 1)
  assert.equal(calls.run.length, 0)

  scheduled[0]()
  await new Promise(resolve => setImmediate(resolve))
  const completed = controller.operation({ workspace: 'workspace-1', operationId: first.operationId })
  assert.equal(completed.status, 'completed')
  assert.equal(completed.jobName, 'history-job')
  assert.deepEqual(calls.run[0].args, { selectionToken: 'private-selection-token' })
  assert.equal(controller.operation({ workspace: 'workspace-1' }).status, 'idle')
})

test('Web Run rejects workspace changes and redacts failed operation paths', async () => {
  const { controller, scheduled } = fixture({ failRun: true })
  const preview = await controller.preview({ workspace: 'workspace-1' })
  await assert.rejects(
    controller.run({ workspace: 'workspace-2', previewId: preview.previewId }),
    /HISTORICAL_PREVIEW_WORKSPACE_MISMATCH/,
  )
  const operation = await controller.run({ workspace: 'workspace-1', previewId: preview.previewId })
  scheduled[0]()
  await new Promise(resolve => setImmediate(resolve))
  const failed = controller.operation({ workspace: 'workspace-1', operationId: operation.operationId })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.error.code, 'HISTORICAL_JOB_FAILED')
  assert.doesNotMatch(failed.error.message, /Users|private|project|jobs/)
  assert.match(failed.error.message, /\[local path\]/)
})
