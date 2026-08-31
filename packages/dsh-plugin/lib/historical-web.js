import { randomUUID } from 'node:crypto'

const OPERATION_RETENTION_MS = 60 * 60 * 1000

function timestamp(now) {
  const value = now()
  return value instanceof Date ? value : new Date(value)
}

function publicError(error) {
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw
    .replace(/(?:\/[A-Za-z0-9._ -]+){2,}/g, '[local path]')
    .replace(/[A-Za-z]:\\[^\s]+/g, '[local path]')
  const match = message.match(/^([A-Z][A-Z0-9_]+):\s*(.*)$/s)
  return {
    code: match?.[1] ?? 'HISTORICAL_JOB_FAILED',
    message: match?.[2] || message || 'Historical evaluation failed',
  }
}

function publicOperation(value) {
  if (!value) return { status: 'idle' }
  return {
    schemaVersion: 1,
    operationId: value.operationId,
    workspace: value.workspace,
    status: value.status,
    selectedCount: value.selectedCount,
    createdAt: value.createdAt,
    ...(value.startedAt ? { startedAt: value.startedAt } : {}),
    ...(value.finishedAt ? { finishedAt: value.finishedAt } : {}),
    ...(value.jobName ? { jobName: value.jobName } : {}),
    ...(value.error ? { error: value.error } : {}),
  }
}

/** Same-origin Web orchestration for the narrow Historical Session diagnostic path. */
export class HistoricalWebController {
  constructor({
    service,
    sessionDiagnostic,
    now = () => new Date(),
    randomId = () => randomUUID(),
    schedule = callback => queueMicrotask(callback),
    operationRetentionMs = OPERATION_RETENTION_MS,
  }) {
    this.service = service
    this.sessionDiagnostic = sessionDiagnostic
    this.now = now
    this.randomId = randomId
    this.schedule = schedule
    this.operationRetentionMs = operationRetentionMs
    this.previews = new Map()
    this.operations = new Map()
    this.consumedPreviews = new Map()
  }

  _cleanup() {
    const now = timestamp(this.now).getTime()
    for (const [previewId, preview] of this.previews) {
      if (Date.parse(preview.expiresAt) <= now) this.previews.delete(previewId)
    }
    for (const [operationId, operation] of this.operations) {
      if (operation.finishedAt && Date.parse(operation.finishedAt) + this.operationRetentionMs <= now) {
        this.operations.delete(operationId)
      }
    }
    for (const [previewId, operationId] of this.consumedPreviews) {
      if (!this.operations.has(operationId)) this.consumedPreviews.delete(previewId)
    }
  }

  _activeOperation(workspace) {
    return [...this.operations.values()]
      .filter(item => item.workspace === workspace && ['queued', 'running'].includes(item.status))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
  }

  async preview(args = {}) {
    this._cleanup()
    const resolved = await this.service.historicalWorkspace({ workspace: args.workspace })
    const previewId = this.randomId()
    const identity = {
      projectRoot: resolved.projectRoot,
      ownerSessionId: `web-historical:${this.randomId()}`,
    }
    const preview = await this.sessionDiagnostic.previewWithIdentity({
      limit: args.limit === undefined ? 10 : args.limit,
      createdAfter: args.createdAfter,
      includeFeedback: args.includeFeedback !== false,
    }, identity, { config: resolved.config })
    const { selectionToken, ...visible } = preview
    this.previews.set(previewId, {
      previewId,
      workspace: resolved.workspace,
      identity,
      config: resolved.config,
      selectionToken,
      selectedCount: preview.selected.length,
      expiresAt: preview.expiresAt,
    })
    return {
      ...visible,
      schemaVersion: 1,
      previewId,
      workspace: resolved.workspace,
    }
  }

  async run(args = {}) {
    this._cleanup()
    const previewId = String(args.previewId ?? '')
    if (!previewId) throw new Error('HISTORICAL_PREVIEW_REQUIRED: preview the recent Sessions before confirming the Job')
    const existingOperationId = this.consumedPreviews.get(previewId)
    if (existingOperationId) {
      const existing = this.operations.get(existingOperationId)
      if (args.workspace && existing?.workspace !== args.workspace) {
        throw new Error('HISTORICAL_PREVIEW_WORKSPACE_MISMATCH: the workspace changed; preview again')
      }
      return publicOperation(existing)
    }
    const preview = this.previews.get(previewId)
    if (!preview) throw new Error('HISTORICAL_PREVIEW_INVALID: this preview expired or was already discarded; preview again')
    if (args.workspace && preview.workspace !== args.workspace) {
      throw new Error('HISTORICAL_PREVIEW_WORKSPACE_MISMATCH: the workspace changed; preview again')
    }
    const active = this._activeOperation(preview.workspace)
    if (active) {
      throw new Error('HISTORICAL_JOB_ALREADY_RUNNING: wait for the current Historical Session Job to finish')
    }
    const operationId = this.randomId()
    const createdAt = timestamp(this.now).toISOString()
    const operation = {
      operationId,
      workspace: preview.workspace,
      status: 'queued',
      selectedCount: preview.selectedCount,
      createdAt,
    }
    this.previews.delete(previewId)
    this.operations.set(operationId, operation)
    this.consumedPreviews.set(previewId, operationId)
    this.schedule(() => { void this._execute(operation, preview) })
    return publicOperation(operation)
  }

  async _execute(operation, preview) {
    operation.status = 'running'
    operation.startedAt = timestamp(this.now).toISOString()
    try {
      const result = await this.sessionDiagnostic.runWithIdentity({
        selectionToken: preview.selectionToken,
      }, preview.identity, { config: preview.config })
      operation.status = 'completed'
      operation.jobName = String(result.job ?? '').split(/[\\/]/).filter(Boolean).at(-1)
      if (!operation.jobName) throw new Error('HISTORICAL_JOB_INCOMPLETE: the completed run returned no Job identity')
    } catch (error) {
      operation.status = 'failed'
      operation.error = publicError(error)
    } finally {
      operation.finishedAt = timestamp(this.now).toISOString()
    }
  }

  operation(args = {}) {
    this._cleanup()
    const operationId = String(args.operationId ?? '')
    if (operationId) {
      const operation = this.operations.get(operationId)
      if (!operation) return { status: 'idle' }
      if (args.workspace && operation.workspace !== args.workspace) {
        throw new Error('HISTORICAL_OPERATION_WORKSPACE_MISMATCH: the operation belongs to another workspace')
      }
      return publicOperation(operation)
    }
    if (!args.workspace) return { status: 'idle' }
    return publicOperation(this._activeOperation(String(args.workspace)))
  }
}
