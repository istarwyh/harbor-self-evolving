import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ActionDraftController } from '../lib/action-drafts.js'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
async function fixture() {
  const owner = { sessionId: 'session-a', projectRoot: await mkdtemp(path.join(os.tmpdir(), 'harbor-bounded-actions-')) }
  const release = deferred(), started = deferred(), cleanup = deferred()
  let calls = 0, planRevision = 1, cleaned = false
  const options = {
    resolve: async () => ({ freshness: 'FRESH', basedOn: { currentRevision: 'rev-a' }, refs: { object: { kind: 'harbor.job/v1', workspace: 'w', job: 'source' }, selection: [{ kind: 'harbor.trial-set/v1', id: 'fixed', selectionCount: 12 }] }, context: {} }),
    prepare: async () => ({ plan: { planRevision, members: Array.from({ length: 12 }, (_, i) => `trial-${i}`) }, blocking: [], public: { execution: 'bounded-diagnostic', diagnosticOnly: true, trialCount: 12, limits: { maxTrials: 12 } } }),
    execute: async (_draft, _basis, _owner, { signal, operationId }) => {
      calls += 1; started.resolve()
      await Promise.race([release.promise, new Promise(done => { if (signal.aborted) done(); else signal.addEventListener('abort', done, { once: true }) })])
      if (signal.aborted) { await cleanup.promise; cleaned = true; throw new Error('aborted') }
      return { operationId, jobName: 'diagnostic-result', diagnosticOnly: true }
    },
  }
  const controller = new ActionDraftController(options)
  const draft = await controller.propose({ kind: 'diagnostic-evaluation', contextSnapshotId: 'host-token', proposal: { summary: 'Diagnose exactly these 12 Trials' } }, owner)
  const preview = await controller.preview({ draftId: draft.draftId }, owner)
  const args = { previewId: preview.previewId, confirmed: true, contentHash: preview.contentHash, expectedRevision: preview.baseRevision }
  return { owner, options, controller, draft, preview, args, release, started, cleanup, calls: () => calls, cleaned: () => cleaned, drift: () => { planRevision += 1 } }
}

test('bounded preview is zero-write, freezes all 12 members, and repeated confirms schedule one operation', async () => {
  const f = await fixture()
  assert.equal(f.preview.trialCount, 12)
  assert.deepEqual(await readdir(f.owner.projectRoot), [])
  assert.equal(f.calls(), 0)
  const accepted = await Promise.all([f.controller.confirm(f.args, f.owner), f.controller.confirm(f.args, f.owner)])
  assert.equal(new Set(accepted.map(value => value.operationId)).size, 1)
  assert.equal(accepted[0].operationId, f.draft.operationId)
  assert.equal(accepted[0].status, 'SCHEDULED')
  await f.started.promise
  assert.equal(f.calls(), 1)
  const task = f.controller.tasks.get(f.draft.operationId).promise
  f.release.resolve(); await task
  const done = await f.controller.operation({ operationId: f.draft.operationId }, f.owner)
  assert.equal(done.status, 'COMPLETED')
  assert.deepEqual(done.events.map(e => e.sequence), [1, 2, 3])
  assert.deepEqual(done.events.map(e => e.status), ['SCHEDULED', 'EXECUTING', 'COMPLETED'])
  assert.equal((await f.controller.confirm(f.args, f.owner)).status, 'COMPLETED')
  assert.equal(f.calls(), 1)
  assert.equal((await readdir(path.join(f.owner.projectRoot, '.harbor/workbench-operations'))).includes('diagnostic-active.json'), false)
})

test('materialized plan identity drift invalidates exact confirmation before any write', async () => {
  const f = await fixture(); f.drift()
  await assert.rejects(f.controller.confirm(f.args, f.owner), /REVISION_CONFLICT/)
  assert.equal(f.calls(), 0)
  assert.deepEqual(await readdir(f.owner.projectRoot), [])
})

test('cancel is Session-owned and cannot report CANCELLED before real executor cleanup', async () => {
  const f = await fixture()
  await f.controller.confirm(f.args, f.owner); await f.started.promise
  const args = { operationId: f.draft.operationId }
  await assert.rejects(f.controller.cancel(args, { ...f.owner, sessionId: 'foreign' }), /DENIED/)
  const task = f.controller.tasks.get(args.operationId).promise
  assert.equal((await f.controller.cancel(args, f.owner)).status, 'CANCELLING')
  assert.equal(f.cleaned(), false)
  assert.equal((await f.controller.operation(args, f.owner)).status, 'CANCELLING')
  f.cleanup.resolve(); await task
  assert.equal(f.cleaned(), true)
  assert.equal((await f.controller.operation(args, f.owner)).status, 'CANCELLED')
  assert.equal((await f.controller.cancel(args, f.owner)).status, 'CANCELLED')
  assert.equal(f.calls(), 1)
})

test('a reconnect reads durable terminal journals without re-executing; incomplete ownership is INTERRUPTED', async () => {
  const f = await fixture()
  await f.controller.confirm(f.args, f.owner); await f.started.promise
  const reconnect = new ActionDraftController(f.options)
  const args = { operationId: f.draft.operationId }
  assert.equal((await reconnect.operation(args, f.owner)).status, 'INTERRUPTED')
  assert.equal((await reconnect.operation(args, f.owner)).recoveryRequired, true)
  const another = await reconnect.propose({ kind: 'diagnostic-evaluation', contextSnapshotId: 'host-token', proposal: { summary: 'A new run' } }, f.owner)
  assert.equal((await reconnect.preview({ draftId: another.draftId }, f.owner)).blocking[0].code, 'DIAGNOSTIC_RECOVERY_REQUIRED')
  assert.equal(f.calls(), 1)
  const task = f.controller.tasks.get(args.operationId).promise
  f.release.resolve(); await task
  assert.equal((await reconnect.operation(args, f.owner)).status, 'COMPLETED')
  assert.equal(f.calls(), 1)
})

test('durable workspace claim closes the race between two Host controllers', async () => {
  const f = await fixture()
  const second = new ActionDraftController(f.options)
  const draft = await second.propose({ kind: 'diagnostic-evaluation', contextSnapshotId: 'host-token', proposal: { summary: 'Another diagnostic' } }, f.owner)
  const preview = await second.preview({ draftId: draft.draftId }, f.owner)
  await f.controller.confirm(f.args, f.owner); await f.started.promise
  await assert.rejects(second.confirm({ previewId: preview.previewId, contentHash: preview.contentHash, expectedRevision: preview.baseRevision, confirmed: true }, f.owner), /RECOVERY_REQUIRED/)
  assert.equal(f.calls(), 1)
  const task = f.controller.tasks.get(f.draft.operationId).promise
  f.release.resolve(); await task
})

test('journal write failure cannot become successful execution or release its recovery claim', async () => {
  const f = await fixture()
  await f.controller.confirm(f.args, f.owner); await f.started.promise
  const directory = path.join(f.owner.projectRoot, '.harbor/workbench-operations')
  await writeFile(path.join(directory, `${f.draft.operationId}.3.json`), '{}', { flag: 'wx' })
  const task = f.controller.tasks.get(f.draft.operationId).promise
  f.release.resolve(); await task
  const value = await f.controller.operation({ operationId: f.draft.operationId }, f.owner)
  assert.equal(value.status, 'INTERRUPTED')
  assert.equal(value.recoveryRequired, true)
  assert.equal(JSON.parse(await readFile(path.join(directory, 'diagnostic-active.json'), 'utf8')).operationId, f.draft.operationId)
})

test('Host disposal cancels and awaits owned execution and rejects new confirmations', async () => {
  const f = await fixture()
  await f.controller.confirm(f.args, f.owner); await f.started.promise
  let disposed = false
  const shutdown = f.controller.dispose().then(() => { disposed = true })
  await new Promise(done => setImmediate(done))
  assert.equal(disposed, false)
  await assert.rejects(f.controller.confirm(f.args, f.owner), /HOST_CLOSED/)
  f.cleanup.resolve(); await shutdown
  assert.equal(f.cleaned(), true)
  assert.equal((await f.controller.operation({ operationId: f.draft.operationId }, f.owner)).status, 'CANCELLED')
})

test('uncertain Docker cleanup preserves the durable claim and safe Job reference after failure', async () => {
  const f = await fixture()
  f.controller.execute = async (_draft, _basis, _owner, { operationId }) => {
    throw Object.assign(new Error('HARBOR_PROCESS_TIMEOUT: private stderr is not an audit message'), { code: 'HARBOR_PROCESS_TIMEOUT', cleanupRequired: true, jobName: `diagnostic-${operationId.slice(4)}` })
  }
  await f.controller.confirm(f.args, f.owner)
  await f.controller.tasks.get(f.draft.operationId)?.promise
  const operation = await f.controller.operation({ operationId: f.draft.operationId }, f.owner)
  assert.equal(operation.status, 'FAILED')
  assert.equal(operation.cleanupRequired, true)
  assert.equal(operation.events.at(-1).result.jobName, `diagnostic-${f.draft.operationId.slice(4)}`)
  assert.doesNotMatch(JSON.stringify(operation), /private stderr/)
  const claim = path.join(f.owner.projectRoot, '.harbor/workbench-operations/diagnostic-active.json')
  assert.equal(JSON.parse(await readFile(claim, 'utf8')).operationId, f.draft.operationId)
  const second = await f.controller.propose({ kind: 'diagnostic-evaluation', contextSnapshotId: 'new-token', proposal: { summary: 'Try another run' } }, f.owner)
  assert.equal((await f.controller.preview({ draftId: second.draftId }, f.owner)).blocking[0].code, 'DIAGNOSTIC_RECOVERY_REQUIRED')
})
