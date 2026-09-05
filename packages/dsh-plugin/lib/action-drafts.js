import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
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

export class ActionDraftController {
  constructor({ resolve, execute, now = Date.now, ttlMs = 10 * 60_000, maxEntries = 256 }) {
    this.resolve = resolve
    this.execute = execute
    this.now = now
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
    this.drafts = new Map()
    this.previews = new Map()
    this.operations = new Map()
    this.inFlight = new Map()
    this.draftOperations = new Map()
  }
  prune() {
    for (const map of [this.drafts, this.previews]) for (const [id, value] of map) if (value.expiresAtMs <= this.now()) map.delete(id)
    for (const draftId of this.draftOperations.keys()) if (!this.drafts.has(draftId) && !this.inFlight.has(draftId)) this.draftOperations.delete(draftId)
    // Completed journals remain readable on disk; the live Host must not retain
    // every result for its entire lifetime. Never evict an executing operation.
    for (const [id, value] of this.operations) {
      if (this.operations.size <= this.maxEntries) break
      if (['COMPLETED', 'FAILED'].includes(value.operation.status)) this.operations.delete(id)
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
    if (draft.execution === 'requires-registered-runner') blocking.push({ code: 'OFFLINE_RUNNER_NOT_REGISTERED', message: 'This workspace has no registered bounded runner with a materialized Dataset subset, pinned Candidate/Stack, quota and cancellation. No Job can start.' })
    if (draft.kind === 'compare' && basis.refs.object?.kind !== 'harbor.compare/v1') blocking.push({ code: 'COMPARE_PAIR_REQUIRED', message: 'Select an authoritative Baseline/Candidate comparison first.' })
    if (draft.kind === 'evaluator-draft' && !basis.selectedEvidence?.some(item => item.available && item.ref.kind === 'evaluator-source')) blocking.push({ code: 'SAVED_SOURCE_REQUIRED', message: 'Select a saved Evaluator/Rubric fragment first.' })
    const preview = {
      schema: 'harbor-action-preview/v1', previewId: `hpreview_${randomUUID()}`, draftId: draft.draftId,
      contentHash: localObjectDigest(draft), baseRevision: draft.baseRevision,
      selectionDigest: localObjectDigest(draft.selection), target: draft.target, identities: draft.identities,
      risk: draft.risk, mutationSurface: draft.mutationSurface, productionImpact: 'none',
      freshBaselineRequired: draft.freshBaselineRequired, estimatedExternalRequests: draft.execution === 'requires-registered-runner' ? null : 0,
      costEstimate: draft.execution === 'requires-registered-runner' ? 'unavailable — blocked' : 'No external model/evaluation requests',
      blocking, status: blocking.length ? 'BLOCKED' : 'READY_FOR_REVIEW',
      expiresAt: new Date(this.now() + this.ttlMs).toISOString(),
    }
    this.previews.set(preview.previewId, { ...owner, preview, draft, expiresAtMs: this.now() + this.ttlMs })
    return structuredClone(preview)
  }
  async confirm(args, owner) {
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
  async operation(args, owner) {
    if (!/^hop_[a-f0-9-]{36}$/.test(args.operationId ?? '')) error('HARBOR_ACTION_INVALID', 'Invalid operation ID.')
    const cached = this.operations.get(args.operationId)
    if (cached) {
      if (!sameOwner(cached, owner)) error('HARBOR_ACTION_DENIED', 'Operation belongs to another Session.')
      return structuredClone(cached.operation)
    }
    const directory = await journalDirectory(owner.projectRoot, false)
    let operation
    for (const sequence of [1, 2]) {
      const file = path.join(directory, `${args.operationId}.${sequence}.json`)
      try {
        const info = await lstat(file)
        if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024) error('HARBOR_ACTION_STORAGE_UNSAFE', 'Unsafe operation record.')
        operation = JSON.parse(await readFile(file, 'utf8'))
      } catch (e) { if (e.code !== 'ENOENT') throw e }
    }
    if (!operation || operation.sessionId !== owner.sessionId) error('HARBOR_ACTION_DENIED', 'Operation unavailable in this Session.')
    return operation
  }
}
