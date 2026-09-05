import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DiagnosticRunner, DIAGNOSTIC_LIMITS } from '../lib/diagnostic-runner.js'
import { EvolutionService } from '../lib/service.js'

const sessionId = 'bounded-session'
const job = 'bounded-source'
const ids = Array.from({ length: 13 }, (_, index) => `execution-${String(index + 1).padStart(2, '0')}`)

async function inventory(root, relative = '') {
  const result = []
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const file = path.join(relative, entry.name)
    if (entry.isDirectory()) result.push(...await inventory(root, file))
    else result.push([file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')])
  }
  return result.sort((a, b) => a[0].localeCompare(b[0]))
}

async function fixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-bounded-service-'))
  const directory = path.join(projectRoot, 'jobs', job)
  await mkdir(directory, { recursive: true })
  const lifecycle = {
    schema_version: 1, job, dataset_total: ids.length, updated_at: '2026-09-05T00:00:00Z',
    counts: { 'candidate-quality-failed': 12, completed: 1 },
    trials: ids.map((id, index) => ({
      dataset_order: index, dataset_trial: `task-${index + 1}`, execution_id: id, trial_name: `trial-${index + 1}`,
      phase: index < 12 ? 'candidate-quality-failed' : 'completed', terminal: true, attempt: 1,
      updated_at: '2026-09-05T00:00:00Z', score: { value: index < 12 ? 0 : 1, valid: true, invalid_reasons: [] },
    })),
  }
  await writeFile(path.join(directory, 'trial-lifecycle.json'), JSON.stringify(lifecycle))
  await writeFile(path.join(directory, 'evaluation-summary.json'), JSON.stringify({ schema_version: 3, job, mode: 'diagnostic', n_trials: ids.length, n_valid_scores: ids.length, metrics: { reward: 1 / 13 } }))
  await writeFile(path.join(directory, 'evaluation-context.json'), JSON.stringify({ schema_version: 2, digest: `sha256:${'a'.repeat(64)}` }))
  let liveRoot = projectRoot
  const service = new EvolutionService({ projectRoot, jobsDir: 'jobs' }, { sessionProjectRoot: requested => [sessionId, 'foreign-session'].includes(requested) ? liveRoot : undefined })
  const workspace = (await service.dashboard({ sessionId })).workspace.id
  return { projectRoot, directory, lifecycle, service, workspace, moveSession: root => { liveRoot = root } }
}

async function prepareDraft(f, { count = 12, kind = 'diagnostic-evaluation', mode = 'query-snapshot' } = {}) {
  const selection = await f.service.createTrialSelection({ sessionId, workspace: f.workspace, job, mode, ...(mode === 'explicit' ? { trialIds: ids.slice(0, count) } : { filters: { status: 'candidate-quality-failed' } }) })
  const bound = await f.service.bindUiContext({ sessionId, context: {
    schema: 'harbor-ui-context/v1', sessionId, pageSessionId: `bounded-page-${selection.ref.id}`, generation: 1, workspace: f.workspace,
    route: { name: 'harbor.job', params: { job, stage: 'judge' } },
    object: { kind: 'job', id: job, job, stage: 'judge' }, selection: [selection.ref], observedAt: new Date().toISOString(),
  } })
  const draft = await f.service.proposeAction({ sessionId, contextSnapshotId: bound.contextSnapshotId, kind, summary: 'Inspect only the frozen failed Trials.' })
  return { draft, selection, bound }
}

function runnerStub(t, { execute, prepare } = {}) {
  const prepares = [], executions = []
  t.mock.method(DiagnosticRunner.prototype, 'prepare', async function (args) {
    prepares.push(structuredClone(args))
    if (prepare) return prepare(args)
    return { sourceJob: args.sourceJobDir, selection: args.trialIds.map(trialId => ({ trialId })), limits: { ...DIAGNOSTIC_LIMITS }, effectiveLimits: { ...DIAGNOSTIC_LIMITS, maxModelRequests: 10 }, mode: 'diagnostic', productionImpact: 'none' }
  })
  t.mock.method(DiagnosticRunner.prototype, 'execute', async function (plan, options) {
    executions.push({ plan: structuredClone(plan), owner: { ...options.owner }, operationId: options.operationId })
    if (execute) return execute(plan, options)
    return { schema: 'harbor-diagnostic-operation-result/v1', job: `diagnostic-${options.operationId.slice(4)}`, selectionCount: plan.selection.length, productionImpact: 'none' }
  })
  return { prepares, executions }
}

const confirmation = preview => ({ sessionId, previewId: preview.previewId, contentHash: preview.contentHash, expectedRevision: preview.baseRevision, confirmed: true })
async function settled(f, operationId) {
  const task = f.service.actionDrafts.tasks.get(operationId)
  if (task) await task.promise
  return f.service.actionOperation({ sessionId, operationId })
}

test('real 12-Trial frozen selection reaches runner intact even when model-facing evidence is unavailable; preflight writes nothing', async t => {
  const f = await fixture()
  const calls = runnerStub(t)
  const before = await inventory(f.projectRoot)
  const { draft, selection } = await prepareDraft(f)
  assert.equal(selection.count, 12)
  const original = f.service.resolveUiContext.bind(f.service)
  t.mock.method(f.service, 'resolveUiContext', async (...args) => ({ ...await original(...args), selectedEvidence: [{ available: false, reason: 'Reader budget exhausted' }] }))
  const first = await f.service.previewAction({ sessionId, draftId: draft.draftId })
  const second = await f.service.previewAction({ sessionId, draftId: draft.draftId })
  assert.equal(first.status, 'READY_FOR_REVIEW')
  assert.equal(first.trialCount, 12)
  assert.equal(first.limits.maxModelRequests, 10)
  assert.equal(first.estimatedHostModelRequests, 10)
  assert.deepEqual(calls.prepares[0].trialIds, ids.slice(0, 12))
  assert.deepEqual(await inventory(f.projectRoot), before)
  assert.equal(calls.executions.length, 0)
  const operations = await Promise.all([f.service.confirmAction(confirmation(first)), f.service.confirmAction(confirmation(first)), f.service.confirmAction(confirmation(second))])
  assert.equal(new Set(operations.map(item => item.operationId)).size, 1)
  const complete = await settled(f, operations[0].operationId)
  assert.equal(complete.status, 'COMPLETED')
  assert.equal(calls.executions.length, 1)
  assert.deepEqual(calls.executions[0].plan.selection.map(item => item.trialId), ids.slice(0, 12))
  assert.equal(calls.executions[0].owner.projectRoot, f.projectRoot)
  assert.equal(complete.events.at(-1).result.selectionCount, 12)
  const reconnected = new EvolutionService({ projectRoot: f.projectRoot, jobsDir: 'jobs' }, { sessionProjectRoot: () => f.projectRoot })
  assert.deepEqual(await reconnected.actionOperation({ sessionId, operationId: complete.operationId }), complete)
  await assert.rejects(reconnected.actionOperation({ sessionId: 'foreign-session', operationId: complete.operationId }), /DENIED/)
})

test('13-Trial execution and quality failures mislabeled as infrastructure retries are blocked without writes', async t => {
  const f = await fixture()
  const calls = runnerStub(t)
  const before = await inventory(f.projectRoot)
  for (const options of [{ count: 13, mode: 'explicit' }, { kind: 'retry-infrastructure' }]) {
    const { draft } = await prepareDraft(f, options)
    const preview = await f.service.previewAction({ sessionId, draftId: draft.draftId })
    assert.equal(preview.status, 'BLOCKED')
    await assert.rejects(f.service.confirmAction(confirmation(preview)), /HARBOR_ACTION_BLOCKED/)
  }
  assert.equal(calls.prepares.length, 0)
  assert.equal(calls.executions.length, 0)
  assert.deepEqual(await inventory(f.projectRoot), before)
})

test('frozen member revision drift invalidates confirmation instead of expanding or silently rerunning the filter', async t => {
  const f = await fixture()
  const calls = runnerStub(t)
  const { draft } = await prepareDraft(f)
  const preview = await f.service.previewAction({ sessionId, draftId: draft.draftId })
  f.lifecycle.trials[11].score.value = 0.25
  await writeFile(path.join(f.directory, 'trial-lifecycle.json'), JSON.stringify(f.lifecycle))
  const beforeConfirm = await inventory(f.projectRoot)
  await assert.rejects(f.service.confirmAction(confirmation(preview)), /STALE_SELECTION|REVISION_CONFLICT/)
  assert.equal(calls.executions.length, 0)
  assert.deepEqual(await inventory(f.projectRoot), beforeConfirm)
})

test('foreign Session and moved Session project cannot consume a reviewed preview or operation', async t => {
  const f = await fixture()
  const calls = runnerStub(t)
  const { draft } = await prepareDraft(f)
  const preview = await f.service.previewAction({ sessionId, draftId: draft.draftId })
  await assert.rejects(f.service.confirmAction({ ...confirmation(preview), sessionId: 'foreign-session' }), /DENIED/)
  const otherRoot = await mkdtemp(path.join(os.tmpdir(), 'harbor-bounded-other-'))
  f.moveSession(otherRoot)
  await assert.rejects(f.service.confirmAction(confirmation(preview)), /DENIED/)
  assert.equal(calls.executions.length, 0)
  assert.deepEqual(await readdir(otherRoot), [])
})

test('runner exception settles a failed operation with no raw secret and no implicit retry', async t => {
  const f = await fixture()
  const calls = runnerStub(t, { execute: async () => { throw Object.assign(new Error('api_key=private-value /Users/private/log'), { code: 'HARBOR_PROCESS_TIMEOUT' }) } })
  const { draft } = await prepareDraft(f)
  const preview = await f.service.previewAction({ sessionId, draftId: draft.draftId })
  const accepted = await f.service.confirmAction(confirmation(preview))
  const failed = await settled(f, accepted.operationId)
  assert.equal(failed.status, 'FAILED')
  assert.equal(failed.events.at(-1).result.code, 'HARBOR_PROCESS_TIMEOUT')
  assert.doesNotMatch(JSON.stringify(failed), /private-value|Users\/private/)
  assert.equal((await f.service.confirmAction(confirmation(preview))).operationId, failed.operationId)
  assert.equal(calls.executions.length, 1)
})

test('service cancellation is owner-scoped and waits for runner cleanup before the terminal event', async t => {
  const f = await fixture()
  let entered, clean
  const executing = new Promise(resolve => { entered = resolve })
  const cleanup = new Promise(resolve => { clean = resolve })
  const calls = runnerStub(t, { execute: async (plan, options) => {
    entered()
    await new Promise(resolve => options.signal.aborted ? resolve() : options.signal.addEventListener('abort', resolve, { once: true }))
    await cleanup
    throw Object.assign(new Error('Cancelled after cleanup'), { code: 'HARBOR_PROCESS_ABORTED' })
  } })
  const { draft } = await prepareDraft(f)
  const preview = await f.service.previewAction({ sessionId, draftId: draft.draftId })
  const accepted = await f.service.confirmAction(confirmation(preview))
  await executing
  try {
    await assert.rejects(f.service.cancelAction({ sessionId: 'foreign-session', operationId: accepted.operationId }), /DENIED/)
    const cancelling = await f.service.cancelAction({ sessionId, operationId: accepted.operationId })
    assert.equal(cancelling.status, 'CANCELLING')
    assert.equal((await f.service.actionOperation({ sessionId, operationId: accepted.operationId })).status, 'CANCELLING')
    clean()
    const cancelled = await settled(f, accepted.operationId)
    assert.equal(cancelled.status, 'CANCELLED')
    assert.equal(calls.executions.length, 1)
  } finally { clean(); await settled(f, accepted.operationId) }
})

test('independent Host service instances share one durable project claim and never start two diagnostics', async t => {
  const first = await fixture()
  const second = { ...first, service: new EvolutionService({ projectRoot: first.projectRoot, jobsDir: 'jobs' }, { sessionProjectRoot: () => first.projectRoot }) }
  second.workspace = (await second.service.dashboard({ sessionId })).workspace.id
  let release
  const hold = new Promise(resolve => { release = resolve })
  const calls = runnerStub(t, { execute: async (plan, options) => { await hold; return { job: `diagnostic-${options.operationId.slice(4)}`, selectionCount: plan.selection.length } } })
  const drafts = await Promise.all([prepareDraft(first), prepareDraft(second)])
  const previews = await Promise.all([first.service.previewAction({ sessionId, draftId: drafts[0].draft.draftId }), second.service.previewAction({ sessionId, draftId: drafts[1].draft.draftId })])
  assert.deepEqual(previews.map(preview => preview.status), ['READY_FOR_REVIEW', 'READY_FOR_REVIEW'])
  const attempts = await Promise.allSettled([first.service.confirmAction(confirmation(previews[0])), second.service.confirmAction(confirmation(previews[1]))])
  const successes = attempts.filter(item => item.status === 'fulfilled')
  const failures = attempts.filter(item => item.status === 'rejected')
  assert.equal(successes.length, 1)
  assert.equal(failures.length, 1)
  assert.match(failures[0].reason.message, /RECOVERY_REQUIRED/)
  const accepted = successes[0].value
  const winner = first.service.actionDrafts.tasks.has(accepted.operationId) ? first : second
  const observer = winner === first ? second : first
  try {
    const observed = await observer.service.actionOperation({ sessionId, operationId: accepted.operationId })
    assert.equal(observed.status, 'INTERRUPTED')
    assert.equal(observed.recoveryRequired, true)
    assert.ok(['SCHEDULED', 'EXECUTING', 'ACTIVE'].includes((await winner.service.actionOperation({ sessionId, operationId: accepted.operationId })).status))
    const claim = JSON.parse(await readFile(path.join(first.projectRoot, '.harbor', 'workbench-operations', 'diagnostic-active.json'), 'utf8'))
    assert.equal(claim.operationId, accepted.operationId)
    release()
    await settled(winner, accepted.operationId)
    assert.equal(calls.executions.length, 1)
  } finally { release(); await settled(winner, accepted.operationId) }
})
