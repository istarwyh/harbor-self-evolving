import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, symlink, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ActionDraftController } from '../lib/action-drafts.js'

async function fixture() {
  const owner = { sessionId: 'recovery-session', projectRoot: await mkdtemp(path.join(os.tmpdir(), 'harbor-recovery-')) }
  let now = 1_000, executions = 0, observations = 0
  const state = { process: { state: 'stopped', pid: 12345, groupId: 12345 }, resources: { state: 'clean', items: [] }, blockers: [], canRecover: true }
  const options = {
    now: () => now,
    resolve: async () => ({ freshness: 'FRESH', basedOn: { currentRevision: 'rev' }, refs: { object: { kind: 'harbor.job/v1', workspace: 'w', job: 'source' }, selection: [] }, context: {} }),
    prepare: async () => ({ plan: { fixed: true }, public: { limits: { maxTrials: 12 } }, blocking: [] }),
    observe: async operation => { observations += 1; return { resultRef: { verified: true, jobName: `diagnostic-${operation.operationId.slice(4)}`, partial: true } } },
    inspect: async () => structuredClone(state),
    execute: async (_draft, _basis, _owner, execution) => {
      executions += 1
      if (!execution) return { draftOnly: true }
      const { operationId, onSpawn, onUsage } = execution
      onUsage(() => ({ modelRequests: 3, maxModelRequests: 8 }))
      await onSpawn(12345, { job: `diagnostic-${operationId.slice(4)}`, process: { pid: 12345, groupId: 12345, platform: 'darwin' } })
      throw Object.assign(new Error('HARBOR_PROCESS_TIMEOUT: not public stderr'), { code: 'HARBOR_PROCESS_TIMEOUT', cleanupRequired: true, jobName: `diagnostic-${operationId.slice(4)}` })
    },
  }
  const controller = new ActionDraftController(options)
  async function create(kind = 'diagnostic-evaluation', scope = owner) {
    now += 1
    const draft = await controller.propose({ kind, contextSnapshotId: 'token', proposal: { summary: 'fixed scope' } }, scope)
    const preview = await controller.preview({ draftId: draft.draftId }, scope)
    const operation = await controller.confirm({ previewId: preview.previewId, confirmed: true, contentHash: preview.contentHash, expectedRevision: preview.baseRevision }, scope)
    await controller.tasks.get(operation.operationId)?.promise
    return controller.operation({ operationId: operation.operationId }, scope)
  }
  const operation = await create()
  const directory = path.join(owner.projectRoot, '.harbor/workbench-operations')
  const claim = path.join(directory, 'diagnostic-active.json')
  const confirmation = inspection => ({ operationId: operation.operationId, inspectionId: inspection.inspectionId, contentHash: inspection.contentHash, confirmed: true })
  return { owner, controller, options, state, operation, create, directory, claim, confirmation, calls: () => executions, observed: () => observations, elapse: ms => { now += ms } }
}

test('persistent list is Session/project scoped and observes only owned diagnostics after reconnect', async () => {
  const f = await fixture()
  const observer = new ActionDraftController(f.options)
  const before = f.observed()
  assert.deepEqual(await observer.list({}, { ...f.owner, sessionId: 'foreign' }), { items: [] })
  assert.equal(f.observed(), before)
  const result = await observer.list({}, f.owner)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].operationId, f.operation.operationId)
  assert.equal(result.items[0].resultRef.verified, true)
  assert.deepEqual(result.items[0].progress, { source: 'host-model-broker', modelRequests: 3, maxModelRequests: 8 })
  assert.equal(result.items[0].events.find(event => event.status === 'ACTIVE').result.process.pid, 12345)
  assert.equal(f.calls(), 1)
  await f.create('candidate-draft')
  assert.equal((await observer.list({}, f.owner)).items.length, 1)
  const other = { ...f.owner, projectRoot: await mkdtemp(path.join(os.tmpdir(), 'harbor-other-project-')) }
  assert.deepEqual(await observer.list({}, other), { items: [] })
})

test('read-only inspection then exact confirmation releases only the claim and retains FAILED evidence', async () => {
  const f = await fixture()
  const before = await readdir(f.directory)
  const inspection = await f.controller.inspect({ operationId: f.operation.operationId }, f.owner)
  assert.equal(inspection.canRecover, true)
  assert.deepEqual(await readdir(f.directory), before)
  const recovered = await f.controller.recover(f.confirmation(inspection), f.owner)
  assert.equal(recovered.status, 'FAILED')
  assert.equal(recovered.cleanupRequired, false)
  assert.equal(recovered.recoveryRequired, false)
  assert.equal(recovered.recovery.released, true)
  assert.equal(recovered.recovery.rerun, false)
  await assert.rejects(readFile(f.claim), { code: 'ENOENT' })
  assert.equal((await f.controller.recover(f.confirmation(inspection), f.owner)).recovery.released, true)
  const reconnect = new ActionDraftController(f.options)
  assert.equal((await reconnect.list({}, f.owner)).items[0].recovery.released, true)
  assert.equal(f.calls(), 1)
  assert.ok((await readdir(f.directory)).includes(`${f.operation.operationId}.recovery-approved.json`))
})

test('foreign owner, missing approval and stale inspection cannot release a claim', async () => {
  const f = await fixture()
  const inspection = await f.controller.inspect({ operationId: f.operation.operationId }, f.owner)
  await assert.rejects(f.controller.inspect({ operationId: f.operation.operationId }, { ...f.owner, sessionId: 'foreign' }), /DENIED/)
  await assert.rejects(f.controller.recover(f.confirmation(inspection), { ...f.owner, sessionId: 'foreign' }), /DENIED/)
  await assert.rejects(f.controller.recover({ ...f.confirmation(inspection), confirmed: false }, f.owner), /CONFIRMATION_REQUIRED/)
  await assert.rejects(f.controller.recover({ ...f.confirmation(inspection), contentHash: 'different' }, f.owner), /CONFIRMATION_REQUIRED/)
  f.elapse(60_001)
  await assert.rejects(f.controller.recover(f.confirmation(inspection), f.owner), /EXPIRED/)
  assert.equal(JSON.parse(await readFile(f.claim)).operationId, f.operation.operationId)
  assert.equal(f.calls(), 1)
})

test('changed process/resource inspection invalidates confirmation; unknown/running is blocked', async () => {
  const f = await fixture()
  const inspection = await f.controller.inspect({ operationId: f.operation.operationId }, f.owner)
  f.state.resources = { state: 'remaining', items: [{ kind: 'container', id: 'abcdef', project: 'trial__env' }] }
  await assert.rejects(f.controller.recover(f.confirmation(inspection), f.owner), /REVISION_CONFLICT/)
  for (const state of ['running', 'unknown']) {
    f.state.process.state = state
    const blocked = await f.controller.inspect({ operationId: f.operation.operationId }, f.owner)
    assert.equal(blocked.canRecover, false)
    await assert.rejects(f.controller.recover(f.confirmation(blocked), f.owner), /BLOCKED/)
  }
  assert.equal(JSON.parse(await readFile(f.claim)).operationId, f.operation.operationId)
})

test('claim replacement and symlinked storage fail closed without following or unlinking targets', async () => {
  const f = await fixture()
  const inspection = await f.controller.inspect({ operationId: f.operation.operationId }, f.owner)
  await writeFile(f.claim, JSON.stringify({ operationId: 'hop_00000000-0000-0000-0000-000000000000', sessionId: 'foreign' }))
  await assert.rejects(f.controller.recover(f.confirmation(inspection), f.owner), /DENIED/)
  const outside = path.join(f.owner.projectRoot, 'outside-claim.json')
  await writeFile(outside, JSON.stringify({ operationId: f.operation.operationId, sessionId: f.owner.sessionId }))
  await unlink(f.claim)
  await symlink(outside, f.claim)
  await assert.rejects(f.controller.inspect({ operationId: f.operation.operationId }, f.owner), /ELOOP|UNSAFE/)
  assert.equal(JSON.parse(await readFile(outside)).operationId, f.operation.operationId)
  const linkedRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-linked-project-'))
  await symlink(path.join(f.owner.projectRoot, '.harbor'), path.join(linkedRoot, '.harbor'))
  await assert.rejects(f.controller.list({}, { ...f.owner, projectRoot: linkedRoot }), /STORAGE_UNSAFE/)
})

test('a interrupted recovery can finish its receipt without rerun or deleting any replacement claim', async () => {
  const f = await fixture()
  const inspection = await f.controller.inspect({ operationId: f.operation.operationId }, f.owner)
  const approved = { schema: 'harbor-operation-recovery/v1', operationId: f.operation.operationId, sessionId: f.owner.sessionId, released: false, inspectionId: inspection.inspectionId }
  await writeFile(path.join(f.directory, `${f.operation.operationId}.recovery-approved.json`), JSON.stringify(approved))
  await unlink(f.claim)
  const reconnect = new ActionDraftController(f.options)
  const repair = await reconnect.inspect({ operationId: f.operation.operationId }, f.owner)
  assert.equal(repair.pendingReceipt, true)
  assert.equal(repair.canRecover, true)
  const result = await reconnect.recover(f.confirmation(repair), f.owner)
  assert.equal(result.recovery.released, true)
  assert.equal(result.status, 'FAILED')
  assert.equal(f.calls(), 1)
})

test('active execution remains blocked even if an inspector incorrectly reports stopped and clean', async () => {
  const f = await fixture()
  f.controller.tasks.set(f.operation.operationId, { ...f.owner })
  const inspection = await f.controller.inspect({ operationId: f.operation.operationId }, f.owner)
  assert.equal(inspection.canRecover, false)
  assert.ok(inspection.blockers.some(item => item.code === 'DIAGNOSTIC_HOST_STILL_OWNS_RUN'))
})

test('recovery lock prevents two controllers from changing the same claim concurrently', async () => {
  const f = await fixture()
  const second = new ActionDraftController(f.options)
  const firstInspection = await f.controller.inspect({ operationId: f.operation.operationId }, f.owner)
  const secondInspection = await second.inspect({ operationId: f.operation.operationId }, f.owner)
  const results = await Promise.allSettled([f.controller.recover(f.confirmation(firstInspection), f.owner), second.recover(f.confirmation(secondInspection), f.owner)])
  assert.ok(results.some(result => result.status === 'fulfilled'))
  assert.ok(results.every(result => result.status === 'fulfilled' || /RECOVERY_BUSY/.test(result.reason.message)))
  assert.equal((await second.operation({ operationId: f.operation.operationId }, f.owner)).recovery.released, true)
  assert.equal(f.calls(), 1)
})

test('an orphan recovery lock is reported during inspection, not offered as a recoverable action', async () => {
  const f = await fixture()
  const lock = path.join(f.directory, `${f.operation.operationId}.recovery-lock.json`)
  const content = JSON.stringify({ sessionId: f.owner.sessionId, inspectionId: 'previous-host-inspection' })
  await writeFile(lock, content)
  const result = await new ActionDraftController(f.options).inspect({ operationId: f.operation.operationId }, f.owner)
  assert.equal(result.canRecover, false)
  assert.ok(result.blockers.some(item => item.code === 'DIAGNOSTIC_RECOVERY_LOCK_PRESENT'))
  assert.equal(await readFile(lock, 'utf8'), content)
  assert.equal(JSON.parse(await readFile(f.claim)).operationId, f.operation.operationId)
})

test('cancellation before the spawn callback retains its process checkpoint without returning to ACTIVE', async () => {
  const f = await fixture()
  const owner = { ...f.owner, projectRoot: await mkdtemp(path.join(os.tmpdir(), 'harbor-cancel-checkpoint-')) }
  let release, started
  const gate = new Promise(resolve => { release = resolve })
  const began = new Promise(resolve => { started = resolve })
  const controller = new ActionDraftController({ ...f.options, execute: async (_draft, _basis, _owner, execution) => {
    started()
    await gate
    await execution.onSpawn(12345, { job: `diagnostic-${execution.operationId.slice(4)}`, process: { groupId: 12345, platform: 'darwin', hostIdentity: `sha256:${'a'.repeat(64)}`, dockerIdentity: `sha256:${'b'.repeat(64)}` } })
    throw Object.assign(new Error('HARBOR_PROCESS_ABORTED'), { code: 'HARBOR_PROCESS_ABORTED', cleanupRequired: true })
  } })
  const draft = await controller.propose({ kind: 'diagnostic-evaluation', contextSnapshotId: 'token', proposal: {} }, owner)
  const preview = await controller.preview({ draftId: draft.draftId }, owner)
  const operation = await controller.confirm({ previewId: preview.previewId, confirmed: true, contentHash: preview.contentHash, expectedRevision: preview.baseRevision }, owner)
  await began
  const task = controller.tasks.get(operation.operationId).promise
  assert.equal((await controller.cancel({ operationId: operation.operationId }, owner)).status, 'CANCELLING')
  release()
  await task
  const value = await new ActionDraftController(f.options).operation({ operationId: operation.operationId }, owner)
  assert.equal(value.status, 'CANCELLED')
  assert.equal(value.cleanupRequired, true)
  assert.deepEqual(value.events.map(event => event.status), ['SCHEDULED', 'EXECUTING', 'CANCELLING', 'CANCELLING', 'CANCELLED'])
  assert.equal(value.events[3].result.process.groupId, 12345)
  assert.equal(value.events[3].result.process.hostIdentity, `sha256:${'a'.repeat(64)}`)
})

test('list pagination keeps recovery-needing diagnostics visible and rejects foreign cursors', async () => {
  const f = await fixture()
  const inspection = await f.controller.inspect({ operationId: f.operation.operationId }, f.owner)
  await f.controller.recover(f.confirmation(inspection), f.owner)
  const latest = await f.create()
  const observations = f.observed()
  const page = await f.controller.list({ limit: '1' }, f.owner)
  assert.equal(f.observed() - observations, 1, 'only returned page reads evidence artifacts')
  assert.equal(page.items[0].operationId, latest.operationId)
  assert.equal(page.nextCursor, latest.operationId)
  const next = await f.controller.list({ limit: 1, cursor: page.nextCursor }, f.owner)
  assert.equal(next.items[0].operationId, f.operation.operationId)
  assert.equal(next.nextCursor, undefined)
  await assert.rejects(f.controller.list({ cursor: 'hop_00000000-0000-0000-0000-000000000000' }, f.owner), /INVALID/)
  for (const limit of ['', ' 20', '1.5', '-1', '0', '101', 'Infinity']) await assert.rejects(f.controller.list({ limit }, f.owner), /INVALID/)
})
