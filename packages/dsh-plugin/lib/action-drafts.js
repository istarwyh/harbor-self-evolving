import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { localObjectDigest } from './interaction-objects.js'

export const WORKBENCH_ACTIONS = Object.freeze({
  'candidate-draft': Object.freeze({ risk: 'R2', execution: 'draft-only', mutationSurface: 'Candidate' }),
  'evaluator-draft': Object.freeze({ risk: 'R2', execution: 'draft-only', mutationSurface: 'Evaluator/Rubric', freshBaseline: true }),
  compare: Object.freeze({ risk: 'R0', execution: 'read-only', mutationSurface: 'None' }),
  'diagnostic-evaluation': Object.freeze({ risk: 'R1', execution: 'requires-registered-runner', mutationSurface: 'None' }),
  'retry-infrastructure': Object.freeze({ risk: 'R1', execution: 'requires-registered-runner', mutationSurface: 'None' }),
  'gate-request': Object.freeze({ risk: 'R2', execution: 'draft-only', mutationSurface: 'None' }),
  'deployment-handoff': Object.freeze({ risk: 'R2', execution: 'draft-only', mutationSurface: 'None' }),
})

const sameOwner = (entry, owner) => entry.sessionId === owner.sessionId && entry.projectRoot === owner.projectRoot
const error = (code, text) => { throw new Error(`${code}: ${text}`) }
const terminal = status => ['COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(status)
const offline = draft => draft.execution === 'requires-registered-runner'
const TRANSITIONS = { SCHEDULED: ['EXECUTING', 'CANCELLING', 'FAILED', 'CANCELLED'], EXECUTING: ['ACTIVE', 'CANCELLING', 'COMPLETED', 'FAILED', 'CANCELLED'], ACTIVE: ['CANCELLING', 'COMPLETED', 'FAILED', 'CANCELLED'], CANCELLING: ['CANCELLED', 'FAILED'] }

function executionFailure(cause) {
  const code = String(cause?.code ?? cause?.message?.match(/^([A-Z][A-Z0-9_]+):/)?.[1] ?? '')
  return { code: /^HARBOR_[A-Z0-9_]{1,80}$/.test(code) ? code : 'ACTION_EXECUTION_FAILED', message: 'Operation stopped. Inspect its result and prerequisites before preparing another run; no automatic retry was performed.', ...(cause?.cleanupRequired === true ? { cleanupRequired: true, ...(typeof cause.jobName === 'string' && /^diagnostic-[a-f0-9-]{36}$/.test(cause.jobName) ? { jobName: cause.jobName } : {}), cleanupMessage: 'Docker resource cleanup is not verified. The workspace remains locked against further diagnostics until those resources and the claim are explicitly reconciled.' } : {}) }
}

// These directories hold ONLY explicit Workbench draft/operation records.
// Refuse symlinks at every level, including on reconnect reads.
async function journalDirectory(root, create) {
  let current = path.resolve(root)
  for (const segment of ['.harbor', 'workbench-operations']) {
    current = path.join(current, segment)
    if (create) await mkdir(current, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e })
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink()) error('HARBOR_ACTION_STORAGE_UNSAFE', 'Operation storage must be a real project directory.')
  }
  return current
}

async function hasDiagnosticClaim(root) {
  try {
    const directory = await journalDirectory(root, false)
    await lstat(path.join(directory, 'diagnostic-active.json'))
    return true
  } catch (cause) { if (cause.code === 'ENOENT') return false; throw cause }
}

export class ActionDraftController {
  constructor({ resolve, execute, prepare, now = Date.now, ttlMs = 10 * 60_000, maxEntries = 256 }) {
    this.resolve = resolve
    this.execute = execute
    this.prepare = prepare
    this.now = now
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
    this.drafts = new Map()
    this.previews = new Map()
    this.operations = new Map()
    this.inFlight = new Map()
    this.draftOperations = new Map()
    this.tasks = new Map()
    this.projectClaims = new Set()
    this.closed = false
  }
  async dispose() {
    this.closed = true
    await Promise.allSettled([...this.inFlight.values()])
    const tasks = [...this.tasks.values()]
    for (const task of tasks) task.abort.abort()
    await Promise.allSettled(tasks.map(task => task.promise))
  }
  prune() {
    for (const map of [this.drafts, this.previews]) for (const [id, value] of map) if (value.expiresAtMs <= this.now()) map.delete(id)
    for (const draftId of this.draftOperations.keys()) if (!this.drafts.has(draftId) && !this.inFlight.has(draftId)) this.draftOperations.delete(draftId)
    // Completed journals remain readable on disk; the live Host must not retain
    // every result for its entire lifetime. Never evict an executing operation.
    for (const [id, value] of this.operations) {
      if (this.operations.size <= this.maxEntries) break
      if (terminal(value.operation.status)) this.operations.delete(id)
    }
  }
  owned(map, id, owner) {
    this.prune()
    const entry = map.get(id)
    if (!entry) error('HARBOR_ACTION_EXPIRED', 'Draft or preview expired. Prepare a new one.')
    if (!sameOwner(entry, owner)) error('HARBOR_ACTION_DENIED', 'Draft belongs to a different Session/project.')
    return entry
  }
  async propose(args, owner) {
    if (this.closed) error('HARBOR_ACTION_HOST_CLOSED', 'The Host is stopping. Reload after it restarts.')
    this.prune()
    const registration = Object.hasOwn(WORKBENCH_ACTIONS, args.kind) ? WORKBENCH_ACTIONS[args.kind] : undefined
    if (!registration) error('HARBOR_ACTION_UNREGISTERED', 'This action is not registered. Production mutation is disabled.')
    if (this.drafts.size >= this.maxEntries) error('HARBOR_ACTION_CAPACITY', 'Too many pending drafts.')
    const basis = await this.resolve(args.contextSnapshotId, owner)
    if (basis.freshness !== 'FRESH') error('HARBOR_ACTION_REVISION_CONFLICT', 'Rebind the latest object before preparing an action.')
    const actionId = randomUUID()
    const draft = {
      schema: 'harbor-action-draft/v1', draftId: `hdraft_${actionId}`, operationId: `hop_${actionId}`, kind: args.kind,
      risk: registration.risk, execution: registration.execution, mutationSurface: registration.mutationSurface,
      contextSnapshotId: args.contextSnapshotId, baseRevision: basis.basedOn.currentRevision,
      target: basis.refs.object, selection: basis.refs.selection ?? [], identities: basis.context.identities,
      proposal: args.proposal, proposalId: `proposal_${randomUUID()}`, templateVersion: 'harbor-workbench-action/v1',
      freshBaselineRequired: Boolean(registration.freshBaseline), productionImpact: 'none',
      createdAt: new Date(this.now()).toISOString(), expiresAt: new Date(this.now() + this.ttlMs).toISOString(),
    }
    const entry = { ...owner, draft, expiresAtMs: this.now() + this.ttlMs }
    this.drafts.set(draft.draftId, structuredClone(entry))
    return structuredClone(draft)
  }
  async preview(args, owner) {
    const { draft } = this.owned(this.drafts, args.draftId, owner)
    if (this.previews.size >= this.maxEntries) error('HARBOR_ACTION_CAPACITY', 'Too many active previews.')
    const basis = await this.resolve(draft.contextSnapshotId, owner)
    const blocking = []
    if (basis.freshness !== 'FRESH' || basis.basedOn.currentRevision !== draft.baseRevision) blocking.push({ code: 'REVISION_CONFLICT', message: 'The selected evidence changed. Rebind and prepare a new draft.' })
    let prepared
    if (offline(draft)) {
      if (!this.prepare) blocking.push({ code: 'OFFLINE_RUNNER_NOT_REGISTERED', message: 'This workspace has no registered bounded runner. No Job can start.' })
      else if (!blocking.length) {
        prepared = await this.prepare(draft, basis, owner)
        blocking.push(...(prepared.blocking ?? []))
      }
      if (this.projectClaims.has(owner.projectRoot)) blocking.push({ code: 'DIAGNOSTIC_ALREADY_ACTIVE', message: 'A diagnostic is already running in this workspace. Wait for it or cancel it first.' })
      else if (await hasDiagnosticClaim(owner.projectRoot)) blocking.push({ code: 'DIAGNOSTIC_RECOVERY_REQUIRED', message: 'Another Host owns an unfinished diagnostic. Inspect that operation and its processes before preparing another run.' })
    }
    if (draft.kind === 'compare' && basis.refs.object?.kind !== 'harbor.compare/v1') blocking.push({ code: 'COMPARE_PAIR_REQUIRED', message: 'Select an authoritative Baseline/Candidate comparison first.' })
    if (draft.kind === 'evaluator-draft' && !basis.selectedEvidence?.some(item => item.available && item.ref.kind === 'evaluator-source')) blocking.push({ code: 'SAVED_SOURCE_REQUIRED', message: 'Select a saved Evaluator/Rubric fragment first.' })
    const preview = {
      schema: 'harbor-action-preview/v1', previewId: `hpreview_${randomUUID()}`, draftId: draft.draftId,
      contentHash: localObjectDigest(prepared ? { draft, plan: prepared.plan } : draft), baseRevision: draft.baseRevision,
      selectionDigest: localObjectDigest(draft.selection), target: draft.target, identities: draft.identities,
      risk: draft.risk, mutationSurface: draft.mutationSurface, productionImpact: 'none',
      freshBaselineRequired: draft.freshBaselineRequired, estimatedExternalRequests: draft.execution === 'requires-registered-runner' ? null : 0,
      costEstimate: draft.execution === 'requires-registered-runner' ? 'unavailable — blocked' : 'No external model/evaluation requests',
      ...(prepared?.public ?? {}),
      blocking, status: blocking.length ? 'BLOCKED' : 'READY_FOR_REVIEW',
      expiresAt: new Date(this.now() + this.ttlMs).toISOString(),
    }
    this.previews.set(preview.previewId, { ...owner, preview, draft, prepared, expiresAtMs: this.now() + this.ttlMs })
    return structuredClone(preview)
  }
  async confirm(args, owner) {
    if (this.closed) error('HARBOR_ACTION_HOST_CLOSED', 'The Host is stopping. Nothing was started.')
    const entry = this.owned(this.previews, args.previewId, owner)
    if (args.confirmed !== true || args.contentHash !== entry.preview.contentHash || args.expectedRevision !== entry.preview.baseRevision) error('HARBOR_ACTION_CONFIRMATION_REQUIRED', 'Explicit review must match the exact preview hash and revision.')
    if (entry.preview.blocking.length) error('HARBOR_ACTION_BLOCKED', 'Blocking preflight checks prevent execution.')
    const key = entry.draft.draftId
    if (this.inFlight.has(key)) return this.inFlight.get(key)
    const existing = this.draftOperations.get(key)
    if (existing) return this.operation({ operationId: existing }, owner)
    const task = this.commit(entry, owner)
    this.inFlight.set(key, task)
    try { return await task } finally { this.inFlight.delete(key) }
  }
  async commit(entry, owner) {
    const basis = await this.resolve(entry.draft.contextSnapshotId, owner)
    if (basis.freshness !== 'FRESH' || basis.basedOn.currentRevision !== entry.preview.baseRevision) error('HARBOR_ACTION_REVISION_CONFLICT', 'Revision changed after review; no writes were made.')
    if (offline(entry.draft)) {
      const fresh = await this.prepare(entry.draft, basis, owner)
      if (fresh.blocking?.length) error('HARBOR_ACTION_BLOCKED', 'The runner prerequisites changed. Preview again; nothing was started.')
      if (localObjectDigest({ draft: entry.draft, plan: fresh.plan }) !== entry.preview.contentHash) error('HARBOR_ACTION_REVISION_CONFLICT', 'The diagnostic scope or identities changed. Preview again; nothing was started.')
      if (this.projectClaims.has(owner.projectRoot)) error('HARBOR_ACTION_CAPACITY', 'Only one diagnostic may run in a workspace at a time.')
      this.projectClaims.add(owner.projectRoot)
      try { return await this.schedule(entry, basis, owner) }
      catch (cause) { this.projectClaims.delete(owner.projectRoot); throw cause }
    }
    const operationId = entry.draft.operationId
    const operation = { schema: 'harbor-operation/v1', operationId, draftId: entry.draft.draftId, causationId: entry.draft.proposalId, sessionId: owner.sessionId, status: 'EXECUTING', risk: entry.draft.risk, kind: entry.draft.kind, baseRevision: entry.draft.baseRevision, contentHash: entry.preview.contentHash, contextSnapshotId: entry.draft.contextSnapshotId, createdAt: new Date(this.now()).toISOString(), events: [] }
    const directory = await journalDirectory(owner.projectRoot, true)
    operation.previewId = entry.preview.previewId
    operation.selectionDigest = entry.preview.selectionDigest
    operation.actor = { sessionId: owner.sessionId, role: 'local-workspace-user', approval: 'explicit-preview-confirmation' }
    operation.target = entry.draft.target
    const record = async (status, result) => {
      const event = { eventId: `${operationId}:${operation.events.length + 1}`, sequence: operation.events.length + 1, status, at: new Date(this.now()).toISOString(), ...(result ? { result } : {}) }
      const next = { ...operation, status, events: [...operation.events, event] }
      await writeFile(path.join(directory, `${operationId}.${event.sequence}.json`), JSON.stringify(next, null, 2), { flag: 'wx', mode: 0o600 })
      Object.assign(operation, next)
      this.operations.set(operationId, { ...owner, operation })
      this.prune()
    }
    await record('EXECUTING')
    entry.operationId = operationId
    this.draftOperations.set(entry.draft.draftId, operationId)
    try {
      const result = await this.execute(entry.draft, basis, owner)
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 64 * 1024) error('HARBOR_ACTION_RESULT_TOO_LARGE', 'Operation result exceeds its journal budget.')
      await record('COMPLETED', result)
    } catch {
      await record('FAILED', { code: 'ACTION_EXECUTION_FAILED', message: 'Operation failed. Inspect the operation; no automatic retry was performed.' })
    }
    return structuredClone(operation)
  }

  async schedule(entry, basis, owner) {
    if (this.closed) error('HARBOR_ACTION_HOST_CLOSED', 'The Host is stopping. Nothing was started.')
    const operationId = entry.draft.operationId
    const directory = await journalDirectory(owner.projectRoot, true)
    const operation = { schema: 'harbor-operation/v1', operationId, draftId: entry.draft.draftId, causationId: entry.draft.proposalId, sessionId: owner.sessionId, kind: entry.draft.kind, risk: entry.draft.risk, baseRevision: entry.draft.baseRevision, contentHash: entry.preview.contentHash, contextSnapshotId: entry.draft.contextSnapshotId, selectionDigest: entry.preview.selectionDigest, target: entry.draft.target, previewId: entry.preview.previewId, actor: { sessionId: owner.sessionId, role: 'local-workspace-user', approval: 'explicit-preview-confirmation' }, diagnosticOnly: true, limits: entry.preview.limits, createdAt: new Date(this.now()).toISOString(), events: [] }
    const abort = new AbortController()
    let writes = Promise.resolve()
    const record = (status, result) => {
      const nextWrite = writes.then(async () => {
        if (terminal(operation.status)) return
        if (operation.status === status || (operation.status === 'CANCELLING' && status === 'ACTIVE')) return
        if (operation.status && !TRANSITIONS[operation.status]?.includes(status)) error('HARBOR_ACTION_STATE_INVALID', 'Operation transition is not allowed.')
        if (result && Buffer.byteLength(JSON.stringify(result), 'utf8') > 64 * 1024) error('HARBOR_ACTION_RESULT_TOO_LARGE', 'Operation result exceeds its journal budget.')
        const sequence = operation.events.length + 1
        const event = { eventId: `${operationId}:${sequence}`, sequence, status, at: new Date(this.now()).toISOString(), ...(result ? { result } : {}) }
        const next = { ...operation, status, ...(result?.cleanupRequired ? { cleanupRequired: true } : {}), events: [...operation.events, event] }
        // Sequence 1 is the exclusive durable claim. No runner is invoked if
        // it exists already, even in another Host/controller instance.
        await writeFile(path.join(directory, `${operationId}.${sequence}.json`), JSON.stringify(next, null, 2), { flag: 'wx', mode: 0o600 })
        Object.assign(operation, next)
        this.operations.set(operationId, { ...owner, operation })
      })
      writes = nextWrite.catch(() => {})
      return nextWrite
    }
    const claimFile = path.join(directory, 'diagnostic-active.json')
    await writeFile(claimFile, JSON.stringify({ operationId, sessionId: owner.sessionId }), { flag: 'wx', mode: 0o600 }).catch(cause => {
      if (cause.code === 'EEXIST') error('HARBOR_ACTION_RECOVERY_REQUIRED', 'A diagnostic is already claimed in this workspace. Inspect it; no new run was started.')
      throw cause
    })
    try { await record('SCHEDULED') }
    catch (cause) { await unlink(claimFile); throw cause }
    this.draftOperations.set(entry.draft.draftId, operationId)
    const task = { ...owner, abort, record, operation, promise: undefined }
    this.tasks.set(operationId, task)
    task.promise = (async () => {
      try {
        abort.signal.throwIfAborted()
        await record('EXECUTING')
        const result = await this.execute(entry.draft, basis, owner, { plan: entry.prepared.plan, operationId, signal: abort.signal, onSpawn: (_pid, checkpoint) => record('ACTIVE', { jobName: checkpoint.job, diagnosticOnly: true, processStarted: true }) })
        await record(abort.signal.aborted ? 'CANCELLED' : 'COMPLETED', result)
      } catch (cause) {
        await record(abort.signal.aborted ? 'CANCELLED' : 'FAILED', executionFailure(cause))
      }
    })().catch(() => {
      // A journal failure is not success. Terminate the owned work and retain a
      // visible recovery state; never launch a replacement automatically.
      abort.abort()
      operation.status = 'INTERRUPTED'
      operation.recoveryRequired = true
    }).finally(async () => {
      // A crash/interrupted journal retains the claim for explicit recovery.
      // Only this invocation's successfully settled claim can be removed.
      if (terminal(operation.status) && operation.status !== 'INTERRUPTED' && !operation.cleanupRequired) {
        try {
          const info = await lstat(claimFile)
          const claim = !info.isSymbolicLink() && info.isFile() && info.size < 1024 ? JSON.parse(await readFile(claimFile, 'utf8')) : undefined
          if (claim?.operationId === operationId && claim?.sessionId === owner.sessionId) await unlink(claimFile)
        } catch { operation.recoveryRequired = true }
      }
      this.tasks.delete(operationId)
      this.projectClaims.delete(owner.projectRoot)
      this.prune()
    })
    return structuredClone(operation)
  }

  async cancel(args, owner) {
    const operation = await this.operation(args, owner)
    if (terminal(operation.status)) return operation
    const task = this.tasks.get(args.operationId)
    if (!task || !sameOwner(task, owner)) error('HARBOR_ACTION_RECOVERY_REQUIRED', 'The original runner is not owned by this Host; inspect it before starting another run.')
    // Abort synchronously before queuing the event. The executor must await
    // process-tree termination and close its model lease before settling.
    task.abort.abort()
    if (task.operation.status !== 'CANCELLING') await task.record('CANCELLING')
    return structuredClone(task.operation)
  }
  async operation(args, owner) {
    if (!/^hop_[a-f0-9-]{36}$/.test(args.operationId ?? '')) error('HARBOR_ACTION_INVALID', 'Invalid operation ID.')
    const cached = this.operations.get(args.operationId)
    if (cached) {
      if (!sameOwner(cached, owner)) error('HARBOR_ACTION_DENIED', 'Operation belongs to another Session.')
      return structuredClone(cached.operation)
    }
    const directory = await journalDirectory(owner.projectRoot, false)
    let operation
    for (let sequence = 1; sequence <= 32; sequence += 1) {
      const file = path.join(directory, `${args.operationId}.${sequence}.json`)
      try {
        const info = await lstat(file)
        if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024) error('HARBOR_ACTION_STORAGE_UNSAFE', 'Unsafe operation record.')
        operation = JSON.parse(await readFile(file, 'utf8'))
      } catch (e) { if (e.code !== 'ENOENT') throw e; break }
    }
    if (!operation || operation.sessionId !== owner.sessionId) error('HARBOR_ACTION_DENIED', 'Operation unavailable in this Session.')
    if (!terminal(operation.status)) return { ...operation, status: 'INTERRUPTED', recoveryRequired: true, recoveryMessage: 'Host execution ownership was lost. Inspect the existing Job and containers; this operation will not be resumed or retried automatically.' }
    return operation
  }
}
