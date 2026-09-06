import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildHistoricalGenerationBatch, writePrivateHistoricalBatch } from '../lib/session-materializer.js'
import { foldSessionDiagnosticIndex } from '../lib/session-projection.js'
import { buildSessionObservation } from '../lib/session-redaction.js'
import { canonicalDigest } from '../lib/session-selection.js'

const NOW = new Date('2026-09-06T12:00:00Z')

function selection(id, cwd) {
  const header = { version: 0, id, cwd, createdAt: 1_000, agentPreset: 'default' }
  const events = [
    { type: 'turn/start', seq: 0, time: 1_000, data: { turn: 0 } },
    { type: 'user/message', seq: 1, time: 1_001, surfaceOp: 'append', data: { id: `${id}-u`, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Solve the example task' }] } },
    { type: 'assistant/message', seq: 2, time: 1_002, surfaceOp: 'append', data: { turn: 0, step: 0, message: { id: `${id}-a`, role: 'assistant', source: { kind: 'model', provider: 'test', model: 'fixture' }, content: [{ type: 'text', text: 'The example task is complete' }] } } },
    { type: 'turn/end', seq: 3, time: 1_003, data: { turn: 0, reason: { kind: 'completed' } } },
  ]
  const sourceRef = canonicalDigest({ id, header }, 'harbor-dsh-session-source-ref-v1')
  return {
    rawSessionId: id,
    header,
    events,
    index: foldSessionDiagnosticIndex(events, header),
    sourceDigest: canonicalDigest({ session: header, events }, 'harbor-dsh-session-source-v1'),
    sourceRef,
    capturedThroughSeq: 3,
    trialId: `session-${sourceRef.slice(7, 19)}`,
  }
}

function build(projectRoot, selections, options = {}) {
  const observations = selections.map(item => buildSessionObservation(item))
  return {
    observations,
    batch: buildHistoricalGenerationBatch({ projectRoot, selections, observations, now: NOW, ...options }),
  }
}

function assertBatchDigest(batch) {
  const { digest, ...content } = batch
  assert.equal(digest, canonicalDigest(content, 'harbor-dsh-historical-generation-batch-v1'))
}

test('Historical Batch retains the v1 exact-cwd default and hashes known source projects', () => {
  const root = '/tmp/hse-output-project'
  const { batch } = build(root, [selection('private-session-current-project', root)])

  assert.equal(batch.schema_version, 1)
  assert.equal(batch.protocol, 'historical-generation-batch/v1')
  assert.equal(batch.selection.scope, 'exact-cwd')
  assert.equal(batch.selection.scan, undefined)
  assert.equal(batch.records[0].source_project_digest, batch.project.cwd_digest)
  assertBatchDigest(batch)
})

test('Historical Batch accepts the legacy exact-cwd all-candidates scan', () => {
  const { batch } = build('/tmp/hse-output-project', [selection('private-exact-source', '/tmp/hse-output-project')], {
    scan: {
      scope: 'exact-cwd', listedCount: 5, candidateCount: 3, readCount: 3,
      unscannedCount: 0, partial: false,
      windowOrder: 'all-candidates', selectionOrder: 'last-activity-desc',
    },
  })
  assert.equal(batch.selection.scope, 'exact-cwd')
  assert.equal(batch.selection.scan.window_order, 'all-candidates')
  assert.equal(batch.selection.scan.partial, false)
  assertBatchDigest(batch)
})

test('Historical Batch keeps mixed source provenance independent from its output workspace', async t => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'hse-history-output-'))
  t.after(() => rm(projectRoot, { recursive: true, force: true }))
  const sourceRoots = ['/private/historical-source-alpha', '/private/historical-source-beta']
  const selected = sourceRoots.map((root, index) => selection(`private-source-session-${index}`, root))
  const { batch, observations } = build(projectRoot, selected, { scope: 'dsh-history' })
  const written = await writePrivateHistoricalBatch({ projectRoot, batch, observations })
  const persisted = JSON.parse(await readFile(written.batchPath, 'utf8'))

  assert.equal(persisted.selection.scope, 'dsh-history')
  assert.equal(persisted.project.cwd_digest, canonicalDigest({ cwd: path.resolve(projectRoot) }, 'harbor-dsh-project-cwd-v1'))
  assert.ok(written.batchPath.startsWith(path.join(projectRoot, '.harbor', 'private', 'session-batches') + path.sep))
  assert.equal(new Set(persisted.records.map(record => record.source_project_digest)).size, 2)
  for (const [index, record] of persisted.records.entries()) {
    assert.equal(record.source_project_digest, canonicalDigest({ cwd: sourceRoots[index] }, 'harbor-dsh-project-cwd-v1'))
    assert.notEqual(record.source_project_digest, persisted.project.cwd_digest)
    assert.equal(record.source_ref, selected[index].sourceRef)
    assert.equal(record.source_digest, selected[index].sourceDigest)
    assert.equal(record.observation_digest, observations[index].digest)
    assert.deepEqual(JSON.parse(await readFile(path.join(written.batchDir, record.observation_path), 'utf8')), observations[index])
  }
  const serialized = JSON.stringify({ batch: persisted, observations })
  for (const privateValue of [...sourceRoots, projectRoot, ...selected.map(item => item.rawSessionId)]) {
    assert.equal(serialized.includes(privateValue), false)
  }
  assertBatchDigest(persisted)
})

test('Unknown source projects are not replaced with the output project identity', () => {
  for (const cwd of [undefined, '', 'relative-project']) {
    const { batch } = build('/tmp/hse-output', [selection('private-unknown-source', cwd)], { scope: 'dsh-history' })
    assert.equal(Object.hasOwn(batch.records[0], 'source_project_digest'), false)
    assertBatchDigest(batch)
  }
})

test('Historical Batch records the bounded scan separately from the selected record count', () => {
  const scan = {
    scope: 'dsh-history', listedCount: 30, candidateCount: 20, readCount: 8,
    unscannedCount: 12, partial: true,
    windowOrder: 'created-at-desc', selectionOrder: 'last-activity-desc',
  }
  const selected = [selection('private-window-source', '/private/window-source')]
  const { batch } = build('/tmp/hse-output', selected, { scope: 'dsh-history', scan })
  assert.equal(batch.selection.selected_count, 1)
  assert.deepEqual(batch.selection.scan, {
    scope: 'dsh-history', listed_count: 30, candidate_count: 20, read_count: 8,
    unscanned_count: 12, partial: true,
    window_order: 'created-at-desc', selection_order: 'last-activity-desc',
  })
  assertBatchDigest(batch)
  const complete = build('/tmp/hse-output', selected, {
    scope: 'dsh-history', scan: { ...scan, readCount: 20, unscannedCount: 0, partial: false },
  }).batch
  assert.equal(complete.selection.scan.partial, false)
  for (const invalid of [
    { ...scan, scope: 'exact-cwd' },
    { ...scan, partial: false },
    { ...scan, readCount: 9 },
    { ...scan, listedCount: 10 },
    { ...scan, windowOrder: 'last-activity-desc' },
  ]) {
    assert.throws(() => build('/tmp/hse-output', selected, { scope: 'dsh-history', scan: invalid }), /HISTORICAL_BATCH_SCAN_INVALID/)
  }
  assert.throws(() => build('/tmp/hse-output', selected, { scope: 'unknown' }), /HISTORICAL_BATCH_SCOPE_INVALID/)
})
