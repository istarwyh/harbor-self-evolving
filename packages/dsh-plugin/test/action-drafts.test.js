import assert from 'node:assert/strict'
import { mkdtemp, readdir, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ActionDraftController } from '../lib/action-drafts.js'

async function fixture() {
  const owner = { sessionId: 'session-a', projectRoot: await mkdtemp(path.join(os.tmpdir(), 'harbor-actions-')) }
  let revision = 'revision-a'
  let calls = 0
  const controller = new ActionDraftController({ resolve: async () => ({ freshness: 'FRESH', basedOn: { currentRevision: revision }, refs: { object: { kind: 'harbor.compare/v1', workspace: 'w', job: 'b', baseline: 'a', candidate: 'b' }, selection: [] }, context: {} }), execute: async () => { calls += 1; return { compared: true, productionImpact: 'none' } } })
  const draft = await controller.propose({ kind: 'compare', contextSnapshotId: 'token', proposal: { summary: 'Compare without Gate' } }, owner)
  return { owner, controller, draft, calls: () => calls, drift: () => { revision = 'revision-b' } }
}

test('draft and preview do not write; concurrent repeated confirmation creates exactly one audited operation', async () => {
  const f = await fixture()
  const first = await f.controller.preview({ draftId: f.draft.draftId }, f.owner)
  const second = await f.controller.preview({ draftId: f.draft.draftId }, f.owner)
  assert.deepEqual(await readdir(f.owner.projectRoot), [])
  assert.equal(f.calls(), 0)
  const confirm = preview => f.controller.confirm({ previewId: preview.previewId, contentHash: preview.contentHash, expectedRevision: preview.baseRevision, confirmed: true }, f.owner)
  const operations = await Promise.all([confirm(first), confirm(first), confirm(second)])
  assert.equal(new Set(operations.map(item => item.operationId)).size, 1)
  assert.equal(operations[0].operationId, f.draft.operationId)
  assert.equal(f.calls(), 1)
  assert.deepEqual(operations[0].events.map(event => event.status), ['EXECUTING', 'COMPLETED'])
  assert.equal((await readdir(path.join(f.owner.projectRoot, '.harbor', 'workbench-operations'))).length, 2)
  f.controller.operations.clear()
  assert.equal((await f.controller.operation({ operationId: operations[0].operationId }, f.owner)).status, 'COMPLETED')
})

test('revision conflicts, mismatched confirmation and foreign Session are rejected before any write', async () => {
  const f = await fixture()
  const preview = await f.controller.preview({ draftId: f.draft.draftId }, f.owner)
  const args = { previewId: preview.previewId, contentHash: preview.contentHash, expectedRevision: preview.baseRevision, confirmed: true }
  await assert.rejects(f.controller.confirm({ ...args, contentHash: 'tampered' }, f.owner), /CONFIRMATION_REQUIRED/)
  await assert.rejects(f.controller.confirm(args, { ...f.owner, sessionId: 'foreign' }), /DENIED/)
  f.drift()
  await assert.rejects(f.controller.confirm(args, f.owner), /REVISION_CONFLICT/)
  assert.deepEqual(await readdir(f.owner.projectRoot), [])
  assert.equal(f.calls(), 0)
})

test('unregistered production and unbound offline operations fail closed in UI and API', async () => {
  const f = await fixture()
  await assert.rejects(f.controller.propose({ kind: 'deploy-production' }, f.owner), /UNREGISTERED/)
  const draft = await f.controller.propose({ kind: 'diagnostic-evaluation', contextSnapshotId: 'token', proposal: { summary: 'Diagnose the selected set' } }, f.owner)
  const preview = await f.controller.preview({ draftId: draft.draftId }, f.owner)
  assert.equal(preview.status, 'BLOCKED')
  assert.equal(preview.blocking[0].code, 'OFFLINE_RUNNER_NOT_REGISTERED')
  await assert.rejects(f.controller.confirm({ previewId: preview.previewId, contentHash: preview.contentHash, expectedRevision: preview.baseRevision, confirmed: true }, f.owner), /BLOCKED/)
  assert.equal(f.calls(), 0)
  assert.deepEqual(await readdir(f.owner.projectRoot), [])
})

test('audit storage refuses a linked .harbor directory', async () => {
  const f = await fixture()
  const outside = await mkdtemp(path.join(os.tmpdir(), 'harbor-actions-outside-'))
  await symlink(outside, path.join(f.owner.projectRoot, '.harbor'))
  const preview = await f.controller.preview({ draftId: f.draft.draftId }, f.owner)
  await assert.rejects(f.controller.confirm({ previewId: preview.previewId, contentHash: preview.contentHash, expectedRevision: preview.baseRevision, confirmed: true }, f.owner), /STORAGE_UNSAFE/)
  assert.equal(f.calls(), 0)
  assert.deepEqual(await readdir(outside), [])
})

test('completed cache is bounded while evicted journals remain Session-owned and readable', async () => {
  const f = await fixture()
  let now = Date.now()
  f.controller.now = () => now
  f.controller.maxEntries = 1
  const first = await f.controller.preview({ draftId: f.draft.draftId }, f.owner)
  const confirm = preview => f.controller.confirm({ previewId: preview.previewId, contentHash: preview.contentHash, expectedRevision: preview.baseRevision, confirmed: true }, f.owner)
  const old = await confirm(first)
  now += f.controller.ttlMs + 1
  const draft = await f.controller.propose({ kind: 'compare', contextSnapshotId: 'new-token', proposal: { summary: 'Second comparison' } }, f.owner)
  const next = await confirm(await f.controller.preview({ draftId: draft.draftId }, f.owner))
  assert.equal(f.controller.operations.size, 1)
  assert.equal(f.controller.operations.has(next.operationId), true)
  assert.equal(f.controller.draftOperations.has(f.draft.draftId), false)
  assert.equal((await f.controller.operation({ operationId: old.operationId }, f.owner)).status, 'COMPLETED')
  await assert.rejects(f.controller.operation({ operationId: old.operationId }, { ...f.owner, sessionId: 'foreign' }), /DENIED/)
})
